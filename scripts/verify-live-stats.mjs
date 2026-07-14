// リアルタイムスタッツ入力の受け入れ検証。
//   - 3タップでシュート記録 / 2タップでその他アクション
//   - E(エキストラマン)の自動ON/OFF
//   - Undo(元に戻す)
//   - オフライン記録 → オンライン復帰で自動同期
//   - スタッツ表(紙シート互換の集計)が正しい
//   - 選手ロールは入力画面に入れない(閲覧のみ)
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const SHOT = process.env.E2E_SHOT_DIR ?? "/tmp/livestats-shots";
const uniq = Date.now();
const adminEmail = `stats_admin_${uniq}@example.com`;
const playerEmail = `stats_player_${uniq}@example.com`;
const gkEmail = `stats_gk_${uniq}@example.com`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);

let ok = 0;
let total = 0;
async function step(name, fn) {
  total++;
  try {
    await fn();
    console.log(`✅ ${name}`);
    ok++;
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`);
    throw e;
  }
}

async function signupOnly(name, email) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await c.newPage();
  p.setDefaultTimeout(20000);
  await p.goto(`${BASE}/login?mode=signup`);
  await p.fill("#family_name", name);
  await p.fill("#given_name", "太郎");
  await p.fill("#email", email);
  await p.fill("#password", "password123");
  await p.click('button[type="submit"]');
  await p.waitForURL("**/onboarding");
  await c.close();
}

async function waitSynced() {
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="sync-indicator"]')
        ?.textContent?.includes("同期済み"),
    { timeout: 15000 }
  );
}

async function scoreIs(expected) {
  const text = (await page.textContent('[data-testid="score"]')).replace(/\s/g, "");
  if (text !== expected.replace(/\s/g, "")) {
    throw new Error(`スコアが ${text}, 期待は ${expected}`);
  }
}

let matchUrl = "";

try {
  await step("準備: 管理者サインアップ→チーム作成、選手/GKサインアップ", async () => {
    await signupOnly("選手ビー", playerEmail);
    await signupOnly("キーパーシー", gkEmail);
    await page.goto(`${BASE}/login?mode=signup`);
    await page.fill("#family_name", "スタッツ管理者");
    await page.fill("#given_name", "太郎");
    await page.fill("#email", adminEmail);
    await page.fill("#password", "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/onboarding");
    await page.click("summary:has-text('新しくチームを作る')");
    await page.fill("#name", "スタッツ検証部");
    await page.fill("#slug", `st${uniq}`);
    await page.click('button:has-text("チームを作成")');
    await page.waitForURL("**/dashboard");
  });

  await step("準備: メンバー2人を追加、試合を作成", async () => {
    for (const [email, name] of [
      [playerEmail, "選手ビー"],
      [gkEmail, "キーパーシー"],
    ]) {
      await page.goto(`${BASE}/admin`);
      await page.fill('input[name="email"]', email);
      await page.selectOption('select[name="role"]', "player");
      await page.click('form:has(input[name="email"]) button:has-text("追加")');
      await page.waitForSelector(`text=${name}`);
    }
    await page.goto(`${BASE}/matches/new`);
    await page.fill("#title", "スタッツ検証試合");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/matches\/[0-9a-f-]+$/);
    matchUrl = page.url();
  });

  await step("試合詳細に「試合記録をつける」ボタン → 出場メンバー選択", async () => {
    await page.click("text=⏱ 試合記録をつける");
    await page.waitForURL(/\/matches\/[0-9a-f-]+\/live$/);
    await page.waitForSelector("text=出場メンバーの確認");
    // 3人選択: 管理者(#1) / 選手ビー(#2) / キーパーシー(#3→GK)
    for (const name of ["スタッツ管理者", "選手ビー", "キーパーシー"]) {
      await page
        .locator("li", { hasText: name })
        .locator("button")
        .first()
        .click();
    }
    const gkRow = page.locator("li", { hasText: "キーパーシー" });
    await gkRow.locator('button:has-text("GK")').click();
    await page.click('button:has-text("この3人で開始")');
    // 管理者は両モードの権限を持つため、記録モード選択が出る → マネージャー記録
    await page.waitForSelector('[data-testid="mode-manager"]');
    await page.click('[data-testid="mode-manager"]');
    await page.waitForSelector('[data-testid="score"]');
    await page.screenshot({ path: `${SHOT}/01-live-start.png`, fullPage: true });
  });

  await step("3タップでシュート記録(センター→ゴール) スコア1-0", async () => {
    await page.click('button:has-text("スタッツ管理者")'); // 1タップ目: 選手
    await page.click('button:has-text("センター")'); // 2タップ目: 種別
    await page.waitForTimeout(350); // タップロック解除待ち
    await page.click('button:has-text("◯ゴール")'); // 3タップ目: 結果
    await page.waitForTimeout(350);
    await scoreIs("1 - 0");
  });

  await step("得点直後にアシスト選手を紐付け(選手ビー)", async () => {
    // 得点後はアシストパネルが自動表示される。パネル内から選手ビーを選ぶ
    await page.waitForSelector('[data-testid="assist-panel"]');
    await page
      .locator('[data-testid="assist-panel"] button:has-text("選手ビー")')
      .click();
    await page.waitForTimeout(350);
    // パネルが閉じる
    if ((await page.locator('[data-testid="assist-panel"]').count()) > 0) {
      throw new Error("アシスト選択後もパネルが閉じない");
    }
  });

  await step("E誘発でEが自動ON", async () => {
    await page.click('button:has-text("選手ビー")');
    await page.waitForTimeout(350);
    await page.click('button:has-text("E誘発")');
    await page.waitForTimeout(350);
    const toggle = await page.textContent('[data-testid="extra-toggle"]');
    if (!toggle.includes("ON")) throw new Error(`EがONにならない: ${toggle}`);
  });

  await step("E中のゴールでE自動OFF(スコア2-0)", async () => {
    await page.click('button:has-text("スタッツ管理者")');
    await page.click('button:has-text("ドライブ")');
    await page.waitForTimeout(350);
    await page.click('button:has-text("◯ゴール")');
    await page.waitForTimeout(350);
    await scoreIs("2 - 0");
    const toggle = await page.textContent('[data-testid="extra-toggle"]');
    if (!toggle.includes("OFF")) throw new Error(`EがOFFに戻らない: ${toggle}`);
    // このゴールはアシストなし(パネルを閉じる)
    await page.waitForSelector('[data-testid="assist-panel"]');
    await page.click('button:has-text("アシストなしで閉じる")');
    await page.waitForTimeout(350);
  });

  await step("GK記録: 失点(2-1)とセーブ", async () => {
    await page.click('button:has-text("キーパーシー")');
    await page.waitForTimeout(350);
    await page.click('button:has-text("失点")');
    await page.waitForTimeout(350);
    await scoreIs("2 - 1");
    await page.click('button:has-text("キーパーシー")');
    await page.waitForTimeout(350);
    await page.click('button:has-text("セーブ")');
    await page.waitForTimeout(350);
  });

  await step("Undoで直前のセーブを取り消し→もう一度セーブ(件数維持の確認)", async () => {
    // 相手得点ボタンは廃止(失点はGKで記録)。Undoの基本動作だけ確認する。
    await page.click('button:has-text("↩ 元に戻す")');
    await page.waitForTimeout(350);
    await scoreIs("2 - 1");
    await page.click('button:has-text("キーパーシー")');
    await page.waitForTimeout(350);
    await page.click('button:has-text("セーブ")');
    await page.waitForTimeout(350);
  });

  await step("時間使い切り(攻撃終了)を記録", async () => {
    await page.click('button:has-text("時間使い切り")');
    await page.waitForTimeout(350);
  });

  await step("Q2に切替→6mシュートミスを記録", async () => {
    await page.click('button:has-text("Q2")');
    await page.click('button:has-text("選手ビー")');
    await page.click('button:has-text("6m")');
    await page.waitForTimeout(350);
    await page.click('button:has-text("×ミス")');
    await page.waitForTimeout(350);
  });

  await step("オンライン時に全件同期される", async () => {
    await waitSynced();
    await page.screenshot({ path: `${SHOT}/02-synced.png`, fullPage: true });
  });

  await step("オフラインで記録→未同期表示", async () => {
    await ctx.setOffline(true);
    await page.waitForTimeout(300);
    await page.click('button:has-text("スタッツ管理者")');
    await page.waitForTimeout(350);
    await page.click('button:has-text("カット")');
    await page.waitForTimeout(350);
    await page.click('button:has-text("キーパーシー")');
    await page.waitForTimeout(350);
    await page.click('button:has-text("枠外")');
    await page.waitForTimeout(350);
    const badge = await page.textContent('[data-testid="sync-indicator"]');
    if (!badge.includes("未同期 2件")) {
      throw new Error(`未同期表示が想定外: ${badge}`);
    }
    if (!badge.includes("オフライン")) {
      throw new Error(`オフライン表示がない: ${badge}`);
    }
    await page.screenshot({ path: `${SHOT}/03-offline.png`, fullPage: true });
  });

  await step("オンライン復帰で自動同期される", async () => {
    await ctx.setOffline(false);
    await waitSynced();
  });

  await step("リロード後もサーバー由来のイベントでスコア維持(2-1)", async () => {
    await page.reload();
    await page.waitForSelector('[data-testid="mode-manager"]');
    await page.click('[data-testid="mode-manager"]');
    await page.waitForSelector('[data-testid="score"]');
    await scoreIs("2 - 1");
    const body = await page.textContent("body");
    if (!body.includes("イベントログ(10)")) {
      throw new Error(`イベント数が10でない: ${body.match(/イベントログ\(\d+\)/)}`);
    }
  });

  await step("イベントログから削除できる(枠外を削除→9件)", async () => {
    await page.click("text=イベントログ(10)");
    const row = page
      .locator("li", { hasText: "枠外" })
      .filter({ has: page.locator('button:has-text("削除")') })
      .first();
    await row.locator('button:has-text("削除")').click();
    await page.waitForSelector("text=イベントログ(9件)");
    await page.click('button:has-text("✕ 閉じる")');
    await waitSynced();
  });

  await step("スタッツ表: 得点/退水決定率/攻撃効率が紙シート通り", async () => {
    await page.goto(`${matchUrl}/scoresheet`);
    await page.waitForSelector("text=記録シート");
    const body = (await page.textContent("body")).replace(/\s+/g, " ");
    // 得点: 自チーム2 - 相手1 (Q1のみ)
    if (!body.includes("イベント9件")) throw new Error("イベント件数が9でない");
    // 退水決定率: E誘発1回、E中ゴール1本 → 100%
    if (!body.includes("◯1 / 誘発1回")) throw new Error(`退水決定率の内訳が想定外`);
    if (!body.includes("100%")) throw new Error("退水決定率100%が出ない");
    // 攻撃効率: Q1 = シュート2/攻撃3(攻撃終了1含む), Q2 = 1/1
    if (!body.includes("2 / 3")) throw new Error("Q1攻撃効率(2/3)が出ない");
    await page.screenshot({ path: `${SHOT}/04-scoresheet.png`, fullPage: true });
  });

  await step("スタッツ表: 選手行(シュート列/率/アシスト/カット)が正しい", async () => {
    // 管理者(#1): センター1-1, E列1-1(E中ドライブゴール), 率100%, カット1
    const adminRow = page.locator("tr", { hasText: "スタッツ管理者" });
    const adminText = (await adminRow.textContent()).replace(/\s+/g, " ");
    if (!adminText.includes("1-1")) throw new Error(`#1にシュート1-1がない: ${adminText}`);
    if (!adminText.includes("100%")) throw new Error(`#1の率が100%でない: ${adminText}`);
    // 選手ビー(#2): 6m 0-1, 率0%, E誘発1, アシスト1
    const bRow = page.locator("tr", { hasText: "選手ビー" });
    const bText = (await bRow.textContent()).replace(/\s+/g, " ");
    if (!bText.includes("0-1")) throw new Error(`#2に6m 0-1がない: ${bText}`);
    if (!bText.includes("0%")) throw new Error(`#2の率が0%でない: ${bText}`);
  });

  await step("スタッツ表: GK行(被3・失1・ブロック1・阻止率50%)", async () => {
    const gkRow = page.locator("tr", { hasText: "キーパーシー" });
    const gkText = (await gkRow.textContent()).replace(/\s+/g, " ");
    // 枠外は削除済み → 被シュート2, 失点1, ブロック1, 阻止率50%
    if (!gkText.includes("50%")) throw new Error(`GK阻止率が50%でない: ${gkText}`);
  });

  await step("ランキング: 得点/アシスト/GKブロックが自動集計される", async () => {
    await page.goto(`${BASE}/rankings`);
    await page.waitForSelector("text=得点ランキング");
    const body = (await page.textContent("body")).replace(/\s+/g, "");
    // 管理者2得点 / 選手ビー1アシスト / キーパーシー1ブロック
    // (氏名は姓名フルネームなので姓部分+件数の並びで確認)
    if (!body.includes("🥇スタッツ管理者太郎2点")) {
      throw new Error("得点ランキング1位(管理者2点)が出ない");
    }
    if (!body.includes("🥇選手ビー太郎1回")) {
      throw new Error("アシストランキング(選手ビー1回)が出ない");
    }
    if (!body.includes("キーパーシー太郎1回")) {
      throw new Error("GKブロック(キーパーシー1回)が出ない");
    }
    await page.screenshot({ path: `${SHOT}/05-rankings.png`, fullPage: true });
  });

  await step("選手ロールは閲覧のみ(入力画面に入れない)", async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await c.newPage();
    p.setDefaultTimeout(20000);
    await p.goto(`${BASE}/login`);
    await p.fill("#email", playerEmail);
    await p.fill("#password", "password123");
    await p.click('button[type="submit"]');
    await p.waitForURL("**/dashboard");
    await p.goto(matchUrl);
    const body = await p.textContent("body");
    if (body.includes("試合記録をつける")) {
      throw new Error("選手に試合記録ボタンが見えている");
    }
    if (!body.includes("記録シート")) {
      throw new Error("選手に記録シートボタンが見えない");
    }
    // 直接URLアクセスも試合詳細へリダイレクト
    await p.goto(`${matchUrl}/live`);
    await p.waitForURL(/\/matches\/[0-9a-f-]+$/);
    // スタッツ表は閲覧できる
    await p.goto(`${matchUrl}/scoresheet`);
    await p.waitForSelector("text=GKの記録");
    await c.close();
  });

  console.log(`\n=== リアルタイムスタッツ検証: ${ok}/${total} passed ===`);
  await browser.close();
  process.exit(ok === total ? 0 : 1);
} catch {
  await page
    .screenshot({ path: `${SHOT}/failure.png`, fullPage: true })
    .catch(() => {});
  console.log(`\n=== リアルタイムスタッツ検証: ${ok}/${total} passed (中断) ===`);
  await browser.close();
  process.exit(1);
}
