import React from "react";
import { Checkbox } from "meridian-ui";

const Stack = (p: { children: React.ReactNode }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 380 }}>
    {p.children}
  </div>
);

export const Basic = () => (
  <Stack>
    <Checkbox label="利用規約に同意する" defaultChecked />
    <Checkbox label="月刊ニュースレターを購読する" />
  </Stack>
);

export const WithDescription = () => (
  <Stack>
    <Checkbox
      defaultChecked
      label="メール通知"
      description="メンションされたときやタスクが割り当てられたときに通知します。"
    />
    <Checkbox
      label="デスクトップ通知"
      description="ブラウザで許可を与える必要があります。"
    />
  </Stack>
);

export const States = () => (
  <Stack>
    <Checkbox label="選択済み" defaultChecked />
    <Checkbox label="一部選択" indeterminate />
    <Checkbox label="無効" disabled />
    <Checkbox label="無効かつ選択済み" disabled defaultChecked />
  </Stack>
);
