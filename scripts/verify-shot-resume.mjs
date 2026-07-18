// シュート結果5択 + 記録の中断/再開の受け入れ検証。
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const SHOT = process.env.E2E_SHOT_DIR ?? "/tmp/shot-shots";
const uniq = Date.now();
const email = `shot_${uniq}@example.com`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
page.on("dialog", (d) => d.accept());

let ok = 0, total = 0;
async function step(name, fn) {
  total++;
  try { await fn(); console.log(`✅ ${name}`); ok++; }
  catch (e) { console.log(`❌ ${name}: ${e.message.split("\n")[0]}`); throw e; }
}

let matchUrl = "";

try {
  await step("準備: サインアップ→チーム作成→試合登録→記録画面へ", async () => {
    await page.goto(`${BASE}/login?mode=signup`);
    await page.fill("#family_name", "射手"); await page.fill("#given_name", "太郎");
    await page.fill("#email", email); await page.fill("#password", "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/onboarding");
    await page.click("summary:has-text('新しくチームを作る')");
    await page.fill("#name", "射手検証部"); await page.fill("#slug", `sht${uniq}`);
    await page.click('button:has-text("チームを作成")');
    await page.waitForURL("**/dashboard");
    await page.goto(`${BASE}/matches/new`);
    await page.fill("#title", "射手検証試合"); await page.fill("#opponent", "Z大");
    await page.click('button:has-text("登録してそのまま試合記録へ")');
    await page.waitForURL(/\/matches\/[0-9a-f-]+\/live$/);
    matchUrl = page.url().replace(/\/live$/, "");
    await page.waitForSelector("text=出場メンバーの確認");
    await page.locator("li", { hasText: "射手 太郎" }).locator("button").first().click();
    await page.click('button:has-text("この1人で開始")');
    // モード選択(両権限あり)or 記録画面のどちらかが出る。出たら管理者記録を選ぶ
    await page.waitForSelector('[data-testid="mode-manager"], [data-testid="score"]');
    if (await page.locator('[data-testid="mode-manager"]').count()) {
      await page.click('[data-testid="mode-manager"]');
    }
    await page.waitForSelector('[data-testid="score"]');
  });

  await step("シュート結果に ゴール/枠外/ブロック/GK/コーナー が出る", async () => {
    // 選手を選択 → シュート種別 → 結果パネル
    await page.locator('button:has-text("射手 太郎")').first().click();
    await page.click('button:has-text("センター")');
    for (const label of ["ゴール", "枠外", "ブロック", "GK", "コーナー"]) {
      if (!(await page.locator(`button:has-text("${label}")`).count())) {
        throw new Error(`結果ボタン「${label}」が無い`);
      }
    }
    await page.screenshot({ path: `${SHOT}/01-shot-results.png`, fullPage: true });
  });

  await step("コーナーを記録できる(得点にはならない)", async () => {
    await page.click('button:has-text("コーナー")');
    await page.waitForSelector("text=コーナー"); // 直近ログに出る
    const score = await page.textContent('[data-testid="score"]');
    if (!/^\s*0\s*-\s*0\s*$/.test(score.replace(/\s+/g, " "))) {
      throw new Error(`コーナーで得点が入ってしまった: ${score}`);
    }
  });

  await step("ゴールも記録でき、得点が1になる", async () => {
    await page.waitForTimeout(500); // 直前の記録のロック解除を待つ
    await page.locator("button", { hasText: "射手 太郎" }).first().click();
    await page.getByRole("button", { name: "ドライブ", exact: true }).click();
    await page.getByRole("button", { name: "ゴール", exact: true }).click();
    // 得点直後はアシスト紐付けパネルが出る → 「なし」で閉じる
    await page.waitForSelector('[data-testid="assist-panel"]', { timeout: 5000 });
    await page.click('button:has-text("アシストなしで閉じる")');
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="score"]');
      return !!el && el.textContent.replace(/\s+/g, "").startsWith("1-");
    });
  });

  await step("中断→再開: 画面を離れて戻ると記録が残っている", async () => {
    // Q2に切り替えてから離脱 → 復帰時にQ2とイベントが残る
    await page.click('button:has-text("Q2")');
    await page.goto(matchUrl); // 試合詳細へ離脱
    await page.waitForSelector("text=射手検証試合");
    await page.goto(`${matchUrl}/live`); // 記録画面に戻る
    // ロスター保存済み+モードは自動復元されるので、記録画面(score)が直接出る
    await page.waitForSelector('[data-testid="score"]');
    // 得点(ゴール1)が残っている
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="score"]');
      return el && el.textContent.replace(/\s+/g, "").startsWith("1-");
    });
    // Q2が復元されている(中断時のピリオドを覚えている)
    const q2 = page.getByRole("button", { name: "Q2", exact: true });
    if ((await q2.getAttribute("class"))?.includes("bg-brand-600") !== true) {
      throw new Error("再開後にピリオド(Q2)が復元されていない");
    }
    // 直近イベントにコーナー・ゴールが残る(イベントログを開かず本文で確認)
    const body = await page.textContent("main");
    if (!body.includes("コーナー")) throw new Error("再開後にコーナー記録が消えている");
    if (!body.includes("ゴール")) throw new Error("再開後にゴール記録が消えている");
    await page.screenshot({ path: `${SHOT}/02-resumed.png`, fullPage: true });
  });

  console.log(`\n=== シュート結果・中断再開検証: ${ok}/${total} passed ===`);
  await browser.close();
  process.exit(ok === total ? 0 : 1);
} catch {
  await page.screenshot({ path: `${SHOT}/failure.png`, fullPage: true }).catch(() => {});
  console.log(`\n=== シュート結果・中断再開検証: ${ok}/${total} passed (中断) ===`);
  await browser.close();
  process.exit(1);
}
