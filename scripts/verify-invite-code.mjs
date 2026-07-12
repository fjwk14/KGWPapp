// チーム招待コードの受け入れ検証。
//   管理者: チーム作成 → 管理画面で招待コードを確認
//   部員A: サインアップ時に招待コードを入力 → 自動でチーム参加
//   部員B: コードなしでサインアップ → オンボーディングでコード入力 → 参加
//   不正コードは拒否される
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const SHOT = process.env.E2E_SHOT_DIR ?? "/tmp/invite-shots";
const uniq = Date.now();
const adminEmail = `inv_admin_${uniq}@example.com`;
const memberAEmail = `inv_a_${uniq}@example.com`;
const memberBEmail = `inv_b_${uniq}@example.com`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});

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

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(20000);
  return p;
}

let inviteCode = "";
const teamName = `招待検証部${uniq}`;

try {
  const admin = await newPage();

  await step("管理者: サインアップ→チーム作成", async () => {
    await admin.goto(`${BASE}/login?mode=signup`);
    await admin.fill("#name", "招待管理者");
    await admin.fill("#email", adminEmail);
    await admin.fill("#password", "password123");
    await admin.click('button[type="submit"]');
    await admin.waitForURL("**/onboarding");
    // チーム作成は details 内(副動線)
    await admin.click("summary:has-text('新しくチームを作る')");
    await admin.fill("#name", teamName);
    await admin.fill("#slug", `inv${uniq}`);
    await admin.click('button:has-text("チームを作成")');
    await admin.waitForURL("**/dashboard");
  });

  await step("管理者: 管理画面で招待コードを取得", async () => {
    await admin.goto(`${BASE}/admin`);
    await admin.waitForSelector("text=招待コード");
    // コードは大きく表示される tracking-widest の span
    const codeText = await admin
      .locator("span.tracking-widest")
      .first()
      .textContent();
    inviteCode = codeText.trim();
    if (!/^[A-Z0-9]{6}$/.test(inviteCode)) {
      throw new Error(`招待コードの形式が想定外: "${inviteCode}"`);
    }
    await admin.screenshot({ path: `${SHOT}/01-invite-code.png`, fullPage: true });
  });

  await step("部員A: サインアップ時にコード入力→自動参加", async () => {
    const p = await newPage();
    await p.goto(`${BASE}/login?mode=signup`);
    await p.fill("#name", "部員エー");
    await p.fill("#email", memberAEmail);
    await p.fill("#password", "password123");
    await p.fill("#invite_code", inviteCode.toLowerCase()); // 小文字でも通る
    await p.click('button[type="submit"]');
    await p.waitForURL("**/dashboard");
    // 正しいチームに入っている
    const body = await p.textContent("body");
    if (!body.includes(teamName)) throw new Error("サインアップ後に対象チームに入っていない");
    await p.screenshot({ path: `${SHOT}/02-memberA-joined.png`, fullPage: true });
    await p.context().close();
  });

  await step("部員B: コードなし登録→オンボーディングで参加", async () => {
    const p = await newPage();
    await p.goto(`${BASE}/login?mode=signup`);
    await p.fill("#name", "部員ビー");
    await p.fill("#email", memberBEmail);
    await p.fill("#password", "password123");
    await p.click('button[type="submit"]');
    await p.waitForURL("**/onboarding");
    // 不正コードはエラー
    await p.fill("#invite_code", "ZZZZZZ");
    await p.click('button:has-text("このコードで参加する")');
    await p.waitForURL("**/onboarding?error=*");
    if (!(await p.textContent("body")).includes("正しくありません")) {
      throw new Error("不正コードのエラーが出ない");
    }
    // 正しいコードで参加
    await p.fill("#invite_code", inviteCode);
    await p.click('button:has-text("このコードで参加する")');
    await p.waitForURL("**/dashboard");
    if (!(await p.textContent("body")).includes(teamName)) {
      throw new Error("オンボーディング参加後に対象チームに入っていない");
    }
    await p.context().close();
  });

  await step("管理者: メンバー一覧に2人が選手として追加されている", async () => {
    await admin.goto(`${BASE}/admin`);
    const body = await admin.textContent("body");
    if (!body.includes("部員エー")) throw new Error("部員Aが一覧にいない");
    if (!body.includes("部員ビー")) throw new Error("部員Bが一覧にいない");
  });

  await step("再発行すると古いコードが無効になる", async () => {
    await Promise.all([
      admin.waitForURL("**/admin"),
      admin.click('button:has-text("コードを再発行する")'),
    ]);
    await admin.waitForFunction(
      (old) =>
        document
          .querySelector("span.tracking-widest")
          ?.textContent?.trim() !== old,
      inviteCode
    );
    const newCode = (
      await admin.locator("span.tracking-widest").first().textContent()
    ).trim();
    if (newCode === inviteCode) throw new Error("コードが変わっていない");
    // 古いコードで参加しようとすると失敗する
    const p = await newPage();
    await p.goto(`${BASE}/login?mode=signup`);
    await p.fill("#name", "部員シー");
    await p.fill("#email", `inv_c_${uniq}@example.com`);
    await p.fill("#password", "password123");
    await p.fill("#invite_code", inviteCode); // 旧コード
    await p.click('button[type="submit"]');
    await p.waitForURL("**/onboarding?error=*");
    if (!(await p.textContent("body")).includes("正しくありません")) {
      throw new Error("旧コードが拒否されていない");
    }
    await p.context().close();
  });

  console.log(`\n=== 招待コード検証: ${ok}/${total} passed ===`);
  await browser.close();
  process.exit(ok === total ? 0 : 1);
} catch {
  console.log(`\n=== 招待コード検証: ${ok}/${total} passed (中断) ===`);
  await browser.close();
  process.exit(1);
}
