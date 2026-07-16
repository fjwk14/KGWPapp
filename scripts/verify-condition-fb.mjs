// コンディション記録・個人カルテ・練習後ピアFB・メンバー削除の受け入れ検証。
//   - 部員が/meでコンディションを記録できる(1日1行・upsert)
//   - 個人カルテに記録・アドバイスが表示される
//   - コンディションは選手同士では見えず、管理者は/conditionで一覧できる
//   - 実施済み練習でFB相手が表示され、FBを送るとチーム内公開・/meに届く
//   - 管理者はメンバーを登録削除でき、削除された部員はオンボーディングへ戻る
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const SHOT = process.env.E2E_SHOT_DIR ?? "/tmp/condition-shots";
const uniq = Date.now();
const adminEmail = `cond_admin_${uniq}@example.com`;
const memberEmail = `cond_member_${uniq}@example.com`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const admin = await (
  await browser.newContext({ viewport: { width: 390, height: 844 } })
).newPage();
admin.setDefaultTimeout(20000);

let ok = 0,
  total = 0;
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

// ラジオチップ(sr-onlyのinput)をラベル側クリックで選択する
async function pickChip(page, name, value) {
  await page.locator(`label:has(input[name="${name}"][value="${value}"])`).click();
}

try {
  let practiceUrl = "";

  await step("準備: 管理者・部員がチームに参加する", async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await c.newPage();
    await p.goto(`${BASE}/login?mode=signup`);
    await p.fill("#family_name", "体調部員");
    await p.fill("#given_name", "花子");
    await p.fill("#email", memberEmail);
    await p.fill("#password", "password123");
    await p.click('button:has-text("アカウント作成")');
    await p.waitForURL("**/onboarding");
    await c.close();

    await admin.goto(`${BASE}/login?mode=signup`);
    await admin.fill("#family_name", "体調管理者");
    await admin.fill("#given_name", "太郎");
    await admin.fill("#email", adminEmail);
    await admin.fill("#password", "password123");
    await admin.click('button:has-text("アカウント作成")');
    await admin.waitForURL("**/onboarding");
    await admin.click("summary:has-text('新しくチームを作る')");
    await admin.fill("#name", "体調検証部");
    await admin.fill("#slug", `cond${uniq}`);
    await admin.click('button:has-text("チームを作成")');
    await admin.waitForURL("**/dashboard");
    await admin.goto(`${BASE}/admin`);
    await admin.fill('input[name="email"]', memberEmail);
    await admin.selectOption('select[name="role"]', "player");
    await admin.click('form:has(input[name="email"]) button:has-text("追加")');
    await admin.waitForSelector("text=体調部員");
  });

  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const member = await c2.newPage();
  member.setDefaultTimeout(20000);
  await member.goto(`${BASE}/login`);
  await member.fill("#email", memberEmail);
  await member.fill("#password", "password123");
  await member.click('button[type="submit"]');
  await member.waitForURL("**/dashboard");

  await step("部員: /meで今日のコンディションを記録できる", async () => {
    await member.goto(`${BASE}/me`);
    await pickChip(member, "condition", "2");
    await pickChip(member, "motivation", "4");
    await member.fill('input[name="sleep_hours"]', "5");
    await pickChip(member, "pain_level", "2");
    await member.fill('input[name="pain_note"]', "右肩");
    await member.click('button:has-text("コンディションを記録する")');
    await member.waitForURL("**/me?ok=1");
    await member.waitForSelector("text=記録済み");
    await member.screenshot({ path: `${SHOT}/01-me-condition.png`, fullPage: true });
  });

  await step("部員: 個人カルテに記録とアドバイスが出る", async () => {
    await member.click("text=個人カルテ →");
    await member.waitForURL(/\/condition\/[0-9a-f-]+$/);
    await member.waitForSelector("text=対策・アドバイス");
    const body = await member.textContent("body");
    if (!body.includes("右肩")) throw new Error("痛みメモが表示されない");
    if (!body.includes("睡眠")) throw new Error("睡眠アドバイスが出ない");
    await member.screenshot({ path: `${SHOT}/02-karte.png`, fullPage: true });
  });

  await step("部員: /conditionを開くと自分のカルテへ誘導される(チーム一覧は見えない)", async () => {
    await member.goto(`${BASE}/condition`);
    await member.waitForURL(/\/condition\/[0-9a-f-]+$/);
  });

  await step("管理者: /conditionで部員の体調・要注意が一覧できる", async () => {
    await admin.goto(`${BASE}/condition`);
    await admin.waitForSelector("text=チームのコンディション");
    const body = await admin.textContent("body");
    if (!body.includes("体調部員")) throw new Error("部員が一覧に出ない");
    if (!body.includes("要注意")) throw new Error("要注意欄が出ない");
    await admin.screenshot({ path: `${SHOT}/03-team-condition.png`, fullPage: true });
  });

  await step("管理者: 練習を記録するとFB相手が表示される", async () => {
    await admin.goto(`${BASE}/practices`);
    await admin.click('button:has-text("記録して出欠へ")');
    await admin.waitForURL(/\/practices\/[0-9a-f-]+$/);
    practiceUrl = admin.url();
    await admin.waitForSelector("text=今日のひとことFB");
    const body = await admin.textContent("body");
    if (!body.includes("あなたのFB相手")) throw new Error("FB相手が出ない");
  });

  await step("管理者: FBを送るとチーム内公開される", async () => {
    await admin.fill('textarea[name="good"]', "戻りが速くて守備が助かった");
    await admin.fill('textarea[name="advice"]', "シュートはもう半身浮くと強い");
    await admin.click('button:has-text("FBを送る")');
    await admin.waitForURL(/\?ok=1$/);
    await admin.waitForSelector("text=みんなのFB");
    await admin.screenshot({ path: `${SHOT}/04-fb-sent.png`, fullPage: true });
  });

  await step("部員: /meにもらったFBが届く", async () => {
    await member.goto(`${BASE}/me`);
    const body = await member.textContent("body");
    if (!body.includes("戻りが速くて守備が助かった")) {
      throw new Error("もらったFBが表示されない");
    }
    await member.screenshot({ path: `${SHOT}/05-received-fb.png`, fullPage: true });
  });

  await step("部員: 練習ページで自分もFBを返せる", async () => {
    await member.goto(practiceUrl);
    await member.waitForSelector("text=あなたのFB相手");
    await member.fill('textarea[name="good"]', "声かけが分かりやすかった");
    await member.click('button:has-text("FBを送る")');
    await member.waitForURL(/\?ok=1$/);
    // ストリーミング描画の完了を待ってから件数を確認する
    await member.waitForSelector("text=みんなのFB(2件");
  });

  await step("管理者: メンバーを登録削除できる", async () => {
    await admin.goto(`${BASE}/admin`);
    // 対象部員のカード内のdetailsだけを開く(先頭カードは管理者自身のため)
    const removeDetails = admin.locator("details", {
      has: admin.locator('button:has-text("体調部員 花子 を削除する")'),
    });
    await removeDetails.locator("summary").click();
    await removeDetails.locator('button:has-text("体調部員 花子 を削除する")').click();
    await admin.waitForURL("**/admin?ok=1");
    // 2人→1人になったことを描画完了を待って確認する
    await admin.waitForSelector("text=メンバー(1人)");
    await admin.screenshot({ path: `${SHOT}/06-member-removed.png`, fullPage: true });
  });

  await step("削除された部員はオンボーディングへ戻される", async () => {
    await member.goto(`${BASE}/dashboard`);
    await member.waitForURL("**/onboarding");
  });

  console.log(`\n=== コンディション・FB検証: ${ok}/${total} passed ===`);
  await browser.close();
  process.exit(ok === total ? 0 : 1);
} catch {
  await admin.screenshot({ path: `${SHOT}/failure-admin.png`, fullPage: true }).catch(() => {});
  console.log(`\n=== コンディション・FB検証: ${ok}/${total} passed (中断) ===`);
  await browser.close();
  process.exit(1);
}
