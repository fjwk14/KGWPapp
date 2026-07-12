// 試合当日フローの受け入れ検証。
//   試合前: 最低限の情報で登録 → そのままスタッツ入力へ
//   試合中: リアルタイム記録 → 試合終了でスコア・勝敗を自動反映
//   試合後: 動画を後日クオーター単位で添付 → クリップが動画に紐づく
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const SHOT = process.env.E2E_SHOT_DIR ?? "/tmp/matchday-shots";
const uniq = Date.now();
const email = `matchday_${uniq}@example.com`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
// 試合終了のconfirmは常に承認
page.on("dialog", (d) => d.accept());

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

let matchUrl = "";

try {
  await step("準備: サインアップ→チーム作成", async () => {
    await page.goto(`${BASE}/login?mode=signup`);
    await page.fill("#name", "当日フロー管理者");
    await page.fill("#email", email);
    await page.fill("#password", "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/onboarding");
    await page.click("summary:has-text('新しくチームを作る')");
    await page.fill("#name", "当日フロー部");
    await page.fill("#slug", `md${uniq}`);
    await page.click('button:has-text("チームを作成")');
    await page.waitForURL("**/dashboard");
  });

  await step("試合前: 最低限入力→そのままスタッツ入力へ直行", async () => {
    await page.goto(`${BASE}/matches/new`);
    await page.fill("#title", "当日フロー検証試合");
    await page.fill("#opponent", "Y大学");
    await page.click('button:has-text("登録してそのまま試合記録へ")');
    await page.waitForURL(/\/matches\/[0-9a-f-]+\/live$/);
    matchUrl = page.url().replace(/\/live$/, "");
    await page.waitForSelector("text=出場メンバーを選択");
  });

  await step("試合中: メンバー選択→記録(1-1)", async () => {
    await page
      .locator("li", { hasText: "当日フロー管理者" })
      .locator("button")
      .first()
      .click();
    await page.click('button:has-text("この1人で開始")');
    await page.waitForSelector('[data-testid="score"]');
    // 自チーム得点(3タップ)
    await page.click('button:has-text("当日フロー管理者")');
    await page.click('button:has-text("センター")');
    await page.waitForTimeout(350);
    await page.click('button:has-text("◯ゴール")');
    await page.waitForTimeout(400);
    // 相手得点(GK不在時のチームイベント)
    await page.click('button:has-text("相手得点")');
    await page.waitForTimeout(400);
    const score = (await page.textContent('[data-testid="score"]')).replace(/\s/g, "");
    if (score !== "1-1") throw new Error(`スコアが1-1でない: ${score}`);
  });

  await step("試合終了: スコア・勝敗が試合情報に自動反映される", async () => {
    await page.click('[data-testid="finish-match"]');
    await page.waitForURL(/\/scoresheet$/);
    await page.goto(matchUrl);
    const body = (await page.textContent("body")).replace(/\s+/g, " ");
    if (!body.includes("1 - 1")) throw new Error("スコア1-1が試合詳細に出ない");
    if (!body.includes("引き分け")) throw new Error("勝敗(引き分け)が反映されない");
    if (!body.includes("Q1 1-1")) throw new Error("Q別スコア(Q1 1-1)が反映されない");
    await page.screenshot({ path: `${SHOT}/01-after-finish.png`, fullPage: true });
  });

  await step("編集画面からQ別スコアを手動修正できる", async () => {
    await page.click("text=✏️ 編集");
    await page.waitForURL(/\/matches\/[0-9a-f-]+\/edit$/);
    // 試合終了で自動記入されたQ1が復元されている
    const q1for = await page.inputValue('input[name="q1_for"]');
    if (q1for !== "1") throw new Error(`Q1得点の初期値が1でない: ${q1for}`);
    // Q2を手動で追記
    await page.fill('input[name="q2_for"]', "3");
    await page.fill('input[name="q2_against"]', "2");
    await page.click('button:has-text("保存する")');
    await page.waitForURL(/\/matches\/[0-9a-f-]+$/);
    const body = (await page.textContent("body")).replace(/\s+/g, " ");
    if (!body.includes("Q2 3-2")) throw new Error("手動のQ2スコアが反映されない");
  });

  await step("試合後: Q1動画を後付けできる", async () => {
    await page.selectOption('select[name="quarter"]', "1");
    await page.fill('input[name="url"]', "https://www.youtube.com/watch?v=flowq1");
    await page.click('form:has(input[name="url"]) button:has-text("追加")');
    await page.waitForSelector("text=試合動画(1本)");
    const body = await page.textContent("body");
    if (!body.includes("Q1")) throw new Error("Q1ラベルが表示されない");
    await page.screenshot({ path: `${SHOT}/02-video-added.png`, fullPage: true });
  });

  await step("クリップがQ1動画に紐づき、該当場面リンクが正しい", async () => {
    await page.click("text=+ クリップ作成");
    await page.waitForURL(/\/clips\/new$/);
    // 動画セレクタにQ1動画がデフォルト選択されている
    const selected = await page
      .locator("#video_id option:checked")
      .textContent();
    if (!selected.includes("Q1")) throw new Error(`動画の初期選択がQ1でない: ${selected}`);
    await page.fill('[name="title"]', "Q1のいい守備");
    await page.fill('[name="start_min"]', "0");
    await page.fill('[name="start_sec"]', "30");
    await page.fill('[name="end_min"]', "0");
    await page.fill('[name="end_sec"]', "50");
    await page.click('button:has-text("クリップを登録")');
    await page.waitForURL(/\/clips\/[0-9a-f-]+$/);
    const href = await page.getAttribute(
      'a:has-text("該当場面を動画で開く")',
      "href"
    );
    if (!href?.includes("flowq1")) throw new Error(`リンクがQ1動画でない: ${href}`);
    if (!href?.includes("t=30s")) throw new Error(`t=30sが無い: ${href}`);
    const body = await page.textContent("body");
    if (!body.includes("Q1")) throw new Error("クリップ詳細にQ1表示が無い");
    await page.screenshot({ path: `${SHOT}/03-clip-linked.png`, fullPage: true });
  });

  await step("試合一覧に動画本数が表示される", async () => {
    await page.goto(`${BASE}/matches`);
    await page.waitForSelector("text=🎥 動画1本");
  });

  console.log(`\n=== 試合当日フロー検証: ${ok}/${total} passed ===`);
  await browser.close();
  process.exit(ok === total ? 0 : 1);
} catch {
  await page
    .screenshot({ path: `${SHOT}/failure.png`, fullPage: true })
    .catch(() => {});
  console.log(`\n=== 試合当日フロー検証: ${ok}/${total} passed (中断) ===`);
  await browser.close();
  process.exit(1);
}
