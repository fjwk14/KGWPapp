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
  it("決定力 = G + (シュート率)*5(フィニッシュのみ)", () => {
    const events = [
      ev({ type: "shot", player_id: "p1", result: "goal" }),
      ev({ type: "shot", player_id: "p1", result: "goal" }),
      ev({ type: "shot", player_id: "p1", result: "miss" }),
      ev({ type: "shot", player_id: "p1", result: "miss" }),
      ev({ type: "drive_break", player_id: "p1" }), // 決定力ではなく創出力に効く
    ];
    const [p1] = buildPerformanceProfiles(events, roster);
    const decisiveness = p1.axes.find((a) => a.key === "decisiveness")!;
    // G=2, SH=4, shotRate=0.5 -> 2 + 0.5*5 = 4.5(ドライブ突破は含まない)
    expect(decisiveness.rawValue).toBeCloseTo(4.5);
  });

  it("創出力 = A + DE + マーク外し + スクリーン + ドライブ突破", () => {
    const events = [
      ev({ type: "assist", player_id: "p1" }),
      ev({ type: "assist", player_id: "p1" }),
      ev({ type: "drawn_exclusion", player_id: "p1", subtype: "exclusion" }),
      ev({ type: "drawn_exclusion", player_id: "p1", subtype: "penalty" }),
      ev({ type: "off_ball_move", player_id: "p1" }),
      ev({ type: "screen", player_id: "p1" }),
      ev({ type: "drive_break", player_id: "p1" }),
    ];
    const [p1] = buildPerformanceProfiles(events, roster);
    const creativity = p1.axes.find((a) => a.key === "creativity")!;
    // A=2, DE=2, OBM=1, SCR=1, DB=1 -> 7
    expect(creativity.rawValue).toBeCloseTo(7);
  });

  it("展開力 = 縦パス + 速攻参加 + サイド展開 + アシスト*0.5", () => {
    const events = [
      ev({ type: "key_pass", player_id: "p1" }),
      ev({ type: "counter_join", player_id: "p1" }),
      ev({ type: "side_switch", player_id: "p1" }),
      ev({ type: "assist", player_id: "p1" }),
    ];
    const [p1] = buildPerformanceProfiles(events, roster);
    const buildup = p1.axes.find((a) => a.key === "buildup")!;
    // KP=1, CJ=1, SS=1, A=1 -> 1+1+1+0.5 = 3.5
    expect(buildup.rawValue).toBeCloseTo(3.5);
  });

  it("全6軸が実データ算出(approx=false)になった", () => {
    const [p1] = buildPerformanceProfiles([], roster);
    for (const key of ["buildup", "defense", "decisiveness", "creativity", "steal", "efficiency"]) {
      expect(p1.axes.find((a) => a.key === key)!.approx).toBe(false);
    }
  });

  it("判断力(steal) = カット + スティール + リバウンド奪取", () => {
    const events = [
      ev({ type: "cut", player_id: "p1" }),
      ev({ type: "cut", player_id: "p1" }),
      ev({ type: "steal_ball", player_id: "p1" }),
      ev({ type: "rebound_win", player_id: "p1" }),
    ];
    const [p1] = buildPerformanceProfiles(events, roster);
    const steal = p1.axes.find((a) => a.key === "steal")!;
    expect(steal.label).toBe("判断力");
    expect(steal.rawValue).toBeCloseTo(4); // C=2, STL=1, RW=1
  });

  it("守備力(defense) = 対人守備 + シュートブロック - 被退水*0.5、負はclamp", () => {
    const events = [
      ev({ type: "defense_stop", player_id: "p1" }),
      ev({ type: "defense_stop", player_id: "p1" }),
      ev({ type: "shot_block", player_id: "p1" }),
      ev({ type: "exclusion", player_id: "p1" }),
    ];
    const [p1] = buildPerformanceProfiles(events, roster);
    const defense = p1.axes.find((a) => a.key === "defense")!;
    expect(defense.label).toBe("守備力");
    // DS=2, SB=1, EX=1 -> 2 + 1 - 0.5 = 2.5
    expect(defense.rawValue).toBeCloseTo(2.5);
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
