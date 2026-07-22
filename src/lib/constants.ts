// 練習の開始/終了時刻の選択肢(30分刻み)。iOS Safariは<input type="time">の
// step属性をホイールピッカーに反映しないため、選択式にして確実に30分刻みにする。
export const TIME_OPTIONS_30MIN: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

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

// 出欠ステータスの表示ラベルと色
export const ATTENDANCE_LABELS: Record<string, string> = {
  present: "出席",
  absent: "欠席",
  late: "遅刻",
  early_leave: "早退",
  excused: "見学",
};

export const ATTENDANCE_STYLES: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-700",
  absent: "bg-rose-100 text-rose-700",
  late: "bg-amber-100 text-amber-700",
  early_leave: "bg-orange-100 text-orange-700",
  excused: "bg-slate-200 text-slate-600",
};

// 自主練の種別
export const SELF_PRACTICE_CATEGORY_LABELS: Record<string, string> = {
  swim: "水中自主",
  weight: "ウエイト",
  other: "その他",
};

export const PRACTICE_STATUS_LABELS: Record<string, string> = {
  scheduled: "予定",
  done: "実施済み",
};

// 提案ボックスの種別・状態
export const PROPOSAL_CATEGORY_LABELS: Record<string, string> = {
  app: "アプリ改善",
  team: "チームの課題",
  practice: "練習メニュー",
  other: "その他",
};

export const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  open: "受付",
  reviewing: "検討中",
  adopted: "採用",
  declined: "見送り",
};

export const PROPOSAL_STATUS_STYLES: Record<string, string> = {
  open: "bg-sky-100 text-sky-700",
  reviewing: "bg-amber-100 text-amber-700",
  adopted: "bg-emerald-100 text-emerald-700",
  declined: "bg-slate-200 text-slate-500",
};

// Q&A掲示板の種別
export const QA_CATEGORY_LABELS: Record<string, string> = {
  class: "授業・単位",
  job: "就活",
  skill: "水球のコツ",
  life: "部の生活",
  other: "その他",
};

// メンバーのポジション表示(GK優先、次に field_position。併用ポジションは"/"で併記)
export function positionLabel(
  isGk: boolean,
  fieldPosition: number | null,
  secondaryFieldPosition?: number | null
): string {
  if (isGk) return "GK";
  if (!fieldPosition || !POSITION_LABELS[String(fieldPosition)]) return "未設定";
  const primary = POSITION_LABELS[String(fieldPosition)];
  const secondary =
    secondaryFieldPosition && POSITION_LABELS[String(secondaryFieldPosition)]
      ? POSITION_LABELS[String(secondaryFieldPosition)]
      : null;
  return secondary ? `${primary} / ${secondary}` : primary;
}
