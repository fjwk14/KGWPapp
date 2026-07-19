import { describe, expect, it } from "vitest";
import {
  computePoints,
  earnedBadges,
  emptyPointInputs,
  levelOf,
  nextLevelProgress,
  type PointInputs,
} from "@/lib/points";

function inputs(overrides: Partial<PointInputs> = {}): PointInputs {
  return { ...emptyPointInputs(), ...overrides };
}

describe("computePoints", () => {
  it("空入力は0点", () => {
    expect(computePoints(emptyPointInputs()).total).toBe(0);
  });

  it("コンディションは記録した日ごとに+2(重複日は1回)", () => {
    const b = computePoints(
      inputs({ conditionDates: ["2026-07-15", "2026-07-15", "2026-07-16"] })
    );
    expect(b.condition).toBe(4); // 2日分
  });

  it("コメントは1日3件までを配点(連投対策)", () => {
    const b = computePoints(
      inputs({
        commentDates: [
          "2026-07-15", "2026-07-15", "2026-07-15", "2026-07-15", "2026-07-15", // 5件→3件分
          "2026-07-16", // 1件
        ],
      })
    );
    expect(b.comments).toBe(4); // 3 + 1
  });

  it("各行動が加点され合計される", () => {
    const b = computePoints(
      inputs({
        conditionDates: ["2026-07-15"], // +2
        attendanceAnswers: 3, // +3
        selfPracticeDates: ["2026-07-15", "2026-07-16"], // +6
        peerFeedbackSent: 2, // +10
        repliesReceived: 1, // +3
        clipsCreated: 1, // +4
        tagsAdded: 5, // +5
        proposalsAdopted: 1, // +30
        qaAnswers: 2, // +6
        qaBestAnswers: 1, // +10
        manualPoints: 15, // +15
      })
    );
    expect(b.total).toBe(2 + 3 + 6 + 10 + 3 + 4 + 5 + 30 + 6 + 10 + 15);
  });

  it("自主練は記録した日ごとに+3(重複日は1回)", () => {
    const b = computePoints(
      inputs({ selfPracticeDates: ["2026-07-15", "2026-07-15", "2026-07-16"] })
    );
    expect(b.selfPractice).toBe(6); // 2日分
  });

  it("手動付与ポイントはそのまま合算される", () => {
    const b = computePoints(inputs({ manualPoints: 42 }));
    expect(b.manual).toBe(42);
    expect(b.total).toBe(42);
  });

  it("学連関与試合は1件につき+3(学連ロールのメンバーのみ加算される想定)", () => {
    const b = computePoints(inputs({ gakurenMatches: 4 }));
    expect(b.gakuren).toBe(12);
    expect(b.total).toBe(12);
  });
});

describe("levelOf / nextLevelProgress", () => {
  it("累積ポイントに応じたレベルを返す", () => {
    expect(levelOf(0).key).toBe("slate");
    expect(levelOf(49).key).toBe("slate");
    expect(levelOf(50).key).toBe("blue");
    expect(levelOf(150).key).toBe("bronze");
    expect(levelOf(700).key).toBe("gold");
    expect(levelOf(5000).key).toBe("rainbow");
  });

  it("次レベルまでの残りと進捗を返す", () => {
    const p = nextLevelProgress(100); // blue(50)〜bronze(150)の中間
    expect(p.next?.key).toBe("bronze");
    expect(p.remaining).toBe(50);
    expect(p.ratio).toBeCloseTo(0.5, 5);
  });

  it("最高レベルは次なし", () => {
    const p = nextLevelProgress(3000);
    expect(p.next).toBeNull();
    expect(p.ratio).toBe(1);
  });
});

describe("earnedBadges", () => {
  it("ポイントがあれば「はじめの一歩」", () => {
    const b = earnedBadges(inputs({ conditionDates: ["2026-07-15"] }), 2);
    expect(b.some((x) => x.key === "first_step")).toBe(true);
  });

  it("提案採用・ベストアンサー・虹のバッジ", () => {
    const badges = earnedBadges(
      inputs({ proposalsAdopted: 1, qaBestAnswers: 1 }),
      2500
    );
    const keys = badges.map((b) => b.key);
    expect(keys).toContain("adopted");
    expect(keys).toContain("best_answer");
    expect(keys).toContain("rainbow");
  });

  it("自主練15日で「自主練の鬼」、手動付与で「特別功労」", () => {
    const dates = Array.from({ length: 15 }, (_, i) => `2026-07-${String(i + 1).padStart(2, "0")}`);
    const badges = earnedBadges(
      inputs({ selfPracticeDates: dates, manualPoints: 10 }),
      45 + 10
    );
    const keys = badges.map((b) => b.key);
    expect(keys).toContain("self_starter");
    expect(keys).toContain("recognized");
  });
});
