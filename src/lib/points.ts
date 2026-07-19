// ポイント・レベル・バッジ(純関数)。
//
// ポイントは専用テーブルを持たず、既存データ(コンディション記録・出欠回答・
// ピアFB・コメント・クリップ・タグ・提案採用・Q&A)から都度算出する。
// これにより二重計上や、元データ削除時の整合ズレが起きない。
//
// 設計方針(荒らし対策):
//   - 発言量そのものでなく「もらった反応(返信・メンション)」に配点し、
//     連投で稼げないようコメントは1日3件までを上限にする
//   - 記録・出欠・裏方作業(クリップ/タグ)など"無言の貢献"にも配点する
//   - レベルは累積式で下がらない

// ---------- 配点表 ----------
export const POINT_RULES = {
  conditionPerDay: 2, // コンディションを記録した日ごと
  attendanceAnswer: 1, // 出欠を回答するごと
  selfPracticePerDay: 3, // 自主練(水中/ウエイト等)を記録した日ごと
  peerFeedbackSent: 5, // ピアFBを送るごと
  commentPerDay: 1, // コメント投稿(1日3件まで)
  commentDailyCap: 3,
  replyReceived: 3, // 返信・メンションをもらうごと
  clipCreated: 4, // クリップ作成ごと
  tagAdded: 1, // タグ付けごと
  proposalAdopted: 30, // 提案が採用されるごと
  qaAnswer: 3, // Q&Aで回答するごと
  qaBestAnswer: 10, // ベストアンサーに選ばれるごと(回答分に加算)
  gakurenPerMatch: 3, // 学連ロール保持者が、学連関与試合1件につき
} as const;

export const POINT_RULE_LABELS: { label: string; value: string }[] = [
  { label: "コンディションを記録", value: "+2 / 日" },
  { label: "出欠を回答", value: "+1 / 回" },
  { label: "自主練を記録(水中/ウエイト等)", value: "+3 / 日" },
  { label: "練習後の「今日のひとことFB」を送る", value: "+5 / 回" },
  { label: "コメント投稿", value: "+1 / 件(1日3件まで)" },
  { label: "返信・メンションをもらう", value: "+3 / 回" },
  { label: "クリップ作成", value: "+4 / 本" },
  { label: "タグ付け", value: "+1 / 個" },
  { label: "提案が採用される", value: "+30 / 件" },
  { label: "Q&Aで回答", value: "+3 / 回" },
  { label: "ベストアンサーに選ばれる", value: "+10 / 回" },
  { label: "学連の大会運営(学連ロール)", value: "+3 / 試合" },
  { label: "特別功労(幹部が理由付きで付与)", value: "都度1〜50" },
];

// ---------- レベル(累積・下がらない) ----------
export interface Level {
  key: string;
  label: string;
  min: number;
  // アバターのリング色(Tailwindのクラス名で持つ)
  ring: string;
  text: string;
  bg: string;
}

export const LEVELS: Level[] = [
  { key: "slate", label: "スレート", min: 0, ring: "ring-slate-400", text: "text-slate-600", bg: "bg-slate-100" },
  { key: "blue", label: "ブルー", min: 50, ring: "ring-sky-500", text: "text-sky-700", bg: "bg-sky-100" },
  { key: "bronze", label: "ブロンズ", min: 150, ring: "ring-amber-700", text: "text-amber-800", bg: "bg-amber-100" },
  { key: "silver", label: "シルバー", min: 350, ring: "ring-slate-400", text: "text-slate-500", bg: "bg-slate-200" },
  { key: "gold", label: "ゴールド", min: 700, ring: "ring-yellow-500", text: "text-yellow-700", bg: "bg-yellow-100" },
  { key: "emerald", label: "エメラルド", min: 1200, ring: "ring-emerald-500", text: "text-emerald-700", bg: "bg-emerald-100" },
  { key: "rainbow", label: "虹", min: 2000, ring: "ring-fuchsia-500", text: "text-fuchsia-700", bg: "bg-fuchsia-100" },
];

export function levelOf(total: number): Level {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (total >= l.min) cur = l;
  return cur;
}

// 次のレベルまでの残りと進捗率(虹は最大なのでnull)
export function nextLevelProgress(total: number): {
  next: Level | null;
  remaining: number;
  ratio: number;
} {
  const idx = LEVELS.findIndex((l) => l === levelOf(total));
  const next = LEVELS[idx + 1] ?? null;
  if (!next) return { next: null, remaining: 0, ratio: 1 };
  const cur = LEVELS[idx];
  const span = next.min - cur.min;
  const done = total - cur.min;
  return { next, remaining: next.min - total, ratio: span > 0 ? done / span : 0 };
}

// ---------- ポイント算出 ----------
export interface PointInputs {
  conditionDates: string[]; // 記録した日("YYYY-MM-DD")の配列(重複可)
  attendanceAnswers: number; // 出欠を回答した数
  selfPracticeDates: string[]; // 自主練を記録した日("YYYY-MM-DD")の配列(重複可)
  peerFeedbackSent: number;
  commentDates: string[]; // コメント投稿日("YYYY-MM-DD")の配列
  repliesReceived: number; // 返信・メンションをもらった数
  clipsCreated: number;
  tagsAdded: number;
  proposalsAdopted: number;
  qaAnswers: number;
  qaBestAnswers: number;
  gakurenMatches: number; // 学連ロール保持者のみ加算(学連関与試合の件数)
  manualPoints: number; // 幹部が理由付きで手動付与したポイントの合計
}

