// 管理画面で設定した帽子番号・ポジションが試合記録に初期反映されること、
// および帽子番号入力の「01」→「1」正規化を検証する。
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const SHOT = process.env.E2E_SHOT_DIR ?? "/tmp/roster-shots";
const uniq = Date.now();
const adminEmail = `rd_admin_${uniq}@example.com`;
const memberEmail = `rd_member_${uniq}@example.com`;

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

try {
  await step("準備: メンバー登録・管理者がチーム作成・メンバー追加", async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await c.newPage();
    await p.goto(`${BASE}/login?mode=signup`);
    await p.fill("#family_name", "定選手");
    await p.fill("#given_name", "太郎");
    await p.fill("#email", memberEmail);
    await p.fill("#password", "password123");
    await p.click('button:has-text("アカウント作成")');
    await p.waitForURL("**/onboarding");
    await c.close();

    await page.goto(`${BASE}/login?mode=signup`);
    await page.fill("#family_name", "定管理者");
    await page.fill("#given_name", "太郎");
    await page.fill("#email", adminEmail);
    await page.fill("#password", "password123");
    await page.click('button:has-text("アカウント作成")');
    await page.waitForURL("**/onboarding");
    await page.click("summary:has-text('新しくチームを作る')");
    await page.fill("#name", "ロスター既定部");
    await page.fill("#slug", `rd${uniq}`);
    await page.click('button:has-text("チームを作成")');
    await page.waitForURL("**/dashboard");

    await page.goto(`${BASE}/admin`);
    await page.fill('input[name="email"]', memberEmail);
    await page.selectOption('select[name="role"]', "player");
    await page.click('form:has(input[name="email"]) button:has-text("追加")');
    await page.waitForSelector("text=定選手");
  });

  await step("管理画面で帽子番号・ポジションを設定(01→1正規化含む)", async () => {
    await page.goto(`${BASE}/admin`);
    // 先頭=管理者本人 / 2番目=定選手(created_at順)
    // サーバーアクションのPOST完了を待つ(同一URLへのredirectのため)
    const submitAndWait = (form) =>
      Promise.all([
        page.waitForResponse(
          (r) => r.request().method() === "POST" && r.status() < 400
        ),
        form.locator('button:has-text("更新")').click(),
      ]);

    const adminForm = page.locator('form:has(input[name="cap_number"])').first();
    await adminForm.locator('input[name="cap_number"]').fill("7");
    await adminForm.locator('select[name="position"]').selectOption("6"); // センター
    await submitAndWait(adminForm);

    const memberForm = page.locator('form:has(input[name="cap_number"])').nth(1);
    // 01と入力してもサーバー側で1として扱われる(=重複や桁ズレを防ぐ)
    await memberForm.locator('input[name="cap_number"]').fill("01");
    await memberForm.locator('select[name="position"]').selectOption("gk");
    await submitAndWait(memberForm);

    // 保存後の再読込で 1 と表示される
    await page.goto(`${BASE}/admin`);
    const memberCap = await page
      .locator('form:has(input[name="cap_number"])')
      .nth(1)
      .locator('input[name="cap_number"]')
      .inputValue();
    if (memberCap !== "1") throw new Error(`帽子番号が1でない: ${memberCap}`);
  });

  await step("試合記録: 出場メンバーが既定値で初期表示される", async () => {
    await page.goto(`${BASE}/matches/new`);
    await page.fill("#title", "ロスター既定検証試合");
    await page.click('button:has-text("登録してそのまま試合記録へ")');
    await page.waitForURL(/\/live$/);
    await page.waitForSelector("text=出場メンバーの確認");
    // 管理者=7、定選手=1が初期入力されている
    const adminCap = await page
      .locator('input[aria-label*="定管理者"]')
      .inputValue();
    if (adminCap !== "7") throw new Error(`管理者の帽子番号が7でない: ${adminCap}`);
    const memberCap = await page
      .locator('input[aria-label*="定選手"]')
      .inputValue();
    if (memberCap !== "1") throw new Error(`定選手の帽子番号が1でない: ${memberCap}`);
    await page.screenshot({ path: `${SHOT}/01-prefilled.png`, fullPage: true });
  });

  await step("帽子番号入力: 01と打つと1に正規化される", async () => {
    const capInput = page.locator('input[aria-label*="定管理者"]');
    await capInput.fill("01");
    if ((await capInput.inputValue()) !== "1") {
      throw new Error(`01が1に正規化されない: ${await capInput.inputValue()}`);
    }
    await capInput.fill("7"); // 元に戻す
  });

  await step("そのまま開始でき、GKが緑で表示される", async () => {
    await page.click('button:has-text("この2人で開始")');
    await page.waitForSelector('[data-testid="score"]');
    // GK(定選手)がGK枠(緑)に表示される
    await page.waitForSelector("text=GK 定選手 太郎");
    await page.screenshot({ path: `${SHOT}/02-live.png`, fullPage: true });
  });

  console.log(`\n=== 出場メンバー既定値検証: ${ok}/${total} passed ===`);
  await browser.close();
  process.exit(ok === total ? 0 : 1);
} catch {
  await page.screenshot({ path: `${SHOT}/failure.png`, fullPage: true }).catch(() => {});
  console.log(`\n=== 出場メンバー既定値検証: ${ok}/${total} passed (中断) ===`);
  await browser.close();
  process.exit(1);
}
