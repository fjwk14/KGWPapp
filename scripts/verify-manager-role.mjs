import { chromium } from "playwright";
const BASE = "http://127.0.0.1:3100";
const uniq = Date.now();
const adminEmail = `mgr_admin_${uniq}@example.com`;
const mgrEmail = `mgr_mane_${uniq}@example.com`;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const admin = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
admin.setDefaultTimeout(20000);
let ok = 0, total = 0;
async function step(name, fn) {
  total++;
  try { await fn(); console.log(`✅ ${name}`); ok++; }
  catch (e) { console.log(`❌ ${name}: ${e.message.split("\n")[0]}`); }
}

// マネージャー本人のサインアップ
const c1 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mgr = await c1.newPage();
mgr.setDefaultTimeout(20000);
await mgr.goto(`${BASE}/login?mode=signup`);
await mgr.fill("#family_name", "検証マネ"); await mgr.fill("#given_name", "花子");
await mgr.fill("#email", mgrEmail); await mgr.fill("#password", "password123");
await mgr.click('button:has-text("アカウント作成")');
await mgr.waitForURL("**/onboarding");

// 管理者がチーム作成し、マネージャーとして追加
await admin.goto(`${BASE}/login?mode=signup`);
await admin.fill("#family_name", "検証管理者"); await admin.fill("#given_name", "太郎");
await admin.fill("#email", adminEmail); await admin.fill("#password", "password123");
await admin.click('button:has-text("アカウント作成")');
await admin.waitForURL("**/onboarding");
await admin.click("summary:has-text('新しくチームを作る')");
await admin.fill("#name", "マネ検証部"); await admin.fill("#slug", `mgr${uniq}`);
await admin.click('button:has-text("チームを作成")');
await admin.waitForURL("**/dashboard");
await admin.goto(`${BASE}/admin`);
await admin.fill('input[name="email"]', mgrEmail);
await admin.selectOption('select[name="role"]', "manager");
await admin.click('form:has(input[name="email"]) button:has-text("追加")');
await admin.waitForSelector("text=検証マネ");

await step("管理画面: マネにバッジが付き、帽子番号・ポジション入力が出ない", async () => {
  const card = admin.locator("div.rounded-xl", { hasText: "検証マネ 花子" }).first();
  const badge = await card.textContent();
  if (!badge.includes("マネ")) throw new Error("マネバッジがない");
  if (!badge.includes("設定は不要")) throw new Error("不要メッセージがない");
  const capInput = await card.locator('input[name^="cap_number_"]').count();
  if (capInput > 0) throw new Error("帽子番号入力が出ている");
  const adminCard = admin.locator("div.rounded-xl", { hasText: "検証管理者 太郎" }).first();
  if (!(await adminCard.textContent()).includes("選手")) throw new Error("選手バッジがない");
  if ((await adminCard.locator('input[name^="cap_number_"]').count()) === 0) {
    throw new Error("選手側の帽子番号入力が消えている");
  }
});

// マネージャーログイン
await mgr.goto(`${BASE}/login`);
await mgr.fill("#email", mgrEmail); await mgr.fill("#password", "password123");
await mgr.click('button[type="submit"]');
await mgr.waitForURL("**/dashboard");

await step("マネの/me: フィジカル・プレー評価カードが出ない", async () => {
  await mgr.goto(`${BASE}/me`);
  await mgr.waitForSelector("text=今日のコンディション");
  const body = await mgr.textContent("main");
  if (body.includes("総合フィジカルスコア")) throw new Error("フィジカルカードが出ている");
});

await step("フィジカルページ: マネが選手プルダウン・一覧に出ない", async () => {
  await admin.goto(`${BASE}/physical`);
  await admin.waitForSelector("text=フィジカル測定・分析");
  const options = await admin.locator('select[name="user_id"] option').allTextContents();
  if (options.some((o) => o.includes("検証マネ"))) throw new Error("プルダウンにマネが出ている");
});

await step("試合記録: 出場メンバー候補にマネが出ない", async () => {
  await admin.goto(`${BASE}/matches/new`);
  await admin.fill("#title", "マネ検証試合");
  await admin.click('button:has-text("登録してそのまま試合記録へ")');
  await admin.waitForURL(/\/live$/);
  await admin.waitForSelector("text=出場メンバーの確認");
  const body = await admin.textContent("main");
  if (body.includes("検証マネ")) throw new Error("出場メンバー候補にマネが出ている");
  if (!body.includes("検証管理者")) throw new Error("選手(管理者)が候補に出ない");
});

await step("練習出欠: マネにもマネバッジが付いて一覧に残る", async () => {
  await admin.goto(`${BASE}/practices`);
  await admin.click('button:has-text("記録して出欠へ")');
  await admin.waitForURL(/\/practices\/[0-9a-f-]+$/);
  await admin.waitForSelector("text=出欠(2人)");
  const body = await admin.textContent("main");
  if (!body.includes("検証マネ")) throw new Error("出欠一覧からマネが消えている");
  if (!body.includes("マネ")) throw new Error("マネバッジがない");
});

console.log(`\n=== マネージャー整理検証: ${ok}/${total} passed ===`);
await browser.close();
process.exit(ok === total ? 0 : 1);
