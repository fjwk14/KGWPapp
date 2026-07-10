import React from "react";
import { Textarea } from "meridian-ui";

const Box = (p: { children: React.ReactNode }) => (
  <div style={{ maxWidth: 380 }}>{p.children}</div>
);

export const WithLabel = () => (
  <Box>
    <Textarea
      label="説明"
      placeholder="プロジェクトの内容を入力してください…"
      hint="Markdown が使えます。"
      defaultValue="データ密度の高いダッシュボード向けの、落ち着いたプロフェッショナルなデザインシステム。"
    />
  </Box>
);

export const WithError = () => (
  <Box>
    <Textarea
      label="リリースノート"
      required
      defaultValue=""
      error="公開する前にリリースノートを入力してください。"
    />
  </Box>
);

export const Disabled = () => (
  <Box>
    <Textarea
      label="監査ログ"
      disabled
      defaultValue={"2025-11-04 09:12  user.login\n2025-11-04 09:15  project.create\n2025-11-04 09:18  member.invite"}
    />
  </Box>
);
