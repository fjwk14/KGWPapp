import React from "react";
import { Avatar } from "meridian-ui";

const Row = (p: { children: React.ReactNode }) => (
  <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
    {p.children}
  </div>
);

// カードがオフラインでも決定的にレンダリングされるよう、インラインの SVG
// data-URI で人物画像を生成する。
const face = (bg: string, label: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><rect width='96' height='96' fill='${bg}'/><text x='50%' y='54%' font-family='sans-serif' font-size='36' fill='white' text-anchor='middle' dominant-baseline='middle'>${label}</text></svg>`
  );

export const Initials = () => (
  <Row>
    <Avatar name="陳 亜里" />
    <Avatar name="山田 太郎" />
    <Avatar name="佐藤 花子" />
    <Avatar initials="AB" />
  </Row>
);

export const Image = () => (
  <Row>
    <Avatar src={face("#4f46e5", "陳")} name="陳 亜里" />
    <Avatar src={face("#0f766e", "山")} name="山田 太郎" />
    <Avatar src={face("#b45309", "佐")} name="佐藤 花子" />
  </Row>
);

export const Sizes = () => (
  <Row>
    <Avatar name="陳 亜里" size="xs" />
    <Avatar name="陳 亜里" size="sm" />
    <Avatar name="陳 亜里" size="md" />
    <Avatar name="陳 亜里" size="lg" />
  </Row>
);

export const WithStatus = () => (
  <Row>
    <Avatar name="陳 亜里" status="online" />
    <Avatar name="山田 太郎" status="busy" />
    <Avatar name="佐藤 花子" status="offline" />
  </Row>
);

export const Square = () => (
  <Row>
    <Avatar src={face("#4f46e5", "陳")} name="陳 亜里" square />
    <Avatar name="チーム" square />
  </Row>
);
