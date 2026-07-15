// 練習記録+出欠機能の受け入れ検証。
//   - 管理者がチーム作成・メンバー追加
//   - /practices で練習を新規記録 → 詳細へ遷移
//   - 出欠を変更して保存 → サマリに反映
//   - 一覧に出席/欠席サマリが出る
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const SHOT = process.env.E2E_SHOT_DIR ?? "/tmp/practice-shots";
const uniq = Date.now();
const adminEmail = `pr_admin_${uniq}@example.com`;
const memberEmail = `pr_member_${uniq}@example.com`;

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

const submitAndWait = (locator) =>
  Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.status() < 400),
    locator.click(),
  ]);

try {
  await step("準備: 部員登録・管理者がチーム作成・メンバー追加", async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await c.newPage();
    await p.goto(`${BASE}/login?mode=signup`);
    await p.fill("#family_name", "練習部員");
    await p.fill("#given_name", "花子");
    await p.fill("#email", memberEmail);
    await p.fill("#password", "password123");
    await p.click('button:has-text("アカウント作成")');
    await p.waitForURL("**/onboarding");
    await c.close();

    await page.goto(`${BASE}/login?mode=signup`);
    await page.fill("#family_name", "練習管理者");
    await page.fill("#given_name", "太郎");
    await page.fill("#email", adminEmail);
    await page.fill("#password", "password123");
    await page.click('button:has-text("アカウント作成")');
    await page.waitForURL("**/onboarding");
    await page.click("summary:has-text('新しくチームを作る')");
    await page.fill("#name", "練習検証部");
    await page.fill("#slug", `pr${uniq}`);
    await page.click('button:has-text("チームを作成")');
    await page.waitForURL("**/dashboard");

    await page.goto(`${BASE}/admin`);
    await page.fill('input[name="email"]', memberEmail);
    await page.selectOption('select[name="role"]', "player");
    await page.click('form:has(input[name="email"]) button:has-text("追加")');
    await page.waitForSelector("text=練習部員");
  });

  await step("下ナビから練習ページへ遷移できる", async () => {
    await page.goto(`${BASE}/dashboard`);
    await page.click('nav a[href="/practices"]');
    await page.waitForURL("**/practices");
    await page.waitForSelector("text=練習を作る");
  });

  let practiceUrl = "";
  await step("練習を新規記録すると出欠画面へ遷移する", async () => {
    await page.fill('input[name="start_time"]', "19:00");
    await page.fill('input[name="end_time"]', "21:00");
    await page.fill('textarea[name="menu"]', "kick swim ×4\n片道 ×6\nゲーム 8分止め ×4");
    await Promise.all([
      page.waitForURL(/\/practices\/[0-9a-f-]{36}$/),
      page.click('button:has-text("記録して出欠へ")'),
    ]);
    practiceUrl = page.url();
    await page.waitForSelector("text=出欠");
    // 在籍2名が初期「出席」で登録されている
    await page.waitForSelector("text=練習部員");
    await page.waitForSelector("text=練習管理者");
    await page.screenshot({ path: `${SHOT}/01-detail.png`, fullPage: true });
  });

  await step("出欠を欠席に変更して保存できる", async () => {
    // 練習部員の行のセレクトを「欠席」に
    const row = page.locator('div:has(select[name^="status_"]):has-text("練習部員")').last();
    await row.locator('select[name^="status_"]').selectOption("absent");
    await submitAndWait(page.locator('button:has-text("出欠を保存")'));
    await page.waitForURL(/ok=1/);
    // サマリ: 欠席1
    const absentCard = page.locator('div:has-text("欠席")').filter({ hasText: /^欠席|欠席$/ });
    await page.waitForSelector("text=保存しました");
  });

  await step("一覧に出席/欠席サマリが表示される", async () => {
    await page.goto(`${BASE}/practices`);
    await page.waitForSelector("text=これまでの練習");
    const card = page.locator('a[href^="/practices/"]').first();
    const txt = await card.textContent();
    if (!txt || !txt.includes("欠席 1")) {
      throw new Error(`一覧に欠席1が反映されていない: ${txt}`);
    }
    await page.screenshot({ path: `${SHOT}/02-list.png`, fullPage: true });
  });

  await step("部員(選手)は閲覧のみ・出欠バッジが見える", async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await c.newPage();
    await p.goto(`${BASE}/login`);
    await p.fill("#email", memberEmail);
    await p.fill("#password", "password123");
    await p.click('button:has-text("ログイン")');
    await p.waitForURL("**/dashboard");
    await p.goto(practiceUrl);
    await p.waitForSelector("text=出欠");
    // 記録フォーム(セレクト)は出ない=閲覧のみ
    if ((await p.locator('select[name^="status_"]').count()) > 0) {
      throw new Error("選手に出欠編集セレクトが表示されている");
    }
    await c.close();
  });

  console.log(`\n=== 練習記録・出欠検証: ${ok}/${total} passed ===`);
  await browser.close();
  process.exit(ok === total ? 0 : 1);
} catch {
  await page.screenshot({ path: `${SHOT}/failure.png`, fullPage: true }).catch(() => {});
  console.log(`\n=== 練習記録・出欠検証: ${ok}/${total} passed (中断) ===`);
  await browser.close();
  process.exit(1);
}
