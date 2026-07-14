// 試合登録で選べる大会名(関学水球部で使う大会)
export const COMPETITIONS = [
  "日本学生選手権",
  "関西学生選手権",
  "関西選手権",
  "関西秋季大会",
  "関西私学大会",
  "関西ウィンターリーグ",
  "兵庫県選手権",
  "京都選手権",
  "和歌山選手権",
] as const;

// ポジション区分(攻撃時の立ち位置 + GK)。分析のポジション別基準に使う。
// 1=右0度 / 2=右45度 / 3=バック / 4=左45度 / 5=左0度 / 6=フローター / GK
export const FIELD_POSITIONS: { value: number; label: string }[] = [
  { value: 1, label: "① 右0度" },
  { value: 2, label: "② 右45度" },
  { value: 3, label: "③ バック" },
  { value: 4, label: "④ 左45度" },
  { value: 5, label: "⑤ 左0度" },
  { value: 6, label: "⑥ フローター" },
];

export const POSITION_LABELS: Record<string, string> = {
  "1": "右0度",
  "2": "右45度",
  "3": "バック",
  "4": "左45度",
  "5": "左0度",
  "6": "フローター",
  gk: "GK",
};

// メンバーのポジション表示(GK優先、次に field_position)
export function positionLabel(isGk: boolean, fieldPosition: number | null): string {
  if (isGk) return "GK";
  if (fieldPosition && POSITION_LABELS[String(fieldPosition)]) {
    return POSITION_LABELS[String(fieldPosition)];
  }
  return "未設定";
}
