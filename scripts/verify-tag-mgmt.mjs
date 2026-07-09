// タグテンプレート管理の検証: 追加欄が画面内に収まる / 追加 / 名前変更 / 削除
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const SHOT = process.env.E2E_SHOT_DIR ?? "/tmp/tag-shots";
const uniq = Date.now();
const email = `tagadmin_${uniq}@example.com`;

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
  await step("サインアップ→チーム作成→タグ管理を開く", async () => {
    await page.goto(`${BASE}/login?mode=signup`);
    await page.fill("#name", "タグ管理者");
    await page.fill("#email", email);
    await page.fill("#password", "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/onboarding");
    await page.fill("#name", "タグ検証部");
    await page.fill("#slug", `tag${uniq}`);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard");
    await page.goto(`${BASE}/admin/tags`);
    await page.waitForSelector("text=タグテンプレート管理");
  });

  await step("タグ追加欄(タグ名入力)が画面内に完全に収まる", async () => {
    const input = page.locator('#new_tag_value');
    await input.waitFor();
    const box = await input.boundingBox();
    const vw = page.viewportSize().width;
    if (!box) throw new Error("入力欄が見つからない");
    if (box.x < 0 || box.x + box.width > vw + 1) {
      throw new Error(`入力欄が枠外 (x=${box.x}, right=${box.x + box.width}, vw=${vw})`);
    }
    // 横スクロール(オーバーフロー)なし
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    if (overflow > 1) throw new Error(`横オーバーフロー ${overflow}px`);
    await page.screenshot({ path: `${SHOT}/tag-add-layout.png`, fullPage: true });
  });

  await step("タグを追加できる(入力→追加→一覧に出る)", async () => {
    await page.selectOption("#new_tag_type", "tactic");
    await page.fill("#new_tag_value", "ゾーンプレス");
    await page.click('button:has-text("追加")');
    await page.waitForSelector('input[value="ゾーンプレス"]');
  });

  await step("タグ名を変更できる", async () => {
    const row = page.locator('form:has(input[value="ゾーンプレス"])');
    await row.locator('input[name="tag_value"]').fill("マンツーマン");
    await row.locator('button:has-text("変更")').click();
    await page.waitForSelector('input[value="マンツーマン"]');
    if (await page.locator('input[value="ゾーンプレス"]').count()) {
      throw new Error("旧名が残っている");
    }
  });

  await step("タグを削除できる", async () => {
    const row = page.locator('li:has(input[value="マンツーマン"])');
    await row.locator('button:has-text("削除")').click();
    await page.waitForSelector('input[value="マンツーマン"]', { state: "detached" });
    await page.screenshot({ path: `${SHOT}/tag-after-delete.png`, fullPage: true });
  });

  console.log(`\n=== タグ管理検証: ${ok}/5 passed ===`);
  await browser.close();
  process.exit(ok === 5 ? 0 : 1);
} catch {
  await page.screenshot({ path: `${SHOT}/failure.png`, fullPage: true }).catch(() => {});
  console.log(`\n=== タグ管理検証: ${ok}/5 passed (中断) ===`);
  await browser.close();
  process.exit(1);
}
