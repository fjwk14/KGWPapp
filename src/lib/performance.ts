// プレー総合スコア(フィールド選手6軸 + GK別集計)。
// 既存の stats_events(src/lib/stats.ts の StatsEvent)から算出する純関数。
import type { RosterEntry, StatsEvent } from "./stats";
import { deviationScore } from "./physical";

interface RawPlayerStats {
  user_id: string;
  G: number; // 得点
  SH: number; // シュート数
  A: number; // アシスト
  DE: number; // 退水/ペナルティ誘発(subtype問わず)
  C: number; // カット
  EX: number; // 退水された数
  OF: number; // オフェンシブファウル
  MISS: number; // ミス
  KP: number; // 縦パス(起点)
  CJ: number; // 速攻参加
  DS: number; // 対人守備成功
}

function buildRawPlayerStats(
  events: StatsEvent[],
  roster: RosterEntry[]
): RawPlayerStats[] {
  const stats = new Map<string, RawPlayerStats>();
  const ensure = (userId: string): RawPlayerStats => {
    let s = stats.get(userId);
    if (!s) {
      s = { user_id: userId, G: 0, SH: 0, A: 0, DE: 0, C: 0, EX: 0, OF: 0, MISS: 0, KP: 0, CJ: 0, DS: 0 };
      stats.set(userId, s);
    }
    return s;
  };

  // フィールド選手はイベントが無くても行を出す(GKは別集計)
  for (const r of roster.filter((r) => !r.is_gk)) ensure(r.user_id);

  for (const e of events) {
    if (!e.player_id || e.type === "gk_faced") continue;
    const s = ensure(e.player_id);
    switch (e.type) {
      case "shot":
        s.SH += 1;
        if (e.result === "goal") s.G += 1;
        break;
      case "assist":
        s.A += 1;
        break;
      case "drawn_exclusion":
        s.DE += 1;
        break;
      case "cut":
        s.C += 1;
        break;
      case "exclusion":
        s.EX += 1;
        break;
      case "offensive_foul":
        s.OF += 1;
        break;
      case "miss":
        s.MISS += 1;
        break;
      case "key_pass":
        s.KP += 1;
        break;
      case "counter_join":
        s.CJ += 1;
        break;
      case "defense_stop":
        s.DS += 1;
        break;
    }
  }

  return [...stats.values()];
}

export const PERFORMANCE_AXES = [
  "decisiveness",
  "creativity",
  "buildup",
  "defense",
  "steal",
  "efficiency",
] as const;
export type PerformanceAxisKey = (typeof PERFORMANCE_AXES)[number];

export const PERFORMANCE_AXIS_LABELS: Record<PerformanceAxisKey, string> = {
  decisiveness: "決定力",
  creativity: "創出力",
  buildup: "展開力",
  defense: "対人守備",
  steal: "ボール奪取",
  efficiency: "効率性",
};

// 全6軸を試合記録の実データから算出(0014で展開力・対人守備の専用項目を追加)
export const PERFORMANCE_AXIS_APPROX: Record<PerformanceAxisKey, boolean> = {
  decisiveness: false,
  creativity: false,
  buildup: false,
  defense: false,
  steal: false,
  efficiency: false,
};

function rawAxisValues(s: RawPlayerStats): Record<PerformanceAxisKey, number> {
  const shotRate = s.SH > 0 ? s.G / s.SH : 0;
  return {
    decisiveness: s.G + shotRate * 5,
    creativity: s.A + s.DE,
    // 展開力: 縦パス(起点)+ 速攻参加 + アシストの一部
    buildup: s.KP + s.CJ + s.A * 0.5,
    // 対人守備: 対人守備成功が主。被退水はマイナス
    defense: Math.max(0, s.DS - s.EX * 0.5),
    steal: s.C,
    efficiency: shotRate * 10 - (s.MISS + s.OF),
  };
}

export interface PerformanceAxisScore {
  key: PerformanceAxisKey;
  label: string;
  rawValue: number;
  t: number;
  approx: boolean;
}

export interface PlayerPerformanceProfile {
  user_id: string;
  name: string;
  cap_number: number;
  axes: PerformanceAxisScore[];
  overallPerformance: number;
}

export function buildPerformanceProfiles(
  events: StatsEvent[],
  roster: RosterEntry[]
): PlayerPerformanceProfile[] {
  const rawStats = buildRawPlayerStats(events, roster);
  const rawByUser = new Map(rawStats.map((s) => [s.user_id, rawAxisValues(s)]));
  const rosterByUser = new Map(roster.map((r) => [r.user_id, r]));

  const allValuesByAxis: Record<PerformanceAxisKey, number[]> = Object.fromEntries(
    PERFORMANCE_AXES.map((axis) => [
      axis,
      [...rawByUser.values()].map((v) => v[axis]),
    ])
  ) as Record<PerformanceAxisKey, number[]>;

  return rawStats
    .map((s) => {
      const r = rosterByUser.get(s.user_id);
      const raw = rawByUser.get(s.user_id)!;
      const axes: PerformanceAxisScore[] = PERFORMANCE_AXES.map((axis) => ({
        key: axis,
        label: PERFORMANCE_AXIS_LABELS[axis],
        rawValue: raw[axis],
        t: deviationScore(allValuesByAxis[axis], raw[axis], true),
        approx: PERFORMANCE_AXIS_APPROX[axis],
      }));
      const overallPerformance = Math.min(
        100,
        Math.max(0, Math.round(axes.reduce((sum, a) => sum + a.t, 0) / axes.length))
      );
      return {
        user_id: s.user_id,
        name: r?.name ?? "不明",
        cap_number: r?.cap_number ?? 99,
        axes,
        overallPerformance,
      };
    })
    .sort((a, b) => a.cap_number - b.cap_number);
}

// ---------- GK: 6軸レーダーには載せない専用集計 ----------

export interface GkPerformanceCard {
  user_id: string;
  name: string;
  cap_number: number;
  faced: number;
  goalsAgainst: number;
  saveRate: number | null;
}

export function buildGkPerformance(
  events: StatsEvent[],
  roster: RosterEntry[]
): GkPerformanceCard[] {
  const cards = new Map<string, GkPerformanceCard>();
  const ensure = (userId: string): GkPerformanceCard => {
    let c = cards.get(userId);
    if (!c) {
      const r = roster.find((x) => x.user_id === userId);
      c = {
        user_id: userId,
        name: r?.name ?? "不明",
        cap_number: r?.cap_number ?? 99,
        faced: 0,
        goalsAgainst: 0,
        saveRate: null,
      };
      cards.set(userId, c);
    }
    return c;
  };

  for (const r of roster.filter((r) => r.is_gk)) ensure(r.user_id);

  const blocksByUser = new Map<string, number>();
  for (const e of events) {
    if (e.type !== "gk_faced" || !e.player_id) continue;
    const c = ensure(e.player_id);
    c.faced += 1;
    if (e.result === "goal_against") c.goalsAgainst += 1;
    else if (e.result === "block") {
      blocksByUser.set(e.player_id, (blocksByUser.get(e.player_id) ?? 0) + 1);
    }
  }

  for (const c of cards.values()) {
    const b = blocksByUser.get(c.user_id) ?? 0;
    const denom = c.goalsAgainst + b;
    c.saveRate = denom > 0 ? b / denom : null;
  }

  return [...cards.values()].sort((a, b) => a.cap_number - b.cap_number);
}
