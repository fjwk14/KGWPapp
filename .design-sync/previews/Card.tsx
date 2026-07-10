import React from "react";
import { Card, Button, Badge, Avatar } from "meridian-ui";

export const Basic = () => (
  <div style={{ maxWidth: 360 }}>
    <Card
      title="プロジェクトの状態"
      subtitle="4分前に更新"
      action={<Badge tone="success" dot>稼働中</Badge>}
    >
      <p style={{ margin: 0, color: "var(--mrd-slate-600)" }}>
        すべてのサービスは正常に稼働しています。次回のメンテナンスは12日後に
        予定されています。
      </p>
    </Card>
  </div>
);

export const WithFooter = () => (
  <div style={{ maxWidth: 360 }}>
    <Card
      title="ワークスペースを削除"
      subtitle="この操作は取り消せません"
      footer={
        <>
          <Button variant="secondary" size="sm">キャンセル</Button>
          <Button variant="danger" size="sm">削除する</Button>
        </>
      }
    >
      <p style={{ margin: 0, color: "var(--mrd-slate-600)" }}>
        このワークスペースを削除すると、すべてのプロジェクト・メンバー・履歴が
        完全に失われます。
      </p>
    </Card>
  </div>
);

export const Interactive = () => (
  <div style={{ maxWidth: 360 }}>
    <Card interactive title="デザイントークン" subtitle="12コンポーネント">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Avatar name="陳 亜里" size="sm" />
        <span style={{ color: "var(--mrd-slate-600)" }}>担当：陳 亜里</span>
      </div>
    </Card>
  </div>
);

export const Raised = () => (
  <div style={{ maxWidth: 360, padding: 8, background: "var(--mrd-slate-100)" }}>
    <Card raised title="月間売上" subtitle="2025年11月">
      <div style={{ fontSize: 28, fontWeight: 600, color: "var(--mrd-slate-900)" }}>
        ¥5,240,000
      </div>
      <div style={{ marginTop: 4 }}>
        <Badge tone="success">前月比 +12.4%</Badge>
      </div>
    </Card>
  </div>
);
