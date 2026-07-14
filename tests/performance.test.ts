import { describe, expect, it } from "vitest";
import {
  buildGkPerformance,
  buildPerformanceProfiles,
} from "@/lib/performance";
import type { RosterEntry, StatsEvent } from "@/lib/stats";

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

describe("buildPerformanceProfiles", () => {
  it("決定力 = G + (シュート率)*5", () => {
    const events = [
      ev({ type: "shot", player_id: "p1", result: "goal" }),
      ev({ type: "shot", player_id: "p1", result: "goal" }),
      ev({ type: "shot", player_id: "p1", result: "miss" }),
      ev({ type: "shot", player_id: "p1", result: "miss" }),
    ];
    const [p1] = buildPerformanceProfiles(events, roster);
    const decisiveness = p1.axes.find((a) => a.key === "decisiveness")!;
    // G=2, SH=4, shotRate=0.5 -> 2 + 0.5*5 = 4.5
    expect(decisiveness.rawValue).toBeCloseTo(4.5);
  });

  it("創出力 = A + DE(退水/ペナルティ誘発、subtype問わず)", () => {
    const events = [
      ev({ type: "assist", player_id: "p1" }),
      ev({ type: "assist", player_id: "p1" }),
      ev({ type: "drawn_exclusion", player_id: "p1", subtype: "exclusion" }),
      ev({ type: "drawn_exclusion", player_id: "p1", subtype: "penalty" }),
    ];
    const [p1] = buildPerformanceProfiles(events, roster);
    const creativity = p1.axes.find((a) => a.key === "creativity")!;
    expect(creativity.rawValue).toBeCloseTo(2 + 2); // A=2, DE=2
  });

  it("全6軸が実データ算出(approx=false)になった", () => {
    const [p1] = buildPerformanceProfiles([], roster);
    for (const key of ["buildup", "defense", "decisiveness", "creativity", "steal", "efficiency"]) {
      expect(p1.axes.find((a) => a.key === key)!.approx).toBe(false);
    }
  });

  it("展開力 = 縦パス + 速攻参加 + アシスト*0.5", () => {
    const events = [
      ev({ type: "key_pass", player_id: "p1" }),
      ev({ type: "key_pass", player_id: "p1" }),
      ev({ type: "counter_join", player_id: "p1" }),
      ev({ type: "assist", player_id: "p1" }),
    ];
    const [p1] = buildPerformanceProfiles(events, roster);
    const buildup = p1.axes.find((a) => a.key === "buildup")!;
    // KP=2, CJ=1, A=1 -> 2 + 1 + 0.5 = 3.5
    expect(buildup.rawValue).toBeCloseTo(3.5);
  });

  it("対人守備 = 対人守備成功 - 被退水*0.5、負にはならずclamp", () => {
    const events = [
      ev({ type: "defense_stop", player_id: "p1" }),
      ev({ type: "defense_stop", player_id: "p1" }),
      ev({ type: "exclusion", player_id: "p1" }),
    ];
    const [p1] = buildPerformanceProfiles(events, roster);
    const defense = p1.axes.find((a) => a.key === "defense")!;
    // DS=2, EX=1 -> 2 - 0.5 = 1.5
    expect(defense.rawValue).toBeCloseTo(1.5);
  });

  it("効率性は負になりうる(生値はclampしない、Tには反映される)", () => {
    const events = [
      ev({ type: "miss", player_id: "p1", subtype: "pass" }),
      ev({ type: "miss", player_id: "p1", subtype: "keep" }),
      ev({ type: "offensive_foul", player_id: "p1" }),
    ];
    const [p1] = buildPerformanceProfiles(events, roster);
    const efficiency = p1.axes.find((a) => a.key === "efficiency")!;
    // SH=0 -> shotRate=0 -> 0*10 - (2+1) = -3
    expect(efficiency.rawValue).toBe(-3);
  });

  it("イベントの多い選手のTスコアがチーム内で高くなる(相対評価)", () => {
    const events = [
      ev({ type: "shot", player_id: "p1", result: "goal" }),
      ev({ type: "shot", player_id: "p1", result: "goal" }),
      ev({ type: "shot", player_id: "p2", result: "miss" }),
    ];
    const profiles = buildPerformanceProfiles(events, roster);
    const p1 = profiles.find((p) => p.user_id === "p1")!;
    const p2 = profiles.find((p) => p.user_id === "p2")!;
    const p1Decisiveness = p1.axes.find((a) => a.key === "decisiveness")!.t;
    const p2Decisiveness = p2.axes.find((a) => a.key === "decisiveness")!.t;
    expect(p1Decisiveness).toBeGreaterThan(p2Decisiveness);
  });

  it("overallPerformanceは6軸Tの平均を0〜100に丸める", () => {
    const [p1] = buildPerformanceProfiles([], roster);
    expect(p1.overallPerformance).toBe(50);
  });

  it("GKはプロフィールに含まれない(帽子番号順にフィールド選手のみ)", () => {
    const profiles = buildPerformanceProfiles([], roster);
    expect(profiles.map((p) => p.user_id)).toEqual(["p1", "p2"]);
  });
});

describe("buildGkPerformance", () => {
  it("セーブ率・被シュート数・失点数を返す(6軸には含まれない専用集計)", () => {
    const events = [
      ev({ type: "gk_faced", player_id: "gk1", result: "goal_against" }),
      ev({ type: "gk_faced", player_id: "gk1", result: "block" }),
      ev({ type: "gk_faced", player_id: "gk1", result: "block" }),
      ev({ type: "gk_faced", player_id: "gk1", result: "off_target" }),
    ];
    const [gk] = buildGkPerformance(events, roster);
    expect(gk.faced).toBe(4);
    expect(gk.goalsAgainst).toBe(1);
    expect(gk.saveRate).toBeCloseTo(2 / 3);
  });

  it("記録が無ければsaveRateはnull", () => {
    const [gk] = buildGkPerformance([], roster);
    expect(gk.faced).toBe(0);
    expect(gk.saveRate).toBeNull();
  });
});
