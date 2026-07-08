# Instagram Graph API 連携ガイド（未連携から投稿できるまで）

このツールは Meta 公式の **Instagram Graph API** を使います。規約に沿った
安全な自動化ですが、利用開始には下記の連携が必要です。所要時間はおよそ 30〜60 分です。

> 現在の状態：**ビジネスアカウントはあるが API 未連携**。以下を順に進めてください。

---

## 全体像

```
Instagram（プロアカウント）
      │  ①リンク
Facebookページ
      │  ②紐付け
Meta（Facebook）開発者アプリ
      │  ③権限付与
アクセストークン（このツールが使う鍵）
```

自動化が「アカウントを操作」するのではなく、**アカウント本人が発行した鍵（アクセストークン）**を
使ってAPI経由で投稿する、という仕組みです。

---

## ① Instagram をプロアカウント＋Facebookページに接続

1. Instagram アプリ →「設定」→「アカウントの種類とツール」→ **プロアカウントに切り替え**
   （ビジネス または クリエイター）。※すでにプロ化済みならスキップ。
2. 会社の **Facebookページ**を用意（無ければ https://www.facebook.com/pages/create から作成）。
3. Instagram アプリの「設定」→「ビジネス」→「Facebookページをリンク」で、上記ページを接続。

## ② Meta ビジネスポートフォリオ（旧ビジネスマネージャ）に登録

1. https://business.facebook.com/ にアクセスし、会社のビジネスポートフォリオを作成。
2. 「ビジネス設定」→「アカウント」→ **Instagramアカウント** と **ページ** の両方を追加。

## ③ 開発者アプリの作成

1. https://developers.facebook.com/ にログイン →「マイアプリ」→ **アプリを作成**。
2. アプリタイプは「**ビジネス**」を選択。
3. 作成後、ダッシュボードで製品「**Instagram Graph API**」（および必要に応じ「Facebook ログイン」）を追加。

## ④ 必要な権限（スコープ）

グラフАPIエクスプローラ（https://developers.facebook.com/tools/explorer/）で、
自作アプリを選び、以下の権限にチェックしてトークンを生成します。

- `instagram_basic`
- `instagram_content_publish`   ← 投稿に必須
- `instagram_manage_insights`   ← 分析に必須
- `pages_show_list`
- `pages_read_engagement`
- `business_management`

## ⑤ IG_USER_ID（Instagram ビジネスアカウントID）を取得

グラフАPIエクスプローラで順に実行します（`{...}` は前段の結果で置換）。

```
GET /me/accounts
   → 対象 Facebookページの {page-id} を確認

GET /{page-id}?fields=instagram_business_account
   → instagram_business_account.id が IG_USER_ID
```

この数値が `.env` の `IG_USER_ID` になります。

## ⑥ 長期アクセストークンを取得（60日有効）

エクスプローラで生成したトークンは短命（1〜2時間）なので、**長期トークン**に交換します。

```
GET https://graph.facebook.com/v21.0/oauth/access_token
    ?grant_type=fb_exchange_token
    &client_id={app-id}
    &client_secret={app-secret}
    &fb_exchange_token={短期トークン}
```

`app-id` / `app-secret` はアプリの「設定 →ベーシック」にあります。
返ってきた `access_token` が `.env` の `IG_ACCESS_TOKEN` です。

> **有効期限**：長期トークンは約60日。期限前に同じ交換APIを叩けば延長できます。
> 運用ではカレンダーにリマインダーを設定するか、更新用の小さなジョブを用意してください。

## ⑦ メディアの公開ホスティングを用意

Graph API は「**公開URLからのみ**」画像・動画を取り込めます（ローカルファイルの直接
アップロードは不可）。以下のいずれかに、投稿する画像/リールを置いてください。

- 会社サイト配下（例：`https://divide.co.jp/instagram/...`）
- クラウドストレージの公開バケット（S3 / Cloudflare R2 / GCS など）
- 画像CDN

その公開ベースURLを `.env` の `PUBLIC_MEDIA_BASE_URL` に設定します。
キューではこのベースからの相対パス（例：`reels/intro.mp4`）で参照できます。

## ⑧ 動作確認

`.env` を用意したら、接続を確認します。

```bash
pip install -r requirements.txt
export PYTHONPATH=src
python -m instaauto check
```

`✅ Instagram 接続 OK` と表示されれば連携完了です。

---

## よくあるつまずき

| 症状 | 原因と対処 |
| --- | --- |
| `(#10) requires instagram_content_publish` | ④の権限が付いていない。エクスプローラで付け直してトークン再発行 |
| `Media ID is not available` | 動画処理が未完了。リールは処理完了まで自動で待機します（最大2〜3分） |
| `The user is not an Instagram Business` | ①のプロアカウント化 or ②の紐付けが未完了 |
| 画像が取り込めない | `PUBLIC_MEDIA_BASE_URL` が非公開/認証必須になっている。公開URLにする |
| トークンが切れた | ⑥の交換APIで更新。60日ごとの更新運用を推奨 |
