import { describe, expect, it } from "vitest";
import {
  buildGkLines,
  buildPlayerLines,
  buildTeamSummary,
  describeEvent,
  formatRate,
  shotColumnOf,
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
    ).toBe("選手A: センターシュート ◯ゴール (E)");
    expect(describeEvent(ev({ type: "attack_end_no_shot", player_id: null }), nameOf)).toBe(
      "攻撃終了(シュートなし)"
    );
  });
  it("formatRateはnullを-にする", () => {
    expect(formatRate(null)).toBe("-");
    expect(formatRate(0.5)).toBe("50%");
  });
});
