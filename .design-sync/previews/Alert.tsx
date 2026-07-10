import React from "react";
import { Alert } from "meridian-ui";

const Stack = (p: { children: React.ReactNode }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 440 }}>
    {p.children}
  </div>
);

export const Tones = () => (
  <Stack>
    <Alert tone="info" title="お知らせ">
      新しいバージョンのダッシュボードが利用可能です。
    </Alert>
    <Alert tone="success" title="お支払いを受領しました">
      11月分の請求書は全額お支払い済みです。
    </Alert>
    <Alert tone="warning" title="使用量が上限に近づいています">
      今月のAPI利用量の92%を使用しました。
    </Alert>
    <Alert tone="danger" title="デプロイに失敗しました">
      ビルドを完了できませんでした。詳細はログを確認してください。
    </Alert>
  </Stack>
);

export const TitleOnly = () => (
  <Stack>
    <Alert tone="success" title="変更をすべて保存しました" />
    <Alert tone="warning" title="セッションは5分後に期限切れになります" />
  </Stack>
);

export const DescriptionOnly = () => (
  <Stack>
    <Alert tone="info">
      ヒント：<strong>⌘K</strong> でどこからでもコマンドパレットを開けます。
    </Alert>
  </Stack>
);
