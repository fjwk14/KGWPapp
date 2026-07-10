import React from "react";
import { Badge } from "meridian-ui";

const Row = (p: { children: React.ReactNode }) => (
  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
    {p.children}
  </div>
);

export const Tones = () => (
  <Row>
    <Badge tone="neutral">下書き</Badge>
    <Badge tone="primary">ベータ</Badge>
    <Badge tone="success">稼働中</Badge>
    <Badge tone="warning">保留中</Badge>
    <Badge tone="danger">失敗</Badge>
    <Badge tone="info">新着</Badge>
  </Row>
);

export const WithDot = () => (
  <Row>
    <Badge tone="success" dot>オンライン</Badge>
    <Badge tone="warning" dot>不安定</Badge>
    <Badge tone="danger" dot>オフライン</Badge>
    <Badge tone="neutral" dot>待機中</Badge>
  </Row>
);

export const Square = () => (
  <Row>
    <Badge tone="primary" square>v2.1.0</Badge>
    <Badge tone="neutral" square>ESM</Badge>
    <Badge tone="info" square>TypeScript</Badge>
  </Row>
);
