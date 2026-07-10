import React from "react";
import { Select } from "meridian-ui";

const Box = (p: { children: React.ReactNode }) => (
  <div style={{ maxWidth: 320 }}>{p.children}</div>
);

const ROLES = [
  { value: "owner", label: "オーナー" },
  { value: "admin", label: "管理者" },
  { value: "member", label: "メンバー" },
  { value: "viewer", label: "閲覧者" },
];

export const WithOptions = () => (
  <Box>
    <Select label="ロール" options={ROLES} defaultValue="member" hint="アクセス権限を制御します。" />
  </Box>
);

export const Placeholder = () => (
  <Box>
    <Select label="リージョン" placeholder="リージョンを選択…" options={[
      { value: "jp", label: "日本" },
      { value: "us", label: "米国" },
      { value: "eu", label: "ヨーロッパ" },
      { value: "ap", label: "アジア太平洋" },
    ]} />
  </Box>
);

export const WithError = () => (
  <Box>
    <Select label="プラン" required placeholder="プランを選択…" error="プランを選択してください。" options={[
      { value: "free", label: "フリー" },
      { value: "pro", label: "プロ" },
      { value: "enterprise", label: "エンタープライズ" },
    ]} />
  </Box>
);

export const Disabled = () => (
  <Box>
    <Select label="請求通貨" options={[{ value: "jpy", label: "日本円（¥）" }]} defaultValue="jpy" disabled />
  </Box>
);
