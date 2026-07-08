# Instagram 運用自動化ツールキット（株式会社ディバイド）

Meta 公式 **Instagram Graph API** を使った、規約に沿った運用自動化ツールです。
GitHub Actions によるクラウド定期実行を前提に構成しています。

## できること

| 機能 | 内容 | コマンド |
| --- | --- | --- |
| 🗓 予約投稿・自動投稿 | キュー(YAML)の予約時刻に画像/カルーセル/リールを自動公開 | `instaauto run` |
| 📅 週間プラン生成 | 「投稿の柱」×投稿時間帯から来週分のキュー雛形を自動生成 | `instaauto plan` |
| ✍️ コンテンツ生成 | Claude API がブランド設定に沿ってキャプション・ハッシュタグ・ネタを生成 | `instaauto generate` / `ideas` |
| 🎬 リール自動生成 | 複数画像から縦型(1080×1920)リールを組み立て（テロップ焼き込み+BGM 可） | `instaauto make-reel` |
| 📝 リール台本生成 | AI がシーン構成・テロップ・キャプションを提案 | `instaauto reel-script` |
| 🛡 投稿前チェック | NG ワード・ハッシュタグ上限・文字数を公開前に自動検査 | `run`/`generate` に内蔵 |
| 📊 分析レポート | フォロワー・リーチ・エンゲージメントを集計し Markdown 出力 | `instaauto report` |

## ブランド設定がすべての起点です

**[config/brand.yaml](config/brand.yaml)** に株式会社ディバイドのブランドプロフィール
（事業内容・読者・文体・投稿の柱・ハッシュタグ戦略・CTA・NG ワード）がまとまっています。
AI 生成・週間プラン・投稿前チェックのすべてがこのファイルを参照するため、
**発信方針の変更はこのファイルの編集だけで全体に反映されます。**

> ⚠️ 現在の brand.yaml は「インテリア・生活雑貨の BtoB 卸」という**仮の内容**で
> 初期化しています。実際の事業内容・ターゲットに合わせて最初に必ず見直してください。

## 前提：まず API 連携を済ませてください

現状のアカウントは「ビジネス化済み・**API未連携**」です。最初に
**[docs/SETUP_META.md](docs/SETUP_META.md)** に沿って連携（30〜60分）を行い、
`IG_USER_ID` と `IG_ACCESS_TOKEN` を取得してください。

> API 連携が終わるまでも、`generate` / `ideas` / `plan` / `reel-script` / `make-reel` は
> 使えます（Instagram 認証情報が不要なコマンドのため）。

## セットアップ

```bash
# 1. 依存をインストール
pip install -r requirements.txt

# 2. 認証情報を設定
cp .env.example .env
#   .env を編集し IG_USER_ID / IG_ACCESS_TOKEN などを記入

# 3. ブランド設定を実態に合わせて編集
#   config/brand.yaml

# 4. 接続確認
export PYTHONPATH=src
python -m instaauto check
```

> `.env` と `config/config.yaml` は Git 管理対象外です（秘密情報保護）。
> `content/queue.yaml` は GitHub Actions が読むため **Git 管理されます**。
> キューに秘密情報を書かないでください。

## 週の運用フロー（推奨）

```bash
# 1. 来週分のプラン雛形を生成してキューに追加（AI でネタを具体化）
python -m instaauto plan --write --ai

# 2. content/queue.yaml を開き、素材(media)のパスを差し替えて
#    status を draft -> pending に変更

# 3. コミット & プッシュ。あとは GitHub Actions が予約時刻に自動投稿
```

## 使い方

### コンテンツ生成（ブランド設定に沿った出力）

```bash
python -m instaauto generate "新商品のフラワーベース入荷" --pillar new-arrival
python -m instaauto ideas styling --count 5      # 投稿の柱 ID でもテーマ自由入力でも可
```

`--pillar` は brand.yaml の `pillars` の ID（new-arrival / styling / howto / behind / info）。
生成結果は投稿前チェック（NG ワード等）に自動でかけられ、問題があれば警告が出ます。

### リール動画の生成

