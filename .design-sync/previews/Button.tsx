import React from "react";
import { Button } from "meridian-ui";

const Row = (p: { children: React.ReactNode }) => (
  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
    {p.children}
  </div>
);

export const Variants = () => (
  <Row>
    <Button variant="primary">変更を保存</Button>
    <Button variant="secondary">キャンセル</Button>
    <Button variant="ghost">詳しく見る</Button>
    <Button variant="danger">削除</Button>
  </Row>
);

export const Sizes = () => (
  <Row>
    <Button size="sm">小</Button>
    <Button size="md">中</Button>
    <Button size="lg">大</Button>
  </Row>
);

export const WithIcons = () => (
  <Row>
    <Button
      variant="primary"
      leadingIcon={
        <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
        </svg>
      }
    >
      新規プロジェクト
    </Button>
    <Button
      variant="secondary"
      trailingIcon={
        <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M7.3 5.3a1 1 0 011.4 0l4 4a1 1 0 010 1.4l-4 4a1 1 0 11-1.4-1.4L10.6 10 7.3 6.7a1 1 0 010-1.4z" />
        </svg>
      }
    >
      次へ進む
    </Button>
  </Row>
);

export const States = () => (
  <Row>
    <Button variant="primary" loading>
      保存中
    </Button>
    <Button variant="primary" disabled>
      無効
    </Button>
    <Button variant="secondary" disabled>
      無効
    </Button>
  </Row>
);
