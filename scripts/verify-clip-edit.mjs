// クリップ編集 と コメント入力欄レイアウトの検証
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const SHOT = process.env.E2E_SHOT_DIR ?? "/tmp/clipedit-shots";
const uniq = Date.now();
const email = `clipedit_${uniq}@example.com`;

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

async function noOverflow(where) {
  const o = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  if (o > 1) throw new Error(`${where}: 横オーバーフロー ${o}px`);
}

try {
  await step("準備: サインアップ→チーム→試合→クリップ作成", async () => {
    await page.goto(`${BASE}/login?mode=signup`);
    await page.fill("#name", "編集検証");
    await page.fill("#email", email);
    await page.fill("#password", "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/onboarding");
    await page.fill("#name", "クリップ編集部");
    await page.fill("#slug", `ce${uniq}`);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard");
    await page.goto(`${BASE}/matches/new`);
    await page.fill("#title", "編集検証試合");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/matches\/[0-9a-f-]+$/);
    await page.click("text=+ クリップ作成");
    await page.waitForURL(/\/clips\/new$/);
    await page.fill('[name="title"]', "編集前クリップ");
    await page.fill('[name="start_min"]', "5");
    await page.fill('[name="start_sec"]', "0");
    await page.fill('[name="end_min"]', "5");
    await page.fill('[name="end_sec"]', "20");
    await page.click('button:has-text("クリップを登録")');
    await page.waitForURL(/\/clips\/[0-9a-f-]+$/);
  });

  await step("コメント入力欄が画面内に収まる(右はみ出しなし)", async () => {
    const input = page.locator('input[name="comment"]');
    await input.waitFor();
    const box = await input.boundingBox();
    const vw = page.viewportSize().width;
    if (!box || box.x < 0 || box.x + box.width > vw + 1) {
      throw new Error(`コメント欄が枠外 (right=${box ? box.x + box.width : "?"}, vw=${vw})`);
    }
    await noOverflow("クリップ詳細");
    await page.screenshot({ path: `${SHOT}/clip-detail.png`, fullPage: true });
  });

  await step("コメント投稿できる(全幅入力)", async () => {
    await page.fill('input[name="comment"]', "レイアウト確認コメント");
    await page.click('button:has-text("コメントする")');
    await page.waitForSelector("text=レイアウト確認コメント");
  });

  await step("編集ボタン→クリップ編集で内容変更が反映される", async () => {
    await page.click("text=✏️ 編集");
    await page.waitForURL(/\/clips\/[0-9a-f-]+\/edit$/);
    // 既存値がmm/ssで復元されている
    if ((await page.inputValue('[name="start_min"]')) !== "5") throw new Error("開始分が復元されない");
    if ((await page.inputValue('[name="end_sec"]')) !== "20") throw new Error("終了秒が復元されない");
    // 変更
    await page.fill('[name="title"]', "編集後クリップ");
    await page.fill('[name="start_min"]', "12");
    await page.fill('[name="start_sec"]', "30");
    await page.fill('[name="end_min"]', "12");
    await page.fill('[name="end_sec"]', "55");
    await page.click('button:has-text("保存する")');
    await page.waitForURL(/\/clips\/[0-9a-f-]+$/);
    const body = await page.textContent("body");
    if (!body.includes("編集後クリップ")) throw new Error("タイトル編集が反映されない");
    if (!body.includes("12:30") || !body.includes("12:55")) {
      throw new Error(`時間編集が反映されない: ${body.match(/\d+:\d+/g)}`);
    }
    await page.screenshot({ path: `${SHOT}/clip-edited.png`, fullPage: true });
  });

  console.log(`\n=== クリップ編集/コメント検証: ${ok}/4 passed ===`);
  await browser.close();
  process.exit(ok === 4 ? 0 : 1);
} catch {
  await page.screenshot({ path: `${SHOT}/failure.png`, fullPage: true }).catch(() => {});
  console.log(`\n=== クリップ編集/コメント検証: ${ok}/4 passed (中断) ===`);
  await browser.close();
  process.exit(1);
}
