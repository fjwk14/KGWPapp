# 接続先環境

秘密情報を含まない、エージェント共通の接続先一覧。

| 対象 | 値 |
|---|---|
| GitHub | `fjwk14/KGWPapp` |
| Production app | `https://kgtool-ten.vercel.app` |
| Vercel team | `fjwk14s-projects` |
| Vercel project | `kgtool` |
| Vercel dashboard | `https://vercel.com/fjwk14s-projects/kgtool` |
| Supabase project ref | `jxxrwqtqlkzscrbwrulp` |
| Supabase dashboard | `https://supabase.com/dashboard/project/jxxrwqtqlkzscrbwrulp` |

## AIエージェントからの接続

- Vercel MCPはプロジェクト専用URL `https://mcp.vercel.com/fjwk14s-projects/kgtool` を使う。
- Supabase MCPはproject refを固定し、`read_only=true`、`features=database,docs`で接続する。
- OAuthトークンは各クライアントの認証ストレージへ保存し、リポジトリには保存しない。
- 本番Supabaseへの書き込み、Production環境変数変更、本番デプロイはMCPから実行しない。
- スキーマ変更は`supabase/migrations/`としてレビュー後、明示承認を得てCLIで適用する。

Claude Codeはプロジェクト直下の`.mcp.json`を使用する。起動後に`/mcp`を開き、
`vercel`と`supabase`をそれぞれブラウザ認証する。

Codexは`.codex/config.toml`のMCP設定を使用する。新しいタスクまたはCodex CLIを開き、
表示されるOAuth認証を完了する。プロジェクト設定を信頼するか確認された場合は、内容を確認して許可する。
