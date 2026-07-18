import { describe, expect, it } from "vitest";
import {
  buildGkLines,
  buildOpponentSummary,
  buildPlayerLines,
  buildRankings,
  buildTeamSummary,
  describeEvent,
  formatRate,
  shotColumnOf,
  yearsOf,
  type RosterEntry,
  type StatsEvent,
} from "@/lib/stats";

let seq = 0;
function ev(partial: Partial<StatsEvent> & Pick<StatsEvent, "type">): StatsEvent {
  return {
    id: `e${seq++}`,
    match_id: "m1",
    quarter: 1,
    player_id: "p1",
    subtype: null,
    result: null,
    is_extra_man: false,
    ...partial,
  };
}

const roster: RosterEntry[] = [
  { user_id: "p1", name: "選手A", cap_number: 2, is_gk: false },
  { user_id: "p2", name: "選手B", cap_number: 5, is_gk: false },
  { user_id: "gk1", name: "キーパー", cap_number: 1, is_gk: true },
];

describe("shotColumnOf (紙シートの列振り分け)", () => {
  it("ペナルティはEでもP列", () => {
    expect(
      shotColumnOf(ev({ type: "shot", subtype: "penalty", result: "goal", is_extra_man: true }))
    ).toBe("penalty");
  });
  it("エキストラマン中のシュートはE列", () => {
    expect(
      shotColumnOf(ev({ type: "shot", subtype: "center", result: "goal", is_extra_man: true }))
    ).toBe("extra");
  });
  it("通常時は種別の列", () => {
    expect(shotColumnOf(ev({ type: "shot", subtype: "drive", result: "miss" }))).toBe("drive");
  });
});

describe("buildPlayerLines", () => {
  it("シュート率 = ゴール数 ÷ 試投数", () => {
    const events = [
      ev({ type: "shot", subtype: "center", result: "goal" }),
      ev({ type: "shot", subtype: "center", result: "miss" }),
      ev({ type: "shot", subtype: "drive", result: "blocked" }),
      ev({ type: "shot", subtype: "six_m", result: "goal" }),
    ];
    const [line] = buildPlayerLines(events, roster);
    expect(line.name).toBe("選手A");
    expect(line.shotAttempts).toBe(4);
    expect(line.shotGoals).toBe(2);
    expect(line.shotRate).toBeCloseTo(0.5);
    expect(line.shots.center).toEqual({ goals: 1, attempts: 2 });
  });

  it("誘発はP/E別、ミスはP/K/M別に数える", () => {
    const events = [
      ev({ type: "drawn_exclusion", subtype: "exclusion" }),
      ev({ type: "drawn_exclusion", subtype: "exclusion" }),
      ev({ type: "drawn_exclusion", subtype: "penalty" }),
      ev({ type: "miss", subtype: "pass" }),
      ev({ type: "miss", subtype: "keep" }),
      ev({ type: "miss", subtype: "other" }),
      ev({ type: "assist" }),
      ev({ type: "cut" }),
      ev({ type: "exclusion" }),
      ev({ type: "offensive_foul" }),
    ];
    const [line] = buildPlayerLines(events, roster);
    expect(line.drawnExclusion).toBe(2);
    expect(line.drawnPenalty).toBe(1);
    expect(line.missPass).toBe(1);
    expect(line.missKeep).toBe(1);
    expect(line.missOther).toBe(1);
    expect(line.assists).toBe(1);
    expect(line.cuts).toBe(1);
    expect(line.exclusions).toBe(1);
    expect(line.offensiveFouls).toBe(1);
  });

  it("イベントの無いフィールド選手も行に出る(GKは出ない)、帽子番号順", () => {
    const lines = buildPlayerLines([], roster);
    expect(lines.map((l) => l.name)).toEqual(["選手A", "選手B"]);
    expect(lines[0].shotRate).toBeNull();
  });
});