export const emptyPointInputs = (): PointInputs => ({
  conditionDates: [],
  attendanceAnswers: 0,
  selfPracticeDates: [],
  peerFeedbackSent: 0,
  commentDates: [],
  repliesReceived: 0,
  clipsCreated: 0,
  tagsAdded: 0,
  proposalsAdopted: 0,
  qaAnswers: 0,
  qaBestAnswers: 0,
  gakurenMatches: 0,
  manualPoints: 0,
});

export interface PointBreakdown {
  condition: number;
  attendance: number;
  selfPractice: number;
  peerFeedback: number;
  comments: number;
  repliesReceived: number;
  clips: number;
  tags: number;
  proposals: number;
  qa: number;
  gakuren: number;
  manual: number;
  total: number;
}

function distinctCount(dates: string[]): number {
  return new Set(dates).size;
}

// コメントは1日 commentDailyCap 件までを配点対象にする(連投対策)
function cappedCommentPoints(dates: string[]): number {
  const byDay = new Map<string, number>();
  for (const d of dates) byDay.set(d, (byDay.get(d) ?? 0) + 1);
  let pts = 0;
  for (const n of byDay.values()) {
    pts += Math.min(n, POINT_RULES.commentDailyCap) * POINT_RULES.commentPerDay;
  }
  return pts;
}

export function computePoints(input: PointInputs): PointBreakdown {
  const condition = distinctCount(input.conditionDates) * POINT_RULES.conditionPerDay;
  const attendance = input.attendanceAnswers * POINT_RULES.attendanceAnswer;
  const selfPractice =
    distinctCount(input.selfPracticeDates) * POINT_RULES.selfPracticePerDay;
  const peerFeedback = input.peerFeedbackSent * POINT_RULES.peerFeedbackSent;
  const comments = cappedCommentPoints(input.commentDates);
  const repliesReceived = input.repliesReceived * POINT_RULES.replyReceived;
  const clips = input.clipsCreated * POINT_RULES.clipCreated;
  const tags = input.tagsAdded * POINT_RULES.tagAdded;
  const proposals = input.proposalsAdopted * POINT_RULES.proposalAdopted;
  const qa =
    input.qaAnswers * POINT_RULES.qaAnswer +
    input.qaBestAnswers * POINT_RULES.qaBestAnswer;
  const gakuren = input.gakurenMatches * POINT_RULES.gakurenPerMatch;
  const manual = input.manualPoints;
  const total =
    condition +
    attendance +
    selfPractice +
    peerFeedback +
    comments +
    repliesReceived +
    clips +
    tags +
    proposals +
    qa +
    gakuren +
    manual;
  return {
    condition,
    attendance,
    selfPractice,
    peerFeedback,
    comments,
    repliesReceived,
    clips,
    tags,
    proposals,
    qa,
    gakuren,
    manual,
    total,
  };
}

// ---------- バッジ(実績・マイルストーン。導出) ----------
export interface Badge {
  key: string;
  icon: string;
  label: string;
  desc: string;
}

// 獲得済みバッジを返す。conditionDays等はUI側で数えて渡す。
export function earnedBadges(input: PointInputs, total: number): Badge[] {
  const badges: Badge[] = [];
  if (total > 0) {
    badges.push({ key: "first_step", icon: "🐣", label: "はじめの一歩", desc: "初めてポイントを獲得" });
  }
  if (distinctCount(input.conditionDates) >= 30) {
    badges.push({ key: "diarist", icon: "📔", label: "記録の達人", desc: "コンディションを30日記録" });
  }
  if (input.peerFeedbackSent >= 10) {
    badges.push({ key: "encourager", icon: "🤝", label: "励まし上手", desc: "今日のひとことFBを10回送信" });
  }
  if (input.clipsCreated >= 5) {
    badges.push({ key: "clipper", icon: "🎬", label: "分析職人", desc: "クリップを5本作成" });
  }
  if (input.proposalsAdopted >= 1) {
    badges.push({ key: "adopted", icon: "💡", label: "提案採用", desc: "提案がチームに採用された" });
  }
  if (input.qaBestAnswers >= 1) {
    badges.push({ key: "best_answer", icon: "🎓", label: "頼れる先輩", desc: "ベストアンサーに選ばれた" });
  }
  if (distinctCount(input.selfPracticeDates) >= 15) {
    badges.push({ key: "self_starter", icon: "💪", label: "自主練の鬼", desc: "自主練を15日記録" });
  }
  if (input.manualPoints > 0) {
    badges.push({ key: "recognized", icon: "🌟", label: "特別功労", desc: "チームへの貢献が幹部に認められた" });
  }
  if (levelOf(total).key === "rainbow") {
    badges.push({ key: "rainbow", icon: "🌈", label: "虹到達", desc: "最高レベルに到達" });
  }
  return badges;
}