```bash
# 1. AI に台本（テロップ案）を作らせる
python -m instaauto reel-script "テーブルウェア3点で夏のコーデ" --scenes 5

# 2. 画像とテロップからリールを組み立て
python -m instaauto make-reel a.jpg b.jpg c.jpg -o out/reel.mp4 \
  --telop "夏のテーブルコーデ" --telop "ポイント1" --telop "詳しくはプロフへ" \
  --audio bgm.mp3
```

ffmpeg が必要です（Ubuntu: `sudo apt-get install -y ffmpeg fonts-noto-cjk`）。
テロップの日本語フォントは `assets/fonts/` に .ttf/.otf を置くと優先して使われます。
生成した mp4 を公開ホスティングに置き、下記キューから投稿します。

### 予約投稿

`content/queue.yaml`（[content/queue.example.yaml](content/queue.example.yaml) を参照）に投稿を登録：

```yaml
- id: 2026-07-16-howto-reel
  scheduled_at: "2026-07-16 12:15"   # JST（config の timezone）で解釈
  type: reel                          # image | carousel | reel
  media: [reels/table-styling.mp4]    # 公開URL or PUBLIC_MEDIA_BASE_URL からの相対パス
  pillar: howto                       # brand.yaml の投稿の柱 ID
  topic: テーブルウェア3点で夏のコーデ  # caption 省略時は AI が自動生成
  status: pending                     # draft のうちは公開されない
```

予約時刻を過ぎたものを公開（時刻は **JST として解釈**され、UTC の実行環境でもずれません）：

```bash
python -m instaauto run
```

### 分析レポート

```bash
python -m instaauto report --out reports
```

## クラウドで定期実行（GitHub Actions）

リポジトリの **Settings → Secrets and variables → Actions** に以下を登録します。

| Secret | 用途 |
| --- | --- |
| `IG_USER_ID` | Instagram ビジネスアカウントID |
| `IG_ACCESS_TOKEN` | 長期アクセストークン |
| `PUBLIC_MEDIA_BASE_URL` | メディア公開ベースURL |
| `ANTHROPIC_API_KEY` | AI 生成（任意） |

登録済みワークフロー：

- **`.github/workflows/scheduled-post.yml`** — 30分ごとにキューを確認し予約投稿を公開
- **`.github/workflows/weekly-report.yml`** — 毎週月曜 9:00 JST に分析レポートを生成（artifact）
- **`.github/workflows/build-reel.yml`** — 画像からリールを手動生成（テロップは `|` 区切りで指定、artifact）

## アーキテクチャ

```
config/brand.yaml          ★ ブランドプロフィール（発信方針の単一の起点）
src/instaauto/
├── config.py              設定・認証情報の読み込み（.env / config.yaml）
├── brand.py               ブランド設定の読み込みと投稿前チェック
├── graph_api.py           Graph API クライアント（投稿公開・インサイト）
├── content_generator.py   AI コンテンツ生成（Claude API、キー無しはテンプレ）
├── reel_generator.py      ffmpeg でリール動画生成（テロップ焼き込み対応）
├── scheduler.py           投稿キューの管理と予約公開
├── analytics.py           分析レポート生成（Markdown）
└── cli.py                 コマンドライン入口
```

## テスト

```bash
pip install pytest
python -m pytest
```

ネットワークや認証情報なしで動作するユニットテストを同梱しています。

## 補足：Vercel について

このリポジトリは Python の**バックエンド自動化ツール**であり、Web サイトではないため
Vercel でのビルドは対象外です（Vercel に接続しているとビルド失敗になります）。
定期実行は上記 GitHub Actions で行うため、Vercel 連携は不要です。連携を外すには
Vercel プロジェクト側で対象リポジトリのデプロイを無効化してください。

## 注意事項

- アクセストークンは 60 日で失効します。期限前の更新運用を用意してください（SETUP_META.md 参照）。
- 個人アカウントの自動操作（自動いいね/フォロー等）は Meta 規約違反です。本ツールは行いません。
- API のレート制限（コンテンツ公開は 24 時間あたり 50 投稿など）に留意してください。
