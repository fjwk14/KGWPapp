# KG Tactical Video

関西学院大学水上競技部・水球パート向けの戦術認識共有MVPアプリ。
試合動画にタイムスタンプ付きクリップを作り、水球専用タグとコメントを付け、
タグ集計とAI戦術レポートで「次回練習テーマ・戦術改善」に変換します。

動画を保存する場所ではなく、**チームの戦術知に変換する場所**です。

## 機能(MVP)

- メール+パスワード認証(Supabase Auth)
- チーム作成・メンバー管理(role: player / tactical_staff / executive / captain / admin)
- 試合登録・動画URL登録(YouTube等)
- タイムスタンプ付きクリップ作成(開始秒・終了秒・クォーター)
  - 1画面でタグ選択・コメントまで完了する90秒UX
  - 動画URL+開始秒から該当場面へのリンクを自動生成
- 水球専用タグ(action / cause / result / phase / player / tactic / situation)
  - チーム作成時に水球用の初期タグを自動シード
- クリップコメント(観察 / 質問 / 戦術意見 / 指導メモ)
- タグ集計(試合別・チーム全体)
- AI戦術レポート(クリップ・タグ・コメントを整理し、練習テーマ・ミーティング要点に変換)
- ダッシュボード(失点原因ランキング、カウンター成功/失敗、退水関連、未タグ付けクリップ数など)

## 技術スタック

- Next.js (App Router) / TypeScript / Tailwind CSS
- Supabase (PostgreSQL + Auth + Row Level Security)
- AI: Anthropic API(公式SDK)/ OpenAI API を環境変数で差し替え可能な抽象化レイヤー
  - APIキー未設定でもタグ集計ベースのフォールバックレポートが動作
- Vitest(バリデーション・権限のユニットテスト)
- デプロイ: Vercel

## セットアップ

### 1. 依存関係

```bash
npm install
```

### 2. Supabaseプロジェクト

[supabase.com](https://supabase.com) でプロジェクトを作成し、SQL Editorで
`supabase/migrations/0001_init.sql` を実行してください。

ローカル開発の場合(Supabase CLI):

```bash
supabase start
supabase db reset   # migrations + seed.sql を適用
```

`supabase/seed.sql` はローカル専用のダミーデータです
(admin@example.com / staff@example.com / captain@example.com / player@example.com、
パスワードは全員 `password123`)。

### 3. 環境変数

```bash
cp .env.example .env.local
```

| 変数 | 必須 | 説明 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | SupabaseプロジェクトURL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anonキー |
| `AI_PROVIDER` | - | `anthropic` または `openai`。未設定ならフォールバックレポート |
| `ANTHROPIC_API_KEY` | - | AI_PROVIDER=anthropic のとき |
| `OPENAI_API_KEY` | - | AI_PROVIDER=openai のとき |

### 4. 起動

```bash
npm run dev       # http://localhost:3000
npm test          # ユニットテスト(バリデーション・権限)
npm run build     # 本番ビルド
```

### 5. 最初の使い方

> 💡 すぐ試す場合は、Supabaseダッシュボードの Authentication > Providers > Email で
> 「Confirm email」をオフにすると、サインアップ直後にログイン状態になります。

1. `/login?mode=signup` でアカウント作成
2. `/onboarding` でチーム作成(作成者がadminになり、水球初期タグが自動登録される)
3. 他の部員はサインアップ後、adminが「チーム管理 > メンバー追加」でメールアドレスを入力して追加
4. 試合登録 → 動画URL登録 → クリップ作成 → タグ付け → AIレポート生成

## 権限設計

権限はSupabase RLSでDBレベルに担保されます(クライアント側の表示制御は補助)。
ポリシー本体は `supabase/migrations/0001_init.sql`、UI用マトリクスは `src/lib/permissions.ts`。

| 操作 | player | tactical_staff | executive/captain | admin |
|---|---|---|---|---|
| 試合・クリップ・集計の閲覧 | ✅ | ✅ | ✅ | ✅ |
| コメント | ✅ | ✅ | ✅ | ✅ |
| 試合登録・動画URL・クリップ作成・タグ付け | - | ✅ | ✅ | ✅ |
| AIレポート生成 | - | ✅ | ✅ | ✅ |
| AIレポート編集・確定 | - | - | ✅ | ✅ |
| チーム・メンバー・タグテンプレート管理 | - | - | - | ✅ |

- すべての主要テーブルに `team_id` を持ち、RLSでチーム間のデータを分離
- 子テーブル(clips / tags / comments / reports)の `team_id` はトリガーで親から強制され、改ざん不可

## ディレクトリ構成

```
supabase/
  migrations/0001_init.sql   # スキーマ + RLS + トリガー + 初期タグシード関数
  seed.sql                   # ローカル用ダミーデータ
src/
  lib/
    supabase/                # SSR対応Supabaseクライアント
    ai/provider.ts           # AIプロバイダー抽象化(Anthropic/OpenAI差替)
    ai/report.ts             # レポート生成・プロンプト・フォールバック
    permissions.ts           # ロール別権限マトリクス
    validation.ts            # zodスキーマ(AI出力のJSON検証含む)
    session.ts               # 認証+チーム所属の要求
    video.ts                 # タイムスタンプ付き動画URL生成
  app/
    login/ onboarding/       # 認証・チーム作成
    (app)/dashboard/         # ダッシュボード
    (app)/matches/           # 試合一覧・登録・詳細・クリップ作成・タグ集計・AIレポート
    (app)/clips/[id]/        # クリップ詳細(タグ・コメント)
    (app)/admin/             # メンバー管理・タグテンプレート管理
tests/                       # vitest(バリデーション・権限・AIスキーマ・動画URL)
```

## Vercelデプロイ

1. リポジトリをVercelにインポート
2. 環境変数(上表)を設定
3. デプロイ(`next build` がそのまま動きます)

## MVPで作らないもの

出欠管理・会計・部費徴収・全体チャット・個人カルテ・面談ログ・メンタルチェック・
AIキャラクター対話・SNS投稿・決済・動画編集・動画自動解析・ネイティブアプリ。
