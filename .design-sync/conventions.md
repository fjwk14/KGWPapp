# Meridian UI で画面を作る

Meridian は落ち着いたプロフェッショナルな React デザインシステムです。スレート系の
ニュートラル、抑えたインディゴのアクセント、シャープな角、控えめな影が特徴です。
出荷済みのコンポーネントを**組み合わせて**使い（再実装はしない）、自分で書く
レイアウトの隙間には Meridian のデザイントークンを使うことで、全体をブランドに
沿った見た目に保ちます。

## セットアップ

プロバイダーやコンテキストのラッパーは不要です。唯一の要件は、デザインシステムの
スタイルシートが読み込まれていること（この環境では `styles.css` のインポート閉包に
より常に読み込まれます）。すべてのコンポーネントは素の React で、そのままスタイルが
当たった状態でレンダリングされます:

```tsx
import { Button, Card, Badge } from "meridian-ui";

<Card title="プロジェクトの状態" action={<Badge tone="success" dot>稼働中</Badge>}>
  <p style={{ color: "var(--mrd-slate-600)" }}>すべてのサービスは正常に稼働しています。</p>
  <Button variant="primary">詳細を見る</Button>
</Card>
```

## スタイルの流儀 — 内部クラスではなくトークンを使う

Meridian のコンポーネントは自身のスタイルを持っています。コンポーネントに
クラス名を**付け足す必要はありません**。スタイルシート内のコンポーネント用クラスは
`mrd-*` 接頭辞（例: `mrd-btn`, `mrd-card`）で、これらは**内部用**です。手書きしないで
ください。

**自分で書く**レイアウトや周辺のマークアップには、Meridian の CSS カスタム
プロパティ（すべて `--mrd-` 接頭辞）でスタイルを当て、システムに揃えます。
実在するトークンの分類は次のとおりです:

| 分類 | 実在する名前（例） | 用途 |
|---|---|---|
| ニュートラル | `--mrd-slate-50` 〜 `--mrd-slate-900` | テキスト・ボーダー・控えめな面 |
| アクセント | `--mrd-primary-50/100/500/600/700`, `--mrd-accent`, `--mrd-accent-hover` | ブランド／操作色 |
| セマンティック | `--mrd-success-*`, `--mrd-warning-*`, `--mrd-danger-*`, `--mrd-info-*`（各 `-50/-200/-600/-700`） | 状態 |
| ロール | `--mrd-bg`, `--mrd-surface`, `--mrd-surface-muted`, `--mrd-text`, `--mrd-text-muted`, `--mrd-border`, `--mrd-border-strong` | ページ／面の役割 |
| 余白 | `--mrd-space-1`（4px）〜 `--mrd-space-8`（32px） | gap・padding・margin |
| 角丸 | `--mrd-radius-sm/md/lg/full` | 角（シャープに保つ — sm/md） |
| タイポ | `--mrd-font-sans`, `--mrd-text-xs/sm/base/md/lg/xl`, `--mrd-weight-medium/semibold` | 文字 |
| 影 | `--mrd-shadow-sm/md/lg` | 影（控えめに） |

ブランドに沿ったレイアウトの隙間の例:

```tsx
<div style={{ display: "grid", gap: "var(--mrd-space-4)", padding: "var(--mrd-space-6)",
  background: "var(--mrd-surface-muted)", borderRadius: "var(--mrd-radius-lg)" }}>
  {/* ここに Meridian コンポーネントを置く */}
</div>
```

## コンポーネント（すべて `general` グループ）

- **アクション** — `Button`（`variant`: primary/secondary/ghost/danger, `size`, `loading`）
- **フォーム** — `Input`, `Textarea`, `Select`（いずれも `label`/`hint`/`error`/`required`。
  Select は `options`/`placeholder` も）、`Checkbox`（`indeterminate`, `description`）、
  `Switch`（`label`, `labelPosition`）
- **データ表示** — `Badge`（`tone`, `dot`, `square`）、`Avatar`（`src`, `name`, `size`, `status`, `square`）
- **レイアウト** — `Card`（`title`/`subtitle`/`action`/`footer`, `raised`, `interactive`, `flush`）
- **フィードバック** — `Alert`（`tone`: info/success/warning/danger, `title`）

## 正確な情報の在り処

スタイルを当てる前に、トークンの完全な定義は `styles.css`（および `@import` される
`_ds_bundle.css`）を参照してください。各コンポーネントの正確な props 契約は
`<Name>.d.ts` に、使い方のガイドは `<Name>.prompt.md` にあります。
