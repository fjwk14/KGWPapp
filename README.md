# Meridian UI

落ち着いたプロフェッショナルな React デザインシステム。スレート系のニュートラル、
抑えたインディゴのアクセント、シャープな角、控えめな影。ダッシュボードやデータ
密度の高いプロダクト画面のために作られています。

## インストール

```bash
npm install meridian-ui
```

ピア依存: `react >= 18`, `react-dom >= 18`。

## 使い方

アプリのルートで一度スタイルシートを読み込み、コンポーネントを使います:

```tsx
import "meridian-ui/styles.css";
import { Button, Card, Badge } from "meridian-ui";

export function Example() {
  return (
    <Card title="プロジェクトの状態" action={<Badge tone="success" dot>稼働中</Badge>}>
      <p>すべて順調に稼働しています。</p>
      <Button variant="primary">詳細を見る</Button>
    </Card>
  );
}
```

## デザイントークン

すべての見た目の値は CSS カスタムプロパティ（`--mrd-` 接頭辞）として `styles.css`
に定義されています: カラースケール（`--mrd-slate-*`, `--mrd-primary-*`, セマンティック
系）、余白（`--mrd-space-*`）、角丸（`--mrd-radius-*`）、タイポグラフィ、影。
`:root` やコンテナで上書きすればテーマを変更できます。

## コンポーネント

アクション — **Button** ／ フォーム — **Input**, **Textarea**, **Select**,
**Checkbox**, **Switch** ／ データ表示 — **Badge**, **Avatar** ／ レイアウト —
**Card** ／ フィードバック — **Alert**
