# デプロイ手順(Supabase Cloud + Vercel)

所要時間の目安: 10〜15分。すべて**ご自身のPCのブラウザ/ターミナル**で行います
(サンドボックス環境からは外部ネットワークに出られないため実行できません)。

コードは `claude/kg-tactical-video-mvp-ym0yqa` ブランチにプッシュ済みです。

---

## 1. Supabase Cloud プロジェクト作成

1. https://supabase.com/dashboard で **New project** を作成
   (Database Password は控えておく)。
2. プロジェクト作成後、左メニュー **SQL Editor** を開く。
3. このリポジトリの `supabase/migrations/0001_init.sql` の中身を全部コピーして
   貼り付け、**Run**。テーブル・RLS・トリガー・初期タグ関数が作成されます。
   (`supabase/seed.sql` は**本番では実行しない** — ローカル専用のダミーデータです)
4. **Project Settings → API** から次の2つを控える:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. (任意・すぐ試すなら)**Authentication → Providers → Email** で
   「Confirm email」を OFF にすると、サインアップ直後にログイン状態になります。
   ON のままなら確認メールのリンクを開いてからログインします。

### Supabase CLI を使う場合(SQL Editor の代わり)

```bash
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push        # supabase/migrations/ を本番に適用
```

---

## 2. Vercel デプロイ

### ブラウザで(最も簡単)

1. https://vercel.com/new でこの GitHub リポジトリをインポート。
2. Framework は Next.js が自動検出される。ビルド設定は変更不要。
3. **Environment Variables** に以下を設定:

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | 手順1で控えた Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 手順1で控えた anon key |
   | `AI_PROVIDER` | `anthropic`(未設定ならフォールバック集計レポートで動作) |
   | `ANTHROPIC_API_KEY` | `sk-ant-...`(AI_PROVIDER=anthropic のとき) |

4. **Deploy**。数分で `https://<project>.vercel.app` が発行されます。

### CLI で

```bash
npm i -g vercel
vercel login
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add AI_PROVIDER production          # 任意
vercel env add ANTHROPIC_API_KEY production    # 任意
vercel --prod
```

---

## 3. デプロイ後の初期設定

1. 発行された URL を開き、`/login?mode=signup` でアカウント作成。
2. `/onboarding` でチーム作成 → 作成者が自動的に admin になり、水球用の
   初期タグ(30種)がシードされます。
3. 部員はサインアップ後、admin が「チーム管理 → メンバー追加」で
   メールアドレスを入力して追加します。

---

## トラブルシューティング

- **ログイン後すぐ /login に戻される**: メール確認が ON なのに未確認。
  確認メールのリンクを開くか、手順1-5で Confirm email を OFF に。
- **AIレポートがフォールバック集計になる**: `AI_PROVIDER` / `ANTHROPIC_API_KEY`
  未設定。設定すると Anthropic API による分析レポートになります。
- **RLS で全部空に見える**: チーム未所属。`/onboarding` でチーム作成が必要。
- **ビルドは Vercel 側で `next build` がそのまま通ります**(ローカル検証済み)。
