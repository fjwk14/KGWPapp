// リアルタイムスタッツのドメインモデルと集計ロジック。
// 紙の記録シートと同じ集計表を stats_events から純関数で組み立てる。

export type Quarter = 1 | 2 | 3 | 4 | 5; // 5 = PSO
export const QUARTERS: Quarter[] = [1, 2, 3, 4, 5];
export const QUARTER_LABELS: Record<Quarter, string> = {
  1: "Q1",
  2: "Q2",
  3: "Q3",
  4: "Q4",
  5: "PSO",
};

export type StatsEventType =
  | "shot"
  | "assist"
  | "cut"
  | "drawn_exclusion"
  | "exclusion"
  | "offensive_foul"
  | "miss"
  | "gk_faced"
  | "attack_end_no_shot"
  | "opponent_goal"
  // 展開力・対人守備の実データ化(0014で追加)
  | "key_pass" // 縦パス(攻撃の起点)
  | "counter_join" // 速攻参加
  | "defense_stop"; // 対人守備成功

export type ShotSubtype =
  | "center"
  | "drive"
  | "one_touch"
  | "penalty"
  | "six_m"
  | "other";
export type ShotResult = "goal" | "miss" | "blocked";
export type MissSubtype = "pass" | "keep" | "other";
export type GkResult = "goal_against" | "block" | "off_target";

export interface StatsEvent {
  id: string;
  match_id: string;
  quarter: Quarter;
  player_id: string | null;
  type: StatsEventType;
  subtype: string | null;
  result: string | null;
  is_extra_man: boolean;
  created_at?: string;
}

export interface RosterEntry {
  user_id: string;
  name: string;
  cap_number: number;
  is_gk: boolean;
}

// ---------- 表示ラベル ----------

export const SHOT_SUBTYPE_LABELS: Record<ShotSubtype, string> = {
  center: "センター",
  drive: "ドライブ",
  one_touch: "ワンタッチ",
  penalty: "ペナルティ",
  six_m: "6m",
  other: "その他",
};

export const SHOT_RESULT_LABELS: Record<ShotResult, string> = {
  goal: "◯ゴール",
  miss: "×ミス",
  blocked: "Bブロック",
};

export const MISS_SUBTYPE_LABELS: Record<MissSubtype, string> = {
  pass: "パスミス",
  keep: "キープミス",
  other: "他のミス",
};

export const GK_RESULT_LABELS: Record<GkResult, string> = {
  goal_against: "失点",
  block: "セーブ",
  off_target: "枠外",
};

// イベント1件を日本語1行にする(直近ログ・イベント一覧用)
export function describeEvent(
  e: StatsEvent,
  nameOf: (userId: string | null) => string
): string {
  const who = e.player_id ? nameOf(e.player_id) : "チーム";
  const em = e.is_extra_man ? " (E)" : "";
  switch (e.type) {
    case "shot":
      return `${who}: ${SHOT_SUBTYPE_LABELS[e.subtype as ShotSubtype] ?? e.subtype}シュート ${SHOT_RESULT_LABELS[e.result as ShotResult] ?? e.result}${em}`;
    case "assist":
      return `${who}: アシスト`;
    case "cut":
      return `${who}: カット`;
    case "drawn_exclusion":
      return `${who}: ${e.subtype === "penalty" ? "ペナルティ誘発" : "退水誘発"}`;
    case "exclusion":
      return `${who}: 退水`;
    case "offensive_foul":
      return `${who}: オフェンシブファウル`;
    case "key_pass":
      return `${who}: 縦パス(起点)`;
    case "counter_join":
      return `${who}: 速攻参加`;
    case "defense_stop":
      return `${who}: 対人守備`;
    case "miss":
      return `${who}: ${MISS_SUBTYPE_LABELS[e.subtype as MissSubtype] ?? "ミス"}`;
    case "gk_faced":
      return `${who}(GK): ${GK_RESULT_LABELS[e.result as GkResult] ?? e.result}`;
    case "attack_end_no_shot":
      return "攻撃終了(シュートなし)";
    case "opponent_goal":
      return "相手得点";
  }
}

// ---------- 集計 ----------

// 紙シートのシュート列: センター/ドライブ/ワンタッチ/P/E/6m/その他
// ペナルティ > エキストラ(E) > 種別 の優先順で1列に振り分ける
export const SHOT_COLUMNS = [
  "center",
  "drive",
  "one_touch",
  "penalty",
  "extra",
  "six_m",
  "other",
] as const;
export type ShotColumn = (typeof SHOT_COLUMNS)[number];

export const SHOT_COLUMN_LABELS: Record<ShotColumn, string> = {
  center: "センター",
  drive: "ドライブ",
  one_touch: "ワンタッチ",
  penalty: "P",
  extra: "E",
  six_m: "6m",
  other: "その他",
};

