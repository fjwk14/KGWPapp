// クリップ作成の分秒入力とQ欄削除の検証
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const SHOT = process.env.E2E_SHOT_DIR ?? "/tmp/clip-shots";
const uniq = Date.now();
const email = `cliptime_${uniq}@example.com`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
let ok = 0;
async function step(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); ok++; }
  catch (e) { console.log(`❌ ${name}: ${e.message}`); throw e; }
}

try {
  await step("準備: サインアップ→チーム→試合作成", async () => {
    await page.goto(`${BASE}/login?mode=signup`);
    await page.fill("#name", "検証");
    await page.fill("#email", email);
    await page.fill("#password", "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/onboarding");
    await page.fill("#name", "分秒検証部");
    await page.fill("#slug", `clk${uniq}`);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard");
    await page.goto(`${BASE}/matches/new`);
    await page.fill("#title", "分秒テスト試合");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/matches\/[0-9a-f-]+$/);
  });

  await step("クリップ作成画面: 分秒欄がある / Q欄が無い", async () => {
    await page.click("text=+ クリップ作成");
    await page.waitForURL(/\/clips\/new$/);
    // 分秒フィールドの存在
    for (const n of ["start_min", "start_sec", "end_min", "end_sec"]) {
      if (!(await page.locator(`[name="${n}"]`).count())) throw new Error(`${n} が無い`);
    }
    // Q(quarter)欄が無い
    if (await page.locator('[name="quarter"]').count()) throw new Error("Q欄が残っている");
    // 横オーバーフローなし
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    if (overflow > 1) throw new Error(`横オーバーフロー ${overflow}px`);
    await page.screenshot({ path: `${SHOT}/clip-form.png`, fullPage: true });
  });

  await step("分秒で入力→作成→10:15〜10:45として保存される", async () => {
    await page.fill('[name="title"]', "10分台の場面");
    await page.fill('[name="start_min"]', "10");
    await page.fill('[name="start_sec"]', "15");
    await page.fill('[name="end_min"]', "10");
    await page.fill('[name="end_sec"]', "45");
    await page.click('button:has-text("クリップを登録")');
    await page.waitForURL(/\/clips\/[0-9a-f-]+$/);
    const body = await page.textContent("body");
    if (!body.includes("10:15") || !body.includes("10:45")) {
      throw new Error(`時間表示が想定と違う: ${body.match(/\d+:\d+/g)}`);
    }
    await page.screenshot({ path: `${SHOT}/clip-detail.png`, fullPage: true });
  });

  await step("開始>=終了はエラーになる", async () => {
    // クリップ詳細の「← 試合名」リンクで試合詳細へ戻る
    await page.click("text=← 分秒テスト試合");
    await page.waitForURL(/\/matches\/[0-9a-f-]+$/);
    await page.click("text=+ クリップ作成");
    await page.waitForURL(/\/clips\/new$/);
    await page.fill('[name="title"]', "不正時間");
    await page.fill('[name="start_min"]', "5");
    await page.fill('[name="start_sec"]', "0");
    await page.fill('[name="end_min"]', "5");
    await page.fill('[name="end_sec"]', "0"); // 同時刻→エラー
    await page.click('button:has-text("クリップを登録")');
    await page.waitForSelector("text=/開始時間は終了時間より前/");
  });

  console.log(`\n=== クリップ分秒検証: ${ok}/4 passed ===`);
  await browser.close();
  process.exit(ok === 4 ? 0 : 1);
} catch {
  await page.screenshot({ path: `${SHOT}/failure.png`, fullPage: true }).catch(() => {});
  console.log(`\n=== クリップ分秒検証: ${ok}/4 passed (中断) ===`);
  await browser.close();
  process.exit(1);
}
