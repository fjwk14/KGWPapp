// コメント未読バッジの受け入れ検証。
//   - メンションされたコメントで下ナビ「試合」に未読バッジが出る
//   - 試合詳細のクリップ一覧に未読ドットが出る
//   - クリップを開くと既読になり、バッジが消える
//   - 自分の投稿・無関係な話題は未読に数えない
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const SHOT = process.env.E2E_SHOT_DIR ?? "/tmp/unread-shots";
const uniq = Date.now();
const adminEmail = `un_admin_${uniq}@example.com`;
const memberEmail = `un_member_${uniq}@example.com`;

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
  let clipUrl = "";
  let matchUrl = "";

  await step("準備: 管理者・メンバーがチームに参加し、試合とクリップを作る", async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await c.newPage();
    await p.goto(`${BASE}/login?mode=signup`);
    await p.fill("#family_name", "未読部員"); await p.fill("#given_name", "花子");
    await p.fill("#email", memberEmail); await p.fill("#password", "password123");
    await p.click('button:has-text("アカウント作成")');
    await p.waitForURL("**/onboarding");
    await c.close();

    await admin.goto(`${BASE}/login?mode=signup`);
    await admin.fill("#family_name", "未読管理者"); await admin.fill("#given_name", "太郎");
    await admin.fill("#email", adminEmail); await admin.fill("#password", "password123");
    await admin.click('button:has-text("アカウント作成")');
    await admin.waitForURL("**/onboarding");
    await admin.click("summary:has-text('新しくチームを作る')");
    await admin.fill("#name", "未読検証部"); await admin.fill("#slug", `un${uniq}`);
    await admin.click('button:has-text("チームを作成")');
    await admin.waitForURL("**/dashboard");
    await admin.goto(`${BASE}/admin`);
    await admin.fill('input[name="email"]', memberEmail);
    await admin.selectOption('select[name="role"]', "player");
    await admin.click('form:has(input[name="email"]) button:has-text("追加")');
    await admin.waitForSelector("text=未読部員");

    await admin.goto(`${BASE}/matches/new`);
    await admin.fill("#title", "未読検証試合");
    await admin.click('button[type="submit"]');
    await admin.waitForURL(/\/matches\/[0-9a-f-]+$/);
    matchUrl = admin.url();
    await admin.click("text=+ クリップ作成");
    await admin.waitForURL(/\/clips\/new$/);
    await admin.fill('input[name="title"]', "未読テストクリップ");
    await admin.fill('input[name="start_min"]', "0");
    await admin.fill('input[name="start_sec"]', "0");
    await admin.fill('input[name="end_min"]', "0");
    await admin.fill('input[name="end_sec"]', "10");
    await admin.click('button:has-text("クリップを登録")');
    await admin.waitForURL(/\/clips\/[0-9a-f-]+$/);
    clipUrl = admin.url();
  });

  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const member = await c2.newPage();
  member.setDefaultTimeout(20000);
  await member.goto(`${BASE}/login`);
  await member.fill("#email", memberEmail);
  await member.fill("#password", "password123");
  await member.click('button[type="submit"]');
  await member.waitForURL("**/dashboard");

  await step("バッジ無しの初期状態を確認", async () => {
    await member.goto(`${BASE}/dashboard`);
    if ((await member.locator('[data-testid="unread-badge"]').count()) > 0) {
      throw new Error("最初からバッジが出ている");
    }
  });

  await step("管理者がメンバーにメンションしてコメント→メンバーのバッジが立つ", async () => {
    await admin.goto(clipUrl);
    await admin.fill('#new-topic input[name="comment"]', "この場面確認して");
    await admin.selectOption('#new-topic select[name="mention"]', { label: "→ 未読部員 花子" });
    await admin.click('#new-topic button:has-text("コメントする")');
    await admin.waitForURL(/\/clips\/[0-9a-f-]+$/);

    await member.goto(`${BASE}/dashboard`);
    await member.waitForSelector('[data-testid="unread-badge"]');
    const badge = await member.textContent('[data-testid="unread-badge"]');
    if (badge.trim() !== "1") throw new Error(`バッジが1でない: ${badge}`);
    await member.screenshot({ path: `${SHOT}/01-badge.png`, fullPage: true });
  });

  await step("試合詳細のクリップ一覧に未読ドットが出る", async () => {
    await member.goto(matchUrl);
    await member.waitForSelector('[data-testid="clip-unread-dot"]');
  });

  await step("クリップを開くと既読になり、バッジが消える", async () => {
    await member.goto(clipUrl);
    await member.waitForTimeout(500); // MarkCommentsReadのupsert待ち
    await member.goto(`${BASE}/dashboard`);
    if ((await member.locator('[data-testid="unread-badge"]').count()) > 0) {
      throw new Error("既読化してもバッジが残っている");
    }
  });

  await step("新しい話題(メンション無し)は未読に数えない", async () => {
    await admin.goto(clipUrl);
    await admin.fill('#new-topic input[name="comment"]', "独り言のメモ");
    await admin.click('#new-topic button:has-text("コメントする")');
    await admin.waitForURL(/\/clips\/[0-9a-f-]+$/);

    await member.goto(`${BASE}/dashboard`);
    if ((await member.locator('[data-testid="unread-badge"]').count()) > 0) {
      throw new Error("無関係な話題でバッジが立ってしまう");
    }
  });

  await step("自分の返信スレッドへの新着は未読になる", async () => {
    // メンバーが「独り言のメモ」スレッドに返信して参加 → その後の追加返信で未読が立つ
    await member.goto(clipUrl);
    const memberThread = member
      .locator('[data-testid="comment-thread"]')
      .filter({ hasText: "独り言のメモ" });
    await memberThread.locator("summary").click();
    await memberThread.locator('input[name="comment"]').fill("了解です");
    await memberThread.locator('button:has-text("返信")').click();
    await member.waitForURL(/\/clips\/[0-9a-f-]+$/);

    await admin.goto(clipUrl);
    const adminThread = admin
      .locator('[data-testid="comment-thread"]')
      .filter({ hasText: "独り言のメモ" });
    await adminThread.locator("summary").click();
    await adminThread.locator('input[name="comment"]').fill("追加コメント");
    await adminThread.locator('button:has-text("返信")').click();
    await admin.waitForURL(/\/clips\/[0-9a-f-]+$/);

    await member.goto(`${BASE}/dashboard`);
    await member.waitForSelector('[data-testid="unread-badge"]');
  });

  console.log(`\n=== 未読バッジ検証: ${ok}/${total} passed ===`);
  await browser.close();
  process.exit(ok === total ? 0 : 1);
} catch {
  await admin.screenshot({ path: `${SHOT}/failure.png`, fullPage: true }).catch(() => {});
  console.log(`\n=== 未読バッジ検証: ${ok}/${total} passed (中断) ===`);
  await browser.close();
  process.exit(1);
}