export function shotColumnOf(e: StatsEvent): ShotColumn {
  if (e.subtype === "penalty") return "penalty";
  if (e.is_extra_man) return "extra";
  if ((SHOT_COLUMNS as readonly string[]).includes(e.subtype ?? "")) {
    return e.subtype as ShotColumn;
  }
  return "other";
}

export interface ShotCell {
  goals: number;
  attempts: number;
}

export interface PlayerLine {
  user_id: string;
  name: string;
  cap_number: number;
  shots: Record<ShotColumn, ShotCell>;
  shotGoals: number;
  shotAttempts: number;
  /** シュート率(0〜1)。試投0ならnull */
  shotRate: number | null;
  drawnExclusion: number; // E誘発
  drawnPenalty: number; // P誘発
  assists: number;
  cuts: number;
  exclusions: number; // 退水(された)
  offensiveFouls: number;
  missPass: number;
  missKeep: number;
  missOther: number;
}

const emptyShots = (): Record<ShotColumn, ShotCell> =>
  Object.fromEntries(
    SHOT_COLUMNS.map((c) => [c, { goals: 0, attempts: 0 }])
  ) as Record<ShotColumn, ShotCell>;

export function buildPlayerLines(
  events: StatsEvent[],
  roster: RosterEntry[]
): PlayerLine[] {
  const lines = new Map<string, PlayerLine>();
  const ensure = (userId: string): PlayerLine => {
    let line = lines.get(userId);
    if (!line) {
      const r = roster.find((x) => x.user_id === userId);
      line = {
        user_id: userId,
        name: r?.name ?? "不明",
        cap_number: r?.cap_number ?? 99,
        shots: emptyShots(),
        shotGoals: 0,
        shotAttempts: 0,
        shotRate: null,
        drawnExclusion: 0,
        drawnPenalty: 0,
        assists: 0,
        cuts: 0,
        exclusions: 0,
        offensiveFouls: 0,
        missPass: 0,
        missKeep: 0,
        missOther: 0,
      };
      lines.set(userId, line);
    }
    return line;
  };

  // フィールド選手はイベントが無くても行を出す(GKは別表)
  for (const r of roster.filter((r) => !r.is_gk)) ensure(r.user_id);

  for (const e of events) {
    // gk_faced はGK表側で集計する(選手表に空行を作らない)
    if (!e.player_id || e.type === "gk_faced") continue;
    const line = ensure(e.player_id);
    switch (e.type) {
      case "shot": {
        const col = shotColumnOf(e);
        line.shots[col].attempts += 1;
        line.shotAttempts += 1;
        if (e.result === "goal") {
          line.shots[col].goals += 1;
          line.shotGoals += 1;
        }
        break;
      }
      case "assist":
        line.assists += 1;
        break;
      case "cut":
        line.cuts += 1;
        break;
      case "drawn_exclusion":
        if (e.subtype === "penalty") line.drawnPenalty += 1;
        else line.drawnExclusion += 1;
        break;
      case "exclusion":
        line.exclusions += 1;
        break;
      case "offensive_foul":
        line.offensiveFouls += 1;
        break;
      case "miss":
        if (e.subtype === "pass") line.missPass += 1;
        else if (e.subtype === "keep") line.missKeep += 1;
        else line.missOther += 1;
        break;
    }
  }

  for (const line of lines.values()) {
    line.shotRate =
      line.shotAttempts > 0 ? line.shotGoals / line.shotAttempts : null;
  }

  return [...lines.values()].sort((a, b) => a.cap_number - b.cap_number);
}

export interface GkLine {
  user_id: string;
  name: string;
  cap_number: number;
  faced: number;
  goalsAgainst: number;
  blocks: number;
  offTarget: number;
  /** 枠内シュート阻止率 = block ÷ (失点 + block)。分母0ならnull */
  saveRate: number | null;
}

export function buildGkLines(
  events: StatsEvent[],
  roster: RosterEntry[]
): GkLine[] {
  const gks = new Map<string, GkLine>();
  const ensure = (userId: string): GkLine => {
    let line = gks.get(userId);
    if (!line) {
      const r = roster.find((x) => x.user_id === userId);
      line = {
        user_id: userId,
        name: r?.name ?? "不明",
        cap_number: r?.cap_number ?? 99,
        faced: 0,
        goalsAgainst: 0,
        blocks: 0,
        offTarget: 0,
        saveRate: null,
      };
      gks.set(userId, line);
    }
    return line;
  };

  for (const r of roster.filter((r) => r.is_gk)) ensure(r.user_id);

  for (const e of events) {
    if (e.type !== "gk_faced" || !e.player_id) continue;
    const line = ensure(e.player_id);
    line.faced += 1;
    if (e.result === "goal_against") line.goalsAgainst += 1;
    else if (e.result === "block") line.blocks += 1;
    else line.offTarget += 1;
  }

  for (const line of gks.values()) {
    const denom = line.goalsAgainst + line.blocks;
    line.saveRate = denom > 0 ? line.blocks / denom : null;
  }

  return [...gks.values()].sort((a, b) => a.cap_number - b.cap_number);
}