describe("buildGkLines", () => {
  it("阻止率 = ブロック ÷ (失点 + ブロック)。枠外は分母に入れない", () => {
    const events = [
      ev({ type: "gk_faced", player_id: "gk1", result: "goal_against" }),
      ev({ type: "gk_faced", player_id: "gk1", result: "block" }),
      ev({ type: "gk_faced", player_id: "gk1", result: "block" }),
      ev({ type: "gk_faced", player_id: "gk1", result: "block" }),
      ev({ type: "gk_faced", player_id: "gk1", result: "off_target" }),
    ];
    const [gk] = buildGkLines(events, roster);
    expect(gk.faced).toBe(5);
    expect(gk.goalsAgainst).toBe(1);
    expect(gk.blocks).toBe(3);
    expect(gk.offTarget).toBe(1);
    expect(gk.saveRate).toBeCloseTo(0.75);
  });
});

describe("buildTeamSummary", () => {
  it("Q別スコア: 自チーム=shot(goal)、相手=gk_faced(goal_against)+opponent_goal", () => {
    const events = [
      ev({ type: "shot", subtype: "center", result: "goal", quarter: 1 }),
      ev({ type: "shot", subtype: "drive", result: "goal", quarter: 3 }),
      ev({ type: "gk_faced", player_id: "gk1", result: "goal_against", quarter: 1 }),
      ev({ type: "opponent_goal", player_id: null, quarter: 4 }),
      ev({ type: "shot", subtype: "six_m", result: "goal", quarter: 5 }), // PSO
    ];
    const s = buildTeamSummary(events);
    expect(s.goalsFor[1]).toBe(1);
    expect(s.goalsFor[3]).toBe(1);
    expect(s.goalsFor[5]).toBe(1);
    expect(s.totalFor).toBe(3);
    expect(s.goalsAgainst[1]).toBe(1);
    expect(s.goalsAgainst[4]).toBe(1);
    expect(s.totalAgainst).toBe(2);
  });

  it("退水決定率 = エキストラマン得点 ÷ 退水誘発数(ペナルティ誘発は分母に入れない)", () => {
    const events = [
      ev({ type: "drawn_exclusion", subtype: "exclusion" }),
      ev({ type: "drawn_exclusion", subtype: "exclusion" }),
      ev({ type: "drawn_exclusion", subtype: "exclusion" }),
      ev({ type: "drawn_exclusion", subtype: "penalty" }),
      ev({ type: "shot", subtype: "center", result: "goal", is_extra_man: true }),
      ev({ type: "shot", subtype: "center", result: "miss", is_extra_man: true }),
    ];
    const s = buildTeamSummary(events);
    expect(s.drawnExclusions).toBe(3);
    expect(s.extraManGoals).toBe(1);
    expect(s.exclusionRate).toBeCloseTo(1 / 3);
  });

  it("退水守備成功率 = 5対6を凌いだ数 ÷ 自チームの退水数", () => {
    const events = [
      ev({ type: "exclusion" }),
      ev({ type: "exclusion" }),
      ev({ type: "exclusion" }),
      ev({ type: "down_man_stop" }),
      ev({ type: "down_man_stop" }),
    ];
    const s = buildTeamSummary(events);
    expect(s.manDownDefenses).toBe(3);
    expect(s.manDownStops).toBe(2);
    expect(s.manDownStopRate).toBeCloseTo(2 / 3);
  });

  it("退水守備成功率は5対6局面が無ければnull", () => {
    const s = buildTeamSummary([]);
    expect(s.manDownStopRate).toBeNull();
  });

  it("Q別攻撃効率 = シュート数 / (シュート数 + 攻撃終了数)", () => {
    const events = [
      ev({ type: "shot", subtype: "center", result: "miss", quarter: 2 }),
      ev({ type: "shot", subtype: "drive", result: "goal", quarter: 2 }),
      ev({ type: "attack_end_no_shot", player_id: null, quarter: 2 }),
    ];
    const s = buildTeamSummary(events);
    expect(s.attackEfficiency[2]).toEqual({ shots: 2, attacks: 3 });
  });
});

describe("describeEvent / formatRate", () => {
  const nameOf = () => "選手A";
  it("イベントを日本語1行にする", () => {
    expect(
      describeEvent(ev({ type: "shot", subtype: "center", result: "goal", is_extra_man: true }), nameOf)
    ).toBe("選手A: センターシュート ゴール (E)");
    expect(describeEvent(ev({ type: "attack_end_no_shot", player_id: null }), nameOf)).toBe(
      "時間使い切り(攻撃終了)"
    );
  });
  it("formatRateはnullを-にする", () => {
    expect(formatRate(null)).toBe("-");
    expect(formatRate(0.5)).toBe("50%");
  });
});

