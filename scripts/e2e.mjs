// =============================================================
// ブラウザE2E: サインアップ → チーム作成 → 試合登録 → クリップ作成
// (タグ+コメント) → タグ集計 → AIレポート(フォールバック) →
// ダッシュボード → 権限(選手はクリップ作成不可・コメント可)
//
//   node scripts/e2e.mjs [baseURL]
// 前提: next dev + scripts/dev-supabase-shim.mjs が起動済み
// =============================================================

import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const SHOT_DIR = process.env.E2E_SHOT_DIR ?? "/tmp/e2e-shots";
const stamp = Date.now();
const staffEmail = `e2e-staff-${stamp}@example.com`;
const results = [];

async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✅ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log(`❌ ${name}: ${e.message}`);
    throw e;
  }
}

// 環境にプリインストールされたChromiumを使う(バージョン違いのDL回避)
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, // iPhone相当(スマホファースト検証)
});
const page = await ctx.newPage();
page.setDefaultTimeout(15000);

async function shot(name) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
}

try {
  await step("サインアップ → オンボーディングへ", async () => {
    await page.goto(`${BASE}/login?mode=signup`);
    await page.fill("#name", "E2Eスタッフ");
    await page.fill("#email", staffEmail);
    await page.fill("#password", "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/onboarding");
  });

  await step("チーム作成 → ダッシュボード", async () => {
    await page.fill("#name", "E2Eテストチーム");
    await page.fill("#slug", `e2e-team-${stamp}`);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard");
    if (!(await page.textContent("body")).includes("E2Eテストチーム")) {
      throw new Error("チーム名がヘッダーに表示されない");
    }
    await shot("01-dashboard-empty");
  });

  await step("試合登録(バリデーションエラー→成功)", async () => {
    await page.goto(`${BASE}/matches/new`);
    // 不正URLでエラーが出ること
    await page.fill("#title", "E2E練習試合");
    await page.evaluate(() => {
      const el = document.querySelector("#video_url");
      el.type = "text"; // ブラウザのtype=url検証を外してサーバー側検証を確認
    });
    await page.fill("#video_url", "javascript:alert(1)");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/matches/new?error=*");
    const err = await page.textContent("body");
    if (!err.includes("http")) throw new Error("URLバリデーションエラーが表示されない");
    // 正しい入力で登録
    await page.fill("#title", "E2E練習試合");
    await page.fill("#opponent", "Z大学");
    await page.fill("#match_date", "2026-07-01");
    await page.fill("#score_for", "10");
    await page.fill("#score_against", "8");
    await page.selectOption("#result", "win");
    await page.fill("#video_url", "https://www.youtube.com/watch?v=e2etest123");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/matches\/[0-9a-f-]+$/);
    await shot("02-match-detail");
  });

  await step("クリップ作成(タグチップ+コメント同時登録)", async () => {
    await page.click("text=+ クリップ作成");
    await page.waitForURL("**/clips/new");
    await page.fill("#title", "Q2 カウンター失点");
    await page.fill("#start_time_seconds", "615");
    await page.fill("#end_time_seconds", "645");
    await page.selectOption("#quarter", "2");
    await page.fill("#description", "戻りが遅れて2対1を作られた");
    // タグチップを選択(action:カウンター / cause:戻り遅れ / result:失点)
    await page.click('label:has(input[value="action:カウンター"])');
    await page.click('label:has(input[value="cause:戻り遅れ"])');
    await page.click('label:has(input[value="result:失点"])');
    await page.fill("#first_comment", "切り替えの声かけを徹底したい");
    await shot("03-clip-form");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/clips\/[0-9a-f-]+$/);
    const body = await page.textContent("body");
    for (const expected of ["カウンター", "戻り遅れ", "失点", "切り替えの声かけを徹底したい"]) {
      if (!body.includes(expected)) throw new Error(`クリップ詳細に「${expected}」が無い`);
    }
    await shot("04-clip-detail");
  });

  await step("該当場面リンクがタイムスタンプ付きで生成される", async () => {
    const href = await page.getAttribute('a:has-text("該当場面を動画で開く")', "href");
    if (!href?.includes("t=615s")) throw new Error(`t=615s が無い: ${href}`);
  });

  await step("タグ追加とコメント投稿", async () => {
    await page.selectOption('select[name="tag"]', "phase:被カウンター");
    await page.click('button:has-text("追加")');
    // リダイレクト後の再描画で追加タグが表示されるまで待つ
    await page.waitForSelector("text=被カウンター");
    await page.selectOption('select[name="comment_type"]', "question");
    await page.fill('input[name="comment"]', "この場面の守備位置を確認したい");
    await page.click('button:has-text("コメントする")');
    await page.waitForSelector("text=この場面の守備位置を確認したい");
  });

  await step("2つ目のクリップ(得点场面)を登録", async () => {
    await page.goto(`${BASE}/matches`);
    await page.click("text=E2E練習試合");
    await page.waitForURL(/\/matches\/[0-9a-f-]+$/);
    await page.click("text=+ クリップ作成");
    await page.fill("#title", "Q3 6対5で得点");
    await page.fill("#start_time_seconds", "1280");
    await page.fill("#end_time_seconds", "1310");
    await page.click('label:has(input[value="phase:6対5"])');
    await page.click('label:has(input[value="result:得点"])');
    await page.click('label:has(input[value="action:シュート"])');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/clips\/[0-9a-f-]+$/);
  });

  await step("タグ集計にバーが表示される", async () => {
    await page.goto(`${BASE}/matches`);
    await page.click("text=E2E練習試合");
    await page.click("text=📊 タグ集計");
    await page.waitForURL("**/stats");
    const body = await page.textContent("body");
    if (!body.includes("タグ7件")) throw new Error(`タグ件数が想定外: ${body.match(/クリップ\d+件 \/ タグ\d+件/)?.[0]}`);
    await shot("05-stats");
  });

  await step("AIレポート生成(フォールバック)と表示", async () => {
    await page.goto(`${BASE}/matches`);
    await page.click("text=E2E練習試合");
    await page.click("text=🤖 AIレポート");
    await page.waitForURL("**/report");
    await page.click('button:has-text("レポート生成")');
    await page.waitForSelector("text=総括");
    const body = await page.textContent("body");
    for (const expected of ["総括", "次回練習テーマ", "戻り遅れ"]) {
      if (!body.includes(expected)) throw new Error(`レポートに「${expected}」が無い`);
    }
    await shot("06-report");
  });

  await step("レポート編集(admin=幹部権限)", async () => {
    await page.click("text=レポートを編集・確定する");
    await page.waitForURL("**/report?edit=1");
    await page.fill('textarea[name="recommended_training_themes"]', "戻り速度の徹底\n6対5セットの反復");
    await page.click('button:has-text("保存して確定")');
    await page.waitForURL(/\/report$/);
    const body = await page.textContent("body");
    if (!body.includes("戻り速度の徹底")) throw new Error("編集内容が反映されない");
  });

  await step("ダッシュボードに集計が反映される", async () => {
    await page.goto(`${BASE}/dashboard`);
    const body = await page.textContent("body");
    for (const expected of ["E2E練習試合", "戻り遅れ", "戻り速度の徹底"]) {
      if (!body.includes(expected)) throw new Error(`ダッシュボードに「${expected}」が無い`);
    }
    await shot("07-dashboard");
  });

  await step("チーム間データ分離(デモチームの試合が見えない)", async () => {
    const body = await page.textContent("body");
    if (body.includes("練習試合 vs Aチーム")) {
      throw new Error("他チーム(デモチーム)の試合が見えている");
    }
  });

  await step("選手ロール: クリップ作成不可・コメント可", async () => {
    // seedの選手(デモチーム所属)でログイン
    const playerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await playerCtx.newPage();
    p.setDefaultTimeout(15000);
    await p.goto(`${BASE}/login`);
    await p.fill("#email", "player@example.com");
    await p.fill("#password", "password123");
    await p.click('button[type="submit"]');
    await p.waitForURL("**/dashboard");

    const dash = await p.textContent("body");
    if (!dash.includes("KGデモ水球部")) throw new Error("選手のチームが違う");
    if (dash.includes("E2Eテストチーム")) throw new Error("他チームの情報が見える");

    // 試合詳細に「クリップ作成」ボタンが無い
    await p.goto(`${BASE}/matches`);
    await p.click("text=練習試合 vs Aチーム");
    await p.waitForURL(/\/matches\/[0-9a-f-]+$/);
    const matchBody = await p.textContent("body");
    if (matchBody.includes("+ クリップ作成")) {
      throw new Error("選手にクリップ作成ボタンが見えている");
    }

    // クリップにコメントできる
    await p.click("text=Q2 カウンター失点");
    await p.waitForURL(/\/clips\/[0-9a-f-]+$/);
    await p.fill('input[name="comment"]', "選手からの質問です");
    await p.click('button:has-text("コメントする")');
    await p.waitForSelector("text=選手からの質問です");
    // タグ追加UIは見えない
    if ((await p.textContent("body")).includes("タグを選択して追加")) {
      throw new Error("選手にタグ追加UIが見えている");
    }
    await p.screenshot({ path: `${SHOT_DIR}/08-player-clip.png`, fullPage: true });
    await playerCtx.close();
  });

  await step("管理画面: メンバー追加(既存ユーザーをメールで)", async () => {
    await page.goto(`${BASE}/admin`);
    await page.fill('input[name="email"]', "player@example.com");
    await page.selectOption('select[name="role"]', "player");
    await page.click('form:has(input[name="email"]) button:has-text("追加")');
    await page.waitForSelector("text=選手テスト");
    await shot("09-admin");
  });

  await step("管理画面: タグテンプレート追加", async () => {
    await page.goto(`${BASE}/admin/tags`);
    await page.selectOption('select[name="tag_type"]', "tactic");
    await page.fill('input[name="tag_value"]', "ハイプレス");
    await page.click('form:has(input[name="tag_value"]) button:has-text("追加")');
    await page.waitForSelector("text=ハイプレス");
  });

  await step("ログアウト → 未認証リダイレクト", async () => {
    await page.click('button:has-text("ログアウト")');
    await page.waitForURL("**/login");
    await page.goto(`${BASE}/dashboard`);
    await page.waitForURL("**/login");
  });
} finally {
  await browser.close();
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n=== E2E: ${passed}/${results.length} passed ===`);
  process.exit(results.every((r) => r.ok) && results.length > 0 ? 0 : 1);
}
