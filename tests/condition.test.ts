import { describe, expect, it } from "vitest";
import {
  buildConditionAdvice,
  summarizeByMonth,
  summarizeByWeek,
  todayJST,
  weekStartOf,
  type ConditionLogEntry,
} from "@/lib/condition";

function log(
  date: string,
  overrides: Partial<ConditionLogEntry> = {}
): ConditionLogEntry {
  return {
    log_date: date,
    condition: 3,
    motivation: 3,
    sleep_hours: 7,
    pain_level: 0,
    ...overrides,
  };
}

describe("weekStartOf", () => {
  it("その週の月曜日を返す", () => {
    expect(weekStartOf("2026-07-15")).toBe("2026-07-13"); // 水→月
    expect(weekStartOf("2026-07-13")).toBe("2026-07-13"); // 月→同日
    expect(weekStartOf("2026-07-19")).toBe("2026-07-13"); // 日→前の月曜
  });
});

describe("todayJST", () => {
  it("UTC深夜でも日本時間の日付になる", () => {
    // UTC 2026-07-14 20:00 = JST 2026-07-15 05:00
    expect(todayJST(new Date("2026-07-14T20:00:00Z"))).toBe("2026-07-15");
  });
});

describe("summarizeByWeek / summarizeByMonth", () => {
  it("週ごとに平均・最大痛みを集計し、新しい週が先頭", () => {
    const logs = [
      log("2026-07-13", { condition: 4, sleep_hours: 8 }),
      log("2026-07-14", { condition: 2, sleep_hours: 6, pain_level: 2 }),
      log("2026-07-06", { condition: 5, sleep_hours: null }),
    ];
    const weekly = summarizeByWeek(logs);
    expect(weekly.map((w) => w.period)).toEqual(["2026-07-13", "2026-07-06"]);
    const w1 = weekly[0];
    expect(w1.count).toBe(2);
    expect(w1.avgCondition).toBe(3);
    expect(w1.avgSleep).toBe(7);
    expect(w1.maxPain).toBe(2);
    // 睡眠未入力は平均から除外(nullのみならnull)
    expect(weekly[1].avgSleep).toBeNull();
  });

  it("月ごとに集計する", () => {
    const logs = [
      log("2026-07-01", { condition: 4 }),
      log("2026-07-20", { condition: 2 }),
      log("2026-06-15", { condition: 5 }),
    ];
    const monthly = summarizeByMonth(logs);
    expect(monthly.map((m) => m.period)).toEqual(["2026-07", "2026-06"]);
    expect(monthly[0].avgCondition).toBe(3);
  });
});

describe("buildConditionAdvice", () => {
  it("記録が無ければ記録開始をすすめる", () => {
    expect(buildConditionAdvice([])[0]).toContain("記録");
  });

  it("痛みが続いていたら最優先で警告する", () => {
    const logs = [
      log("2026-07-15", { pain_level: 2, pain_note: "右肩" }),
      log("2026-07-14", { pain_level: 3, pain_note: "右肩" }),
      log("2026-07-13", { pain_level: 2 }),
    ];
    const advice = buildConditionAdvice(logs);
    expect(advice[0]).toContain("痛みが続いています");
    expect(advice[0]).toContain("右肩");
  });

  it("睡眠不足を指摘する", () => {
    const logs = [
      log("2026-07-15", { sleep_hours: 5 }),
      log("2026-07-14", { sleep_hours: 5.5 }),
      log("2026-07-13", { sleep_hours: 6 }),
    ];
    expect(buildConditionAdvice(logs).some((a) => a.includes("睡眠"))).toBe(true);
  });

  it("調子の低下トレンドを検出する", () => {
    const logs = [
      // 直近7日: 平均2
      log("2026-07-15", { condition: 2 }),
      log("2026-07-14", { condition: 2 }),
      // 前の7日: 平均4
      log("2026-07-07", { condition: 4 }),
      log("2026-07-06", { condition: 4 }),
    ];
    expect(
      buildConditionAdvice(logs).some((a) => a.includes("疲労"))
    ).toBe(true);
  });

  it("やる気低下をフォローする", () => {
    const logs = [
      log("2026-07-15", { motivation: 2 }),
      log("2026-07-14", { motivation: 2 }),
    ];
    expect(
      buildConditionAdvice(logs).some((a) => a.includes("やる気"))
    ).toBe(true);
  });

  it("問題が無ければ良好メッセージ", () => {
    const logs = [
      log("2026-07-15", { condition: 4, motivation: 4, sleep_hours: 7.5 }),
      log("2026-07-14", { condition: 4, motivation: 5, sleep_hours: 8 }),
    ];
    const advice = buildConditionAdvice(logs);
    expect(advice).toHaveLength(1);
    expect(advice[0]).toContain("良好");
  });
});