describe("buildRankings (主要アクションのランキング)", () => {
  it("得点・アシスト・退水誘発・カット・GKブロックを人数分集計し降順で返す", () => {
    const events: StatsEvent[] = [
      // p1: 2得点(うち1本はミスなので数えない)
      ev({ type: "shot", player_id: "p1", subtype: "center", result: "goal" }),
      ev({ type: "shot", player_id: "p1", subtype: "drive", result: "goal" }),
      ev({ type: "shot", player_id: "p1", subtype: "six_m", result: "miss" }),
      // p2: 1得点・2アシスト
      ev({ type: "shot", player_id: "p2", subtype: "center", result: "goal" }),
      ev({ type: "assist", player_id: "p2" }),
      ev({ type: "assist", player_id: "p2" }),
      // 退水誘発はE・P合算
      ev({ type: "drawn_exclusion", player_id: "p1", subtype: "exclusion" }),
      ev({ type: "drawn_exclusion", player_id: "p1", subtype: "penalty" }),
      // カットとGK
      ev({ type: "cut", player_id: "p2" }),
      ev({ type: "gk_faced", player_id: "gk1", result: "block" }),
      ev({ type: "gk_faced", player_id: "gk1", result: "goal_against" }),
      // チームイベントは対象外
      ev({ type: "opponent_goal", player_id: null }),
    ];
    const r = buildRankings(events);
    expect(r.goals).toEqual([
      { user_id: "p1", count: 2 },
      { user_id: "p2", count: 1 },
    ]);
    expect(r.assists).toEqual([{ user_id: "p2", count: 2 }]);
    expect(r.drawnExclusions).toEqual([{ user_id: "p1", count: 2 }]);
    expect(r.cuts).toEqual([{ user_id: "p2", count: 1 }]);
    expect(r.gkBlocks).toEqual([{ user_id: "gk1", count: 1 }]);
  });

  it("記録がなければ全カテゴリ空配列", () => {
    const r = buildRankings([]);
    expect(r.goals).toEqual([]);
    expect(r.gkBlocks).toEqual([]);
  });
});

describe("buildOpponentSummary", () => {
  it("対戦相手ごとに勝敗・得失点を集計する", () => {
    const matches = [
      { opponent: "A大学", result: "win", score_for: 10, score_against: 8 },
      { opponent: "A大学", result: "lose", score_for: 7, score_against: 9 },
      { opponent: "B大学", result: "draw", score_for: 8, score_against: 8 },
    ];
    const summary = buildOpponentSummary(matches);
    const a = summary.find((s) => s.opponent === "A大学")!;
    expect(a.played).toBe(2);
    expect(a.wins).toBe(1);
    expect(a.losses).toBe(1);
    expect(a.goalsFor).toBe(17);
    expect(a.goalsAgainst).toBe(17);
    const b = summary.find((s) => s.opponent === "B大学")!;
    expect(b.draws).toBe(1);
  });

  it("対戦相手が未入力の試合は除外する", () => {
    const matches = [
      { opponent: null, result: "win", score_for: 5, score_against: 3 },
      { opponent: "  ", result: "win", score_for: 5, score_against: 3 },
    ];
    expect(buildOpponentSummary(matches)).toEqual([]);
  });

  it("対戦数が多い順に並ぶ", () => {
    const matches = [
      { opponent: "A", result: "win", score_for: 1, score_against: 0 },
      { opponent: "B", result: "win", score_for: 1, score_against: 0 },
      { opponent: "B", result: "win", score_for: 1, score_against: 0 },
    ];
    const summary = buildOpponentSummary(matches);
    expect(summary[0].opponent).toBe("B");
  });
});

describe("yearsOf", () => {
  it("重複を除いた年度を新しい順で返す", () => {
    expect(yearsOf(["2026-04-01", "2025-11-02", "2026-07-01", null])).toEqual([
      2026, 2025,
    ]);
  });

  it("日付が無ければ空配列", () => {
    expect(yearsOf([null, null])).toEqual([]);
  });
});
