# Instagram 運用自動化ツールキット（株式会社ディバイド）

Meta 公式 **Instagram Graph API** を使った、規約に沿った運用自動化ツールです。
GitHub Actions によるクラウド定期実行を前提に構成しています。

## できること

| 機能 | 内容 | コマンド |
| --- | --- | --- |
| 🗓 予約投稿・自動投稿 | キュー(YAML)の予約時刻に画像/カルーセル/リールを自動公開 | `instaauto run` |
| ✍️ コンテンツ生成 | Claude API でキャプション・ハッシュタグ・投稿ネタを生成 | `instaauto generate` / `ideas` |
| 🎬 リール自動生成 | 複数画像から縦型(1080×1920)リール動画を組み立て（+BGM） | `instaauto make-reel` |
| 📊 分析レポート | フォロワー・リーチ・エンゲージメントを集計し Markdown 出力 | `instaauto report` |

## 前提：まず API 連携を済ませてください

現状のアカウントは「ビジネス化済み・**API未連携**」です。最初に
**[docs/SETUP_META.md](docs/SETUP_META.md)** に沿って連携（30〜60分）を行い、
`IG_USER_ID` と `IG_ACCESS_TOKEN` を取得してください。

## セットアップ

```bash
# 1. 依存をインストール
pip install -r requirements.txt

# 2. 認証情報を設定
cp .env.example .env
#   .env を編集し IG_USER_ID / IG_ACCESS_TOKEN などを記入

# 3. 運用設定（トーン等）を用意
cp config/config.example.yaml config/config.yaml

# 4. 接続確認
export PYTHONPATH=src
python -m instaauto check
```

> `.env` と `config/config.yaml`、`content/queue.yaml` は Git 管理対象外です（秘密情報保護）。

## 使い方

### コンテンツ生成

```bash
python -m instaauto generate "新サービス公開のお知らせ"
python -m instaauto ideas "採用広報" --count 5
```

### リール動画の生成

```bash
python -m instaauto make-reel a.jpg b.jpg c.jpg -o out/reel.mp4 --seconds 2.5 --audio bgm.mp3
```

ffmpeg が必要です（Ubuntu: `sudo apt-get install -y ffmpeg`）。
生成した mp4 を公開ホスティングに置き、下記キューから投稿します。

### 予約投稿

`content/queue.yaml`（`content/queue.example.yaml` を参照）に投稿を登録：

```yaml
- id: 2026-07-12-reel
  scheduled_at: "2026-07-12 18:30"
  type: reel                 # image | carousel | reel
  media: [reels/intro.mp4]   # 公開URL or PUBLIC_MEDIA_BASE_URL からの相対パス
  topic: サービス紹介リール    # caption 省略時は AI が自動生成
  status: pending
```

予約時刻を過ぎたものを公開：

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
- **`.github/workflows/weekly-report.yml`** — 毎週月曜に分析レポートを生成（artifact）
- **`.github/workflows/build-reel.yml`** — 画像からリールを手動生成（artifact）

> cron は UTC 基準です。JST に読み替える場合は +9 時間してください。

## アーキテクチャ

```
src/instaauto/
├── config.py             設定・認証情報の読み込み（.env / config.yaml）
├── graph_api.py          Graph API クライアント（投稿公開・インサイト）
├── content_generator.py  AI コンテンツ生成（Claude API、キー無しはテンプレ）
├── reel_generator.py     ffmpeg でリール動画生成
├── scheduler.py          投稿キューの管理と予約公開
├── analytics.py          分析レポート生成（Markdown）
└── cli.py                コマンドライン入口
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
