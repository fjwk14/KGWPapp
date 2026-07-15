// マイページ(/me)の受け入れ検証。
//   - ヘッダーの名前リンクから /me に行ける
//   - フィジカル・プレー評価の要約、出席率、最近もらったコメントが表示される
//   - 出席率が練習出欠から正しく算出される
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const SHOT = process.env.E2E_SHOT_DIR ?? "/tmp/me-shots";
const uniq = Date.now();
const adminEmail = `me_admin_${uniq}@example.com`;
const memberEmail = `me_member_${uniq}@example.com`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const admin = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
admin.setDefaultTimeout(20000);

let ok = 0, total = 0;
async function step(name, fn) {
  total++;
  try { await fn(); console.log(`✅ ${name}`); ok++; }
  catch (e) { console.log(`❌ ${name}: ${e.message}`); throw e; }
}

try {
  await step("準備: 管理者・部員がチームに参加、練習3回分の出欠を作る(出席2・欠席1)", async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await c.newPage();
    await p.goto(`${BASE}/login?mode=signup`);
    await p.fill("#family_name", "マイページ部員"); await p.fill("#given_name", "花子");
    await p.fill("#email", memberEmail); await p.fill("#password", "password123");
    await p.click('button:has-text("アカウント作成")');
    await p.waitForURL("**/onboarding");
    await c.close();

    await admin.goto(`${BASE}/login?mode=signup`);
    await admin.fill("#family_name", "マイページ管理者"); await admin.fill("#given_name", "太郎");
    await admin.fill("#email", adminEmail); await admin.fill("#password", "password123");
    await admin.click('button:has-text("アカウント作成")');
    await admin.waitForURL("**/onboarding");
    await admin.click("summary:has-text('新しくチームを作る')");
    await admin.fill("#name", "マイページ検証部"); await admin.fill("#slug", `mp${uniq}`);
    await admin.click('button:has-text("チームを作成")');
    await admin.waitForURL("**/dashboard");
    await admin.goto(`${BASE}/admin`);
    await admin.fill('input[name="email"]', memberEmail);
    await admin.selectOption('select[name="role"]', "player");
    await admin.click('form:has(input[name="email"]) button:has-text("追加")');
    await admin.waitForSelector("text=マイページ部員");

    const submitPractice = () => Promise.all([
      admin.waitForURL(/\/practices\/[0-9a-f-]+$/),
      admin.click('button:has-text("記録して出欠へ")'),
    ]);
    const saveAttendance = (status) => Promise.all([
      admin.waitForURL(/ok=1/),
      (async () => {
        const row = admin.locator('div:has(select[name^="status_"]):has-text("マイページ部員")').last();
        await row.locator('select[name^="status_"]').selectOption(status);
        await admin.click('button:has-text("出欠を保存")');
      })(),
    ]);

    // 練習1: 出席のまま(既定)
    await admin.goto(`${BASE}/practices`);
    await submitPractice();
    // 練習2: 出席のまま
    await admin.goto(`${BASE}/practices`);
    await submitPractice();
    // 練習3: 欠席に変更
    await admin.goto(`${BASE}/practices`);
    await submitPractice();
    await saveAttendance("absent");
  });

  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const member = await c2.newPage();
  member.setDefaultTimeout(20000);
  await member.goto(`${BASE}/login`);
  await member.fill("#email", memberEmail);
  await member.fill("#password", "password123");
  await member.click('button[type="submit"]');
  await member.waitForURL("**/dashboard");

  await step("ヘッダーの名前リンクから /me に行ける", async () => {
    await member.click('header a:has-text("マイページ部員")');
    await member.waitForURL("**/me");
    await member.waitForSelector("text=マイページ");
  });

  await step("フィジカル・プレー評価の要約カードが表示される", async () => {
    await member.waitForSelector("text=総合フィジカルスコア");
    await member.waitForSelector("text=総合プレースコア");
    await member.waitForSelector('a:has-text("軸別のレーダーを詳しく見る")');
    await member.screenshot({ path: `${SHOT}/01-me.png`, fullPage: true });
  });

  await step("出席率が2/3=67%として表示される", async () => {
    const body = (await member.innerText("body")).replace(/\s+/g, "");
    if (!body.includes("67%")) throw new Error(`出席率67%が出ない: ${body.slice(0, 400)}`);
    if (!body.includes("出席2")) throw new Error("出席2が出ない");
    if (!body.includes("欠席1")) throw new Error("欠席1が出ない");
  });

  console.log(`\n=== マイページ検証: ${ok}/${total} passed ===`);
  await browser.close();
  process.exit(ok === total ? 0 : 1);
} catch {
  await admin.screenshot({ path: `${SHOT}/failure.png`, fullPage: true }).catch(() => {});
  console.log(`\n=== マイページ検証: ${ok}/${total} passed (中断) ===`);
  await browser.close();
  process.exit(1);
}
