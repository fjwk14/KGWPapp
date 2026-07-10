import React from "react";
import { Switch } from "meridian-ui";

const Stack = (p: { children: React.ReactNode }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 320 }}>
    {p.children}
  </div>
);

export const Basic = () => (
  <Stack>
    <Switch label="二段階認証を有効にする" defaultChecked />
    <Switch label="プロフィールを公開する" />
  </Stack>
);

export const LabelStart = () => (
  <Stack>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <Switch label="ダークモード" labelPosition="start" />
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <Switch label="コンパクト表示" labelPosition="start" defaultChecked />
    </div>
  </Stack>
);

export const States = () => (
  <Stack>
    <Switch label="オン" defaultChecked />
    <Switch label="オフ" />
    <Switch label="無効" disabled />
    <Switch label="無効かつオン" disabled defaultChecked />
  </Stack>
);
