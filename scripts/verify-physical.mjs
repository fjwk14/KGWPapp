// フィジカル測定・分析ページの受け入れ検証。
//   - 管理者がチーム作成・メンバー追加
//   - スタッフ(管理者)が /physical で測定値を入力
//   - 種目別ランキングに反映される
//   - /physical/[userId] でレーダー・コメントが表示される
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const SHOT = process.env.E2E_SHOT_DIR ?? "/tmp/physical-shots";
const uniq = Date.now();
const adminEmail = `phys_admin_${uniq}@example.com`;
const memberEmail = `phys_member_${uniq}@example.com`;

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

// フォームsubmit後、同一URLへのredirectでもPOST完了を確実に待つ
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
    await p.fill("#family_name", "測定選手");
    await p.fill("#given_name", "花子");
    await p.fill("#email", memberEmail);
    await p.fill("#password", "password123");
    await p.click('button:has-text("アカウント作成")');
    await p.waitForURL("**/onboarding");
    await c.close();

    await page.goto(`${BASE}/login?mode=signup`);
    await page.fill("#family_name", "測定管理者");
    await page.fill("#given_name", "太郎");
    await page.fill("#email", adminEmail);
    await page.fill("#password", "password123");
    await page.click('button:has-text("アカウント作成")');
    await page.waitForURL("**/onboarding");
    await page.click("summary:has-text('新しくチームを作る')");
    await page.fill("#name", "測定検証部");
    await page.fill("#slug", `phys${uniq}`);
    await page.click('button:has-text("チームを作成")');
    await page.waitForURL("**/dashboard");

    await page.goto(`${BASE}/admin`);
    await page.fill('input[name="email"]', memberEmail);
    await page.selectOption('select[name="role"]', "player");
    await page.click('form:has(input[name="email"]) button:has-text("追加")');
    await page.waitForSelector("text=測定選手");
  });

  await step("ランキングページからフィジカルへの導線がある", async () => {
    await page.goto(`${BASE}/rankings`);
    // チーム名にも「フィジカル」を含むため(検証部名)、hrefで一意に指定する
    await page.click('a[href="/physical"]');
    await page.waitForURL("**/physical");
  });

  let memberUserId = "";
  await step("スタッフが/physicalで測定値を入力できる", async () => {
    await page.goto(`${BASE}/physical`);
    await page.waitForSelector("text=測定値を記録");
    // 測定選手(部員)を選択
    const userSelect = page.locator('form:has(#measured_on) select[name="user_id"]');
    const optionValue = await userSelect
      .locator("option", { hasText: "測定選手" })
      .first()
      .getAttribute("value");
    if (!optionValue) throw new Error("測定選手のoptionが見つからない");
    await userSelect.selectOption(optionValue);
    memberUserId = optionValue;

    await page.fill('input[name="vertical"]', "68");
    await page.fill('input[name="sprint10"]', "5.1");
    await page.fill('input[name="throw_max"]', "72");

    await submitAndWait(page.locator('form:has(#measured_on) button:has-text("記録する")'));
    await page.waitForURL("**/physical");
  });

  await step("種目別ランキングに測定値が反映される", async () => {
    await page.goto(`${BASE}/physical?metric=vertical`);
    await page.waitForSelector("text=種目別ランキング");
    const row = page.locator("li", { hasText: "測定選手" }).first();
    await row.waitFor();
    const text = await row.textContent();
    if (!text || !text.includes("68")) {
      throw new Error(`ランキングに測定値68が反映されていない: ${text}`);
    }
    await page.screenshot({ path: `${SHOT}/01-ranking.png`, fullPage: true });
  });

  await step("総合フィジカルスコアランキングに表示される", async () => {
    await page.waitForSelector("text=総合フィジカルスコア ランキング");
    await page.waitForSelector('a[href*="/physical/"]:has-text("測定選手")');
  });

  await step("/physical/[userId]でレーダー・コメントが表示される", async () => {
    await page.goto(`${BASE}/physical/${memberUserId}`);
    await page.waitForSelector("svg"); // レーダーチャート
    await page.waitForSelector("text=フィジカル7軸(本人 vs 同ポジ平均)");
    await page.waitForSelector("text=総合フィジカルスコア");
    // コメントカードが空でない
    const bodyText = await page.textContent("body");
    if (!bodyText || bodyText.length < 100) {
      throw new Error("個人分析ページの内容が薄い");
    }
    await page.screenshot({ path: `${SHOT}/02-detail.png`, fullPage: true });
  });

  await step("プレー総合スコアのセクションが表示される(試合記録が無くても崩れない)", async () => {
    await page.waitForSelector("text=プレー総合スコア");
    // 試合記録がまだ無いので基準点(T=50)のまま表示される
    await page.waitForSelector("text=総合プレースコア 50");
    await page.waitForSelector("text=※簡易推定");
  });

  console.log(`\n=== フィジカル検証: ${ok}/${total} passed ===`);
  await browser.close();
  process.exit(ok === total ? 0 : 1);
} catch {
  await page.screenshot({ path: `${SHOT}/failure.png`, fullPage: true }).catch(() => {});
  console.log(`\n=== フィジカル検証: ${ok}/${total} passed (中断) ===`);
  await browser.close();
  process.exit(1);
}
