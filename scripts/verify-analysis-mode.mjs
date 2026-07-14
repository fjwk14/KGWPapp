// 分析チーム(analysis_team)と記録モード分離の受け入れ検証。
//   - 管理者が「分析チーム」ロールでメンバーを追加できる
//   - 分析チームは試合記録に入れる(分析モード固定・モード選択なし)
//   - 分析モード: 縦パス/速攻参加/対人守備のみ記録できる(シュートUIなし・
//     試合終了/時間使い切り/Eトグルなし)
//   - 出場メンバーの保存も分析チーム自身でできる(RLS 0017)
//   - 併用役職: 選手 兼 分析チーム にすると記録に入れる(0016)
//   - 記録がダッシュボードKPI(速攻参加・対人守備成功)に反映される
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const SHOT = process.env.E2E_SHOT_DIR ?? "/tmp/analysis-shots";
const uniq = Date.now();
const adminEmail = `an_admin_${uniq}@example.com`;
const analystEmail = `an_analyst_${uniq}@example.com`;
const playerEmail = `an_player_${uniq}@example.com`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
page.setDefaultTimeout(20000);

let ok = 0, total = 0;
async function step(name, fn) {
  total++;
  try { await fn(); console.log(`✅ ${name}`); ok++; }
  catch (e) { console.log(`❌ ${name}: ${e.message}`); throw e; }
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

async function login(p, email) {
  await p.goto(`${BASE}/login`);
  await p.fill("#email", email);
  await p.fill("#password", "password123");
  await p.click('button[type="submit"]');
  await p.waitForURL("**/dashboard");
}

let matchUrl = "";

try {
  await step("準備: 管理者がチーム作成・分析チーム/選手を追加・試合作成", async () => {
    await signupOnly("分析員", analystEmail);
    await signupOnly("併用選手", playerEmail);
    await page.goto(`${BASE}/login?mode=signup`);
    await page.fill("#family_name", "分析管理者");
    await page.fill("#given_name", "太郎");
    await page.fill("#email", adminEmail);
    await page.fill("#password", "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/onboarding");
    await page.click("summary:has-text('新しくチームを作る')");
    await page.fill("#name", "分析検証部");
    await page.fill("#slug", `an${uniq}`);
    await page.click('button:has-text("チームを作成")');
    await page.waitForURL("**/dashboard");

    // 分析員を「分析チーム」ロールで追加(セレクトに新ロールが出ること自体も検証)
    await page.goto(`${BASE}/admin`);
    await page.fill('input[name="email"]', analystEmail);
    await page.selectOption('form:has(input[name="email"]) select[name="role"]', "analysis_team");
    await page.click('form:has(input[name="email"]) button:has-text("追加")');
    await page.waitForSelector("text=分析員");
    // 併用選手を「選手」で追加
    await page.fill('input[name="email"]', playerEmail);
    await page.selectOption('form:has(input[name="email"]) select[name="role"]', "player");
    await page.click('form:has(input[name="email"]) button:has-text("追加")');
    await page.waitForSelector("text=併用選手");

    await page.goto(`${BASE}/matches/new`);
    await page.fill("#title", "分析検証試合");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/matches\/[0-9a-f-]+$/);
    matchUrl = page.url();
  });

  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const analyst = await c2.newPage();
  analyst.setDefaultTimeout(20000);

  await step("分析チームは記録に入れる(分析モード固定・出場メンバー保存もできる)", async () => {
    await login(analyst, analystEmail);
    await analyst.goto(matchUrl);
    await analyst.waitForSelector("text=⏱ 試合記録をつける");
    await analyst.click("text=⏱ 試合記録をつける");
    await analyst.waitForURL(/\/live$/);
    // ロスター未保存 → 分析チーム自身で保存できる(RLS 0017)
    await analyst.waitForSelector("text=出場メンバーの確認");
    for (const name of ["分析管理者", "併用選手"]) {
      await analyst.locator("li", { hasText: name }).locator("button").first().click();
    }
    await analyst.click('button:has-text("この2人で開始")');
    // モード選択は出ず、分析モードで直接開始する
    await analyst.waitForSelector('[data-testid="mode-badge"]');
    const badge = await analyst.textContent('[data-testid="mode-badge"]');
    if (!badge.includes("分析")) throw new Error(`分析モードでない: ${badge}`);
    if ((await analyst.locator('[data-testid="mode-manager"]').count()) > 0) {
      throw new Error("分析チームにモード選択が表示されている");
    }
  });

  await step("分析モード: 3項目のみ記録できる(シュート・試合終了UIなし)", async () => {
    const body = await analyst.textContent("body");
    if (body.includes("時間使い切り")) throw new Error("時間使い切りボタンが見えている");
    if (body.includes("試合終了")) throw new Error("試合終了ボタンが見えている");
    if ((await analyst.locator('[data-testid="extra-toggle"]').count()) > 0) {
      throw new Error("Eトグルが見えている");
    }
    // 選手をタップ → 分析3項目のパネル
    await analyst.click('button:has-text("併用選手")');
    await analyst.waitForSelector("text=縦パス");
    const panel = await analyst.textContent("body");
    if (panel.includes("センター") || panel.includes("ドライブ")) {
      throw new Error("分析モードにシュート種別が見えている");
    }
    await analyst.click('button:has-text("縦パス")');
    await analyst.waitForTimeout(350);
    await analyst.click('button:has-text("併用選手")');
    await analyst.waitForTimeout(350);
    await analyst.click('button:has-text("速攻参加")');
    await analyst.waitForTimeout(350);
    await analyst.click('button:has-text("分析管理者")');
    await analyst.waitForTimeout(350);
    await analyst.click('button:has-text("対人守備")');
    await analyst.waitForTimeout(350);
    // 同期される
    await analyst.waitForFunction(
      () => document.querySelector('[data-testid="sync-indicator"]')?.textContent?.includes("同期済み"),
      { timeout: 15000 }
    );
    await analyst.screenshot({ path: `${SHOT}/01-analysis-mode.png`, fullPage: true });
  });

  await step("記録がダッシュボードKPI(速攻参加・対人守備成功)に反映される", async () => {
    await analyst.goto(`${BASE}/dashboard`);
    const body = (await analyst.textContent("body")).replace(/\s+/g, "");
    // KPIカードは「値→ラベル」の順に描画される(例: "1件速攻参加")
    if (!body.match(/1件速攻参加/)) throw new Error("速攻参加1件が反映されていない");
    if (!body.match(/1件対人守備成功/)) throw new Error("対人守備成功1件が反映されていない");
    await c2.close();
  });

  await step("併用役職: 選手 兼 分析チーム を設定できる(一括更新)", async () => {
    await page.goto(`${BASE}/admin`);
    const row = page.locator('div:has(select[name^="secondary_role_"]):has-text("併用選手")').last();
    await row.locator('select[name^="secondary_role_"]').selectOption("analysis_team");
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.status() < 400),
      page.locator('button:has-text("一括更新")').last().click(),
    ]);
    await page.waitForURL(/ok=1/);
    // 保存されている
    await page.goto(`${BASE}/admin`);
    const saved = await page
      .locator('div:has(select[name^="secondary_role_"]):has-text("併用選手")')
      .last()
      .locator('select[name^="secondary_role_"]')
      .inputValue();
    if (saved !== "analysis_team") throw new Error(`併用役職が保存されていない: ${saved}`);
  });

  await step("併用選手(選手 兼 分析チーム)も分析モードで記録に入れる", async () => {
    const c3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p3 = await c3.newPage();
    p3.setDefaultTimeout(20000);
    await login(p3, playerEmail);
    await p3.goto(matchUrl);
    await p3.waitForSelector("text=⏱ 試合記録をつける");
    await p3.click("text=⏱ 試合記録をつける");
    await p3.waitForURL(/\/live$/);
    await p3.waitForSelector('[data-testid="mode-badge"]');
    const badge = await p3.textContent('[data-testid="mode-badge"]');
    if (!badge.includes("分析")) throw new Error(`分析モードでない: ${badge}`);
    await c3.close();
  });

  console.log(`\n=== 分析モード・併用役職検証: ${ok}/${total} passed ===`);
  await browser.close();
  process.exit(ok === total ? 0 : 1);
} catch {
  await page.screenshot({ path: `${SHOT}/failure.png`, fullPage: true }).catch(() => {});
  console.log(`\n=== 分析モード・併用役職検証: ${ok}/${total} passed (中断) ===`);
  await browser.close();
  process.exit(1);
}