export interface TeamSummary {
  /** クォーターごとの自チーム得点(index: quarter) */
  goalsFor: Record<Quarter, number>;
  /** クォーターごとの相手得点 */
  goalsAgainst: Record<Quarter, number>;
  totalFor: number;
  totalAgainst: number;
  /** 退水決定率: 退水誘発のうちエキストラマンで得点できた割合 */
  drawnExclusions: number;
  extraManGoals: number;
  exclusionRate: number | null;
  /** Q別「シュートまで持ち込んだ回数/攻撃数」 */
  attackEfficiency: Record<Quarter, { shots: number; attacks: number }>;
}

const zeroByQuarter = (): Record<Quarter, number> =>
  ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }) as Record<Quarter, number>;

export function buildTeamSummary(events: StatsEvent[]): TeamSummary {
  const goalsFor = zeroByQuarter();
  const goalsAgainst = zeroByQuarter();
  const attackEfficiency = Object.fromEntries(
    QUARTERS.map((q) => [q, { shots: 0, attacks: 0 }])
  ) as Record<Quarter, { shots: number; attacks: number }>;

  let drawnExclusions = 0;
  let extraManGoals = 0;

  for (const e of events) {
    const q = e.quarter;
    switch (e.type) {
      case "shot":
        attackEfficiency[q].shots += 1;
        attackEfficiency[q].attacks += 1;
        if (e.result === "goal") {
          goalsFor[q] += 1;
          if (e.is_extra_man) extraManGoals += 1;
        }
        break;
      case "attack_end_no_shot":
        attackEfficiency[q].attacks += 1;
        break;
      case "drawn_exclusion":
        if (e.subtype !== "penalty") drawnExclusions += 1;
        break;
      // 相手得点: GK経由(gk_faced goal_against)を正とし、
      // GKが関与しないもののみ opponent_goal で記録する運用
      case "gk_faced":
        if (e.result === "goal_against") goalsAgainst[q] += 1;
        break;
      case "opponent_goal":
        goalsAgainst[q] += 1;
        break;
    }
  }

  const totalFor = QUARTERS.reduce((s, q) => s + goalsFor[q], 0);
  const totalAgainst = QUARTERS.reduce((s, q) => s + goalsAgainst[q], 0);

  return {
    goalsFor,
    goalsAgainst,
    totalFor,
    totalAgainst,
    drawnExclusions,
    extraManGoals,
    exclusionRate:
      drawnExclusions > 0 ? extraManGoals / drawnExclusions : null,
    attackEfficiency,
  };
}

export function formatRate(rate: number | null): string {
  if (rate == null) return "-";
  return `${Math.round(rate * 100)}%`;
}

// ---------- ランキング(全試合の記録から主要アクションを集計) ----------

export interface RankingEntry {
  user_id: string;
  count: number;
}

export interface Rankings {
  goals: RankingEntry[];
  assists: RankingEntry[];
  /** 退水誘発(E誘発+P誘発) */
  drawnExclusions: RankingEntry[];
  cuts: RankingEntry[];
  gkBlocks: RankingEntry[];
}

export function buildRankings(events: StatsEvent[]): Rankings {
  const counters: Record<keyof Rankings, Map<string, number>> = {
    goals: new Map(),
    assists: new Map(),
    drawnExclusions: new Map(),
    cuts: new Map(),
    gkBlocks: new Map(),
  };
  const bump = (key: keyof Rankings, userId: string) =>
    counters[key].set(userId, (counters[key].get(userId) ?? 0) + 1);

  for (const e of events) {
    if (!e.player_id) continue;
    if (e.type === "shot" && e.result === "goal") bump("goals", e.player_id);
    if (e.type === "assist") bump("assists", e.player_id);
    if (e.type === "drawn_exclusion") bump("drawnExclusions", e.player_id);
    if (e.type === "cut") bump("cuts", e.player_id);
    if (e.type === "gk_faced" && e.result === "block") bump("gkBlocks", e.player_id);
  }

  const toSorted = (m: Map<string, number>): RankingEntry[] =>
    [...m.entries()]
      .map(([user_id, count]) => ({ user_id, count }))
      .sort((a, b) => b.count - a.count);

  return {
    goals: toSorted(counters.goals),
    assists: toSorted(counters.assists),
    drawnExclusions: toSorted(counters.drawnExclusions),
    cuts: toSorted(counters.cuts),
    gkBlocks: toSorted(counters.gkBlocks),
  };
}
