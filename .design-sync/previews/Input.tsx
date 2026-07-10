import React from "react";
import { Input } from "meridian-ui";

const Box = (p: { children: React.ReactNode }) => (
  <div style={{ maxWidth: 320 }}>{p.children}</div>
);

export const WithLabel = () => (
  <Box>
    <Input label="勤務先メールアドレス" type="email" placeholder="you@company.com" hint="メールアドレスを共有することはありません。" />
  </Box>
);

export const Required = () => (
  <Box>
    <Input label="ワークスペース名" required placeholder="株式会社アクメ" defaultValue="株式会社アクメ" />
  </Box>
);

export const WithError = () => (
  <Box>
    <Input label="パスワード" type="password" defaultValue="123" error="8文字以上で入力してください。" />
  </Box>
);

export const Disabled = () => (
  <Box>
    <Input label="アカウントID" defaultValue="acct_9f2a1c" disabled hint="自動的に割り当てられます。" />
  </Box>
);
