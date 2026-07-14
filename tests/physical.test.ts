import { describe, expect, it } from "vitest";
import {
  buildMetricRanking,
  buildOverallRanking,
  buildPhysicalProfiles,
  deviationScore,
  generatePhysicalComment,
  type PhysicalMeasurementRow,
  type PhysicalRosterEntry,
} from "@/lib/physical";

const roster: PhysicalRosterEntry[] = [
  { user_id: "p1", name: "選手A", cap_number: 2, is_gk: false, field_position: 6 },
  { user_id: "p2", name: "選手B", cap_number: 5, is_gk: false, field_position: 6 },
  { user_id: "p3", name: "選手C", cap_number: 3, is_gk: false, field_position: 1 },
  { user_id: "gk1", name: "キーパー", cap_number: 1, is_gk: true, field_position: null },
];

function row(
  partial: Partial<PhysicalMeasurementRow> & Pick<PhysicalMeasurementRow, "user_id" | "metric" | "value">
): PhysicalMeasurementRow {
  return { measured_on: "2026-06-01", ...partial };
}

describe("deviationScore", () => {
  it("平均と同値ならT=50", () => {
    expect(deviationScore([10, 20, 30], 20, true)).toBeCloseTo(50);
  });

  it("higherIsBetter=trueなら値が大きいほどTが高い", () => {
    const values = [10, 20, 30];
    expect(deviationScore(values, 30, true)).toBeGreaterThan(50);
    expect(deviationScore(values, 10, true)).toBeLessThan(50);
  });

  it("higherIsBetter=falseなら向きが反転する(値が小さいほどTが高い)", () => {
    const values = [10, 20, 30];
    expect(deviationScore(values, 10, false)).toBeGreaterThan(50);
    expect(deviationScore(values, 30, false)).toBeLessThan(50);
  });

  it("sd=0または1件以下ならT=50", () => {
    expect(deviationScore([5, 5, 5], 5, true)).toBe(50);
    expect(deviationScore([5], 5, true)).toBe(50);
    expect(deviationScore([], 5, true)).toBe(50);
  });

  it("0〜100にclampされる", () => {
    const values = [0, 0, 0, 0, 100];
    expect(deviationScore(values, 100, true)).toBeLessThanOrEqual(100);
    expect(deviationScore(values, 0, true)).toBeGreaterThanOrEqual(0);
  });
});

describe("buildPhysicalProfiles", () => {
  it("最新measured_onの値を採用する(古い記録は無視)", () => {
    const rows: PhysicalMeasurementRow[] = [
      row({ user_id: "p1", metric: "vertical", value: 50, measured_on: "2026-01-01" }),
      row({ user_id: "p1", metric: "vertical", value: 60, measured_on: "2026-06-01" }),
      row({ user_id: "p2", metric: "vertical", value: 55, measured_on: "2026-03-01" }),
    ];
    const profiles = buildPhysicalProfiles(rows, roster);
    const p1 = profiles.find((p) => p.user_id === "p1")!;
    const metric = p1.metrics.find((m) => m.key === "vertical")!;
    expect(metric.value).toBe(60);
  });

  it("higherIsBetter=falseの項目(10mスプリント)は速い(小さい)方がTが高い", () => {
    const rows: PhysicalMeasurementRow[] = [
      row({ user_id: "p1", metric: "sprint10", value: 5.0 }),
      row({ user_id: "p2", metric: "sprint10", value: 6.0 }),
    ];
    const profiles = buildPhysicalProfiles(rows, roster);
    const p1Metric = profiles.find((p) => p.user_id === "p1")!.metrics.find((m) => m.key === "sprint10")!;
    const p2Metric = profiles.find((p) => p.user_id === "p2")!.metrics.find((m) => m.key === "sprint10")!;
    expect(p1Metric.teamT!).toBeGreaterThan(p2Metric.teamT!);
    // 軸(スプリント力)にも反映される
    const p1Axis = profiles.find((p) => p.user_id === "p1")!.axes.find((a) => a.key === "sprint")!;
    const p2Axis = profiles.find((p) => p.user_id === "p2")!.axes.find((a) => a.key === "sprint")!;
    expect(p1Axis.teamT).toBeGreaterThan(p2Axis.teamT);
  });

  it("同ポジション平均のTは同ポジションが2人未満ならnull", () => {
    const rows: PhysicalMeasurementRow[] = [
      row({ user_id: "p3", metric: "vertical", value: 50 }),
    ];
    const profiles = buildPhysicalProfiles(rows, roster);
    const p3 = profiles.find((p) => p.user_id === "p3")!;
    const metric = p3.metrics.find((m) => m.key === "vertical")!;
    expect(metric.positionT).toBeNull(); // ポジション1(field_position=1)はp3のみ
  });

  it("同ポジションが2人以上いればpositionTが計算される", () => {
    const rows: PhysicalMeasurementRow[] = [
      row({ user_id: "p1", metric: "vertical", value: 40 }),
      row({ user_id: "p2", metric: "vertical", value: 60 }),
    ];
    const profiles = buildPhysicalProfiles(rows, roster);
    const p1 = profiles.find((p) => p.user_id === "p1")!.metrics.find((m) => m.key === "vertical")!;
    expect(p1.positionT).not.toBeNull();
  });

  it("未測定は項目T=null・軸T=50・総合50", () => {
    const profiles = buildPhysicalProfiles([], roster);
    const p1 = profiles.find((p) => p.user_id === "p1")!;
    for (const m of p1.metrics) {
      expect(m.value).toBeNull();
      expect(m.teamT).toBeNull();
    }
    for (const axis of p1.axes) {
      expect(axis.teamT).toBe(50);
      expect(axis.measuredCount).toBe(0);
    }
    expect(p1.overallPhysicalScore).toBe(50);
  });

  it("軸Tは軸内の測定済み項目Tの平均(未測定項目は無視)", () => {
    // 筋力軸: pullupsのみ測定 → 軸T = pullupsのT
    const rows: PhysicalMeasurementRow[] = [
      row({ user_id: "p1", metric: "pullups", value: 20 }),
      row({ user_id: "p2", metric: "pullups", value: 10 }),
    ];
    const profiles = buildPhysicalProfiles(rows, roster);
    const p1 = profiles.find((p) => p.user_id === "p1")!;
    const strengthAxis = p1.axes.find((a) => a.key === "strength")!;
    const pullups = p1.metrics.find((m) => m.key === "pullups")!;
    expect(strengthAxis.measuredCount).toBe(1);
    expect(strengthAxis.teamT).toBeCloseTo(pullups.teamT!);
  });

  it("6軸(筋力/体幹/持久力/スプリント力/投力/精度)が揃っている", () => {
    const profiles = buildPhysicalProfiles([], roster);
    const labels = profiles[0].axes.map((a) => a.label);
    expect(labels).toEqual(["筋力", "体幹", "持久力", "スプリント力", "投力", "精度"]);
  });

  it("overallPhysicalScoreは6軸Tの平均を0〜100に丸める", () => {
    const rows: PhysicalMeasurementRow[] = [
      row({ user_id: "p1", metric: "vertical", value: 100 }),
      row({ user_id: "p2", metric: "vertical", value: 0 }),
    ];
    const profiles = buildPhysicalProfiles(rows, roster);
    const p1 = profiles.find((p) => p.user_id === "p1")!;
    expect(p1.overallPhysicalScore).toBeGreaterThanOrEqual(0);
    expect(p1.overallPhysicalScore).toBeLessThanOrEqual(100);
    expect(Number.isInteger(p1.overallPhysicalScore)).toBe(true);
  });
});

