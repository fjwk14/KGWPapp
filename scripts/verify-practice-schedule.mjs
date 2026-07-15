// 練習予定+事前出欠申告の受け入れ検証。
//   - マネージャーが「予定として作成」すると出欠が空(全員未回答)で始まる
//   - 部員が自分の出欠を自己申告できる(マネージャー権限不要)
//   - 一覧に「今後の予定」として表示され、回答状況バッジが出る
//   - 未回答者は「出席」扱いにならず、サマリに未回答として出る
//   - マネージャーが「実施済みにする」で status=done に切り替えられる
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const SHOT = process.env.E2E_SHOT_DIR ?? "/tmp/schedule-shots";
const uniq = Date.now();
const adminEmail = `sc_admin_${uniq}@example.com`;
const memberEmail = `sc_member_${uniq}@example.com`;

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
const submit = (loc) => Promise.all([
  admin.waitForResponse((r) => r.request().method() === "POST" && r.status() < 400),
  loc.click(),
]);

try {
  let practiceUrl = "";

  await step("準備: 管理者・部員がチームに参加", async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await c.newPage();
    await p.goto(`${BASE}/login?mode=signup`);
    await p.fill("#family_name", "予定部員"); await p.fill("#given_name", "花子");
    await p.fill("#email", memberEmail); await p.fill("#password", "password123");
    await p.click('button:has-text("アカウント作成")');
    await p.waitForURL("**/onboarding");
    await c.close();

    await admin.goto(`${BASE}/login?mode=signup`);
    await admin.fill("#family_name", "予定管理者"); await admin.fill("#given_name", "太郎");
    await admin.fill("#email", adminEmail); await admin.fill("#password", "password123");
    await admin.click('button:has-text("アカウント作成")');
    await admin.waitForURL("**/onboarding");
    await admin.click("summary:has-text('新しくチームを作る')");
    await admin.fill("#name", "予定検証部"); await admin.fill("#slug", `sc${uniq}`);
    await admin.click('button:has-text("チームを作成")');
    await admin.waitForURL("**/dashboard");
    await admin.goto(`${BASE}/admin`);
    await admin.fill('input[name="email"]', memberEmail);
    await admin.selectOption('select[name="role"]', "player");
    await admin.click('form:has(input[name="email"]) button:has-text("追加")');
    await admin.waitForSelector("text=予定部員");
  });

  await step("マネージャーが「予定として作成」すると出欠が空(2未回答人)で始まる", async () => {
    await admin.goto(`${BASE}/practices`);
    await admin.fill('input[name="start_time"]', "19:00");
    await admin.fill('input[name="end_time"]', "21:00");
    await Promise.all([
      admin.waitForURL(/\/practices\/[0-9a-f-]{36}$/),
      admin.click('button:has-text("📅 予定として作成")'),
    ]);
    practiceUrl = admin.url();
    await admin.waitForSelector("text=予定");
    await admin.waitForSelector("text=未回答");
    const body = (await admin.innerText("body")).replace(/\s+/g, "");
    if (!body.includes("2未回答")) throw new Error(`2未回答人でない: ${body.slice(0, 300)}`);
    await admin.screenshot({ path: `${SHOT}/01-scheduled-detail.png`, fullPage: true });
  });

  await step("一覧の「今後の予定」に未回答バッジが出る", async () => {
    await admin.goto(`${BASE}/practices`);
    await admin.waitForSelector("text=今後の予定");
    await admin.waitForSelector("text=未回答 →");
    await admin.screenshot({ path: `${SHOT}/02-list.png`, fullPage: true });
  });

  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const member = await c2.newPage();
  member.setDefaultTimeout(20000);
  await member.goto(`${BASE}/login`);
  await member.fill("#email", memberEmail);
  await member.fill("#password", "password123");
  await member.click('button[type="submit"]');
  await member.waitForURL("**/dashboard");

  await step("部員が自分の出欠を自己申告できる(権限不要)", async () => {
    await member.goto(practiceUrl);
    await member.waitForSelector("text=あなたの出欠");
    await Promise.all([
      member.waitForURL(/ok=1/),
      member.locator('button[name="status"][value="absent"]').click(),
    ]);
  });

  await step("一覧で回答済み(欠席)バッジに変わる", async () => {
    await member.goto(`${BASE}/practices`);
    const body = (await member.innerText("body")).replace(/\s+/g, "");
    if (!body.includes("回答済欠席")) throw new Error(`回答済欠席が出ない: ${body.slice(0, 300)}`);
  });

  await step("管理者から見てもサマリに反映される(欠席1・1未回答)", async () => {
    await admin.goto(practiceUrl);
    const body = (await admin.innerText("body")).replace(/\s+/g, "");
    if (!body.includes("1未回答")) throw new Error(`1未回答人でない: ${body.slice(0, 300)}`);
  });

  await step("マネージャーが「実施済みにする」で status=done に切り替えられる", async () => {
    await admin.goto(practiceUrl);
    await submit(admin.locator('button:has-text("実施済みにする")'));
    await admin.waitForSelector("text=実施済み");
    await admin.goto(`${BASE}/practices`);
    const body = (await admin.innerText("body")).replace(/\s+/g, "");
    if (body.includes("今後の予定")) throw new Error("実施済みにしたのに今後の予定に残っている");
  });

  console.log(`\n=== 練習予定・事前出欠申告検証: ${ok}/${total} passed ===`);
  await browser.close();
  process.exit(ok === total ? 0 : 1);
} catch {
  await admin.screenshot({ path: `${SHOT}/failure.png`, fullPage: true }).catch(() => {});
  console.log(`\n=== 練習予定・事前出欠申告検証: ${ok}/${total} passed (中断) ===`);
  await browser.close();
  process.exit(1);
}
