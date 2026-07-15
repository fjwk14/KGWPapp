// 今回追加分の実機検証: レイアウト修正 / マネージャー役職 / 試合編集
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const SHOT = process.env.E2E_SHOT_DIR ?? "/tmp/verify-shots";
const uniq = Date.now();
const email = `verify_${uniq}@example.com`;
const pass = "password123";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
let ok = 0;
async function step(name, fn) {
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
  await step("サインアップ→チーム作成", async () => {
    await page.goto(`${BASE}/login?mode=signup`);
    await page.fill("#family_name", "検証管理者");
    await page.fill("#given_name", "太郎");
    await page.fill("#email", email);
    await page.fill("#password", pass);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/onboarding");
    await page.click("summary:has-text('新しくチームを作る')");
    await page.fill("#name", "検証水球部");
    await page.fill("#slug", `vfy${uniq}`);
    await page.click('button:has-text("チームを作成")');
    await page.waitForURL("**/dashboard");
  });

  await step("管理画面: メンバー追加ボタンが画面内に収まる(横はみ出しなし)", async () => {
    await page.goto(`${BASE}/admin`);
    await page.waitForSelector('button:has-text("追加")');
    // 横スクロール(オーバーフロー)が発生していないこと
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    if (overflow > 1) throw new Error(`横オーバーフロー ${overflow}px`);
    // 追加ボタンがビューポート内に完全に収まっていること
    const box = await page.locator('button:has-text("追加")').boundingBox();
    const vw = page.viewportSize().width;
    if (!box || box.x + box.width > vw + 1) {
      throw new Error(`追加ボタンが画面外 (right=${box ? box.x + box.width : "?"}, vw=${vw})`);
    }
    await page.screenshot({ path: `${SHOT}/admin-layout.png`, fullPage: true });
  });

  await step("役職の選択肢にマネージャーがある", async () => {
    const opts = await page.locator('form select[name="role"]').first().locator("option").allTextContents();
    if (!opts.includes("マネージャー")) {
      throw new Error(`マネージャーが無い: ${opts.join(",")}`);
    }
  });

  await step("試合を登録", async () => {
    await page.goto(`${BASE}/matches/new`);
    await page.fill("#title", "編集前タイトル");
    await page.fill("#opponent", "B大学");
    await page.fill("#score_for", "5");
    await page.fill("#score_against", "9");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/matches\/[0-9a-f-]+$/);
    const body = await page.textContent("body");
    if (!body.includes("編集前タイトル")) throw new Error("登録が反映されない");
  });

  await step("試合詳細に編集ボタンがあり、編集で内容を変更できる", async () => {
    await page.click("text=✏️ 編集");
    await page.waitForURL(/\/matches\/[0-9a-f-]+\/edit$/);
    // defaultValueで既存値が入っていること
    const titleVal = await page.inputValue("#title");
    if (titleVal !== "編集前タイトル") throw new Error(`既存値が入っていない: ${titleVal}`);
    // 変更して保存
    await page.fill("#title", "編集後タイトル");
    await page.fill("#score_for", "8");
    await page.fill("#opponent", "C大学");
    await page.click('button:has-text("保存する")');
    await page.waitForURL(/\/matches\/[0-9a-f-]+$/);
    const body = await page.textContent("body");
    if (!body.includes("編集後タイトル")) throw new Error("編集が反映されない");
    if (!body.includes("C大学")) throw new Error("対戦相手の編集が反映されない");
    if (!body.includes("8 - 9")) throw new Error("スコアの編集が反映されない");
    await page.screenshot({ path: `${SHOT}/match-edited.png`, fullPage: true });
  });

  console.log(`\n=== 新機能検証: ${ok}/5 passed ===`);
  await browser.close();
  process.exit(ok === 5 ? 0 : 1);
} catch {
  await page.screenshot({ path: `${SHOT}/failure.png`, fullPage: true }).catch(() => {});
  console.log(`\n=== 新機能検証: ${ok}/5 passed (中断) ===`);
  await browser.close();
  process.exit(1);
}