describe("buildMetricRanking", () => {
  it("higherIsBetterな項目は降順", () => {
    const rows: PhysicalMeasurementRow[] = [
      row({ user_id: "p1", metric: "vertical", value: 50 }),
      row({ user_id: "p2", metric: "vertical", value: 70 }),
      row({ user_id: "p3", metric: "vertical", value: 60 }),
    ];
    const ranking = buildMetricRanking(rows, roster, "vertical");
    expect(ranking.map((r) => r.user_id)).toEqual(["p2", "p3", "p1"]);
  });

  it("higherIsBetter=falseな項目(タイム)は昇順", () => {
    const rows: PhysicalMeasurementRow[] = [
      row({ user_id: "p1", metric: "sprint10", value: 5.5 }),
      row({ user_id: "p2", metric: "sprint10", value: 4.9 }),
      row({ user_id: "p3", metric: "sprint10", value: 5.2 }),
    ];
    const ranking = buildMetricRanking(rows, roster, "sprint10");
    expect(ranking.map((r) => r.user_id)).toEqual(["p2", "p3", "p1"]);
  });

  it("最新measured_onの値を使う", () => {
    const rows: PhysicalMeasurementRow[] = [
      row({ user_id: "p1", metric: "vertical", value: 40, measured_on: "2026-01-01" }),
      row({ user_id: "p1", metric: "vertical", value: 90, measured_on: "2026-06-01" }),
    ];
    const ranking = buildMetricRanking(rows, roster, "vertical");
    expect(ranking[0].value).toBe(90);
  });
});

describe("buildOverallRanking", () => {
  it("スコア降順に並ぶ", () => {
    const rows: PhysicalMeasurementRow[] = [
      row({ user_id: "p1", metric: "vertical", value: 100 }),
      row({ user_id: "p2", metric: "vertical", value: 0 }),
    ];
    const profiles = buildPhysicalProfiles(rows, roster);
    const overall = buildOverallRanking(profiles);
    expect(overall[0].user_id).toBe("p1");
    expect(overall[0].score).toBeGreaterThanOrEqual(overall[overall.length - 1].score);
  });
});

describe("generatePhysicalComment", () => {
  it("未測定なら記録を促すコメントを返す", () => {
    const profiles = buildPhysicalProfiles([], roster);
    const comment = generatePhysicalComment(profiles.find((p) => p.user_id === "p1")!);
    expect(comment).toContain("記録");
  });

  it("強み・伸びしろのある選手にはそれぞれ言及する", () => {
    const rows: PhysicalMeasurementRow[] = [
      row({ user_id: "p1", metric: "vertical", value: 100 }),
      row({ user_id: "p1", metric: "throw_max", value: 100 }),
      row({ user_id: "p1", metric: "sprint10", value: 10 }), // 遅い(悪い)
      row({ user_id: "p2", metric: "vertical", value: 0 }),
      row({ user_id: "p2", metric: "throw_max", value: 0 }),
      row({ user_id: "p2", metric: "sprint10", value: 4 }), // 速い(良い)
    ];
    const profiles = buildPhysicalProfiles(rows, roster);
    const p1 = profiles.find((p) => p.user_id === "p1")!;
    const comment = generatePhysicalComment(p1);
    expect(comment.length).toBeGreaterThan(0);
    expect(comment).toMatch(/伸びしろ|強み|得点源/);
  });
});
