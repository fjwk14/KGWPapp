import { describe, expect, it } from "vitest";
import { buildFeedbackPairs, feedbackTargetOf } from "@/lib/feedback";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `user-${i + 1}`);

describe("buildFeedbackPairs", () => {
  it("全員がちょうど1回送り、1回受け取る(自分自身には当たらない)", () => {
    const users = ids(7);
    const pairs = buildFeedbackPairs("practice-abc", users);
    expect(pairs).toHaveLength(7);
    expect(new Set(pairs.map((p) => p.from)).size).toBe(7);
    expect(new Set(pairs.map((p) => p.to)).size).toBe(7);
    for (const p of pairs) expect(p.from).not.toBe(p.to);
  });

  it("同じシード・同じ参加者なら常に同じ結果(決定的)", () => {
    const users = ids(10);
    const a = buildFeedbackPairs("practice-xyz", users);
    const b = buildFeedbackPairs("practice-xyz", [...users].reverse());
    expect(a).toEqual(b);
  });

  it("シード(練習)が違えばペアが変わる", () => {
    const users = ids(10);
    const a = buildFeedbackPairs("practice-1", users);
    const b = buildFeedbackPairs("practice-2", users);
    expect(a).not.toEqual(b);
  });

  it("2人なら相互に送り合う", () => {
    const pairs = buildFeedbackPairs("p", ["a", "b"]);
    expect(pairs).toHaveLength(2);
    const map = new Map(pairs.map((p) => [p.from, p.to]));
    expect(map.get("a")).toBe("b");
    expect(map.get("b")).toBe("a");
  });

  it("2人未満はペアなし", () => {
    expect(buildFeedbackPairs("p", ["a"])).toEqual([]);
    expect(buildFeedbackPairs("p", [])).toEqual([]);
  });

  it("重複IDは除外して扱う", () => {
    const pairs = buildFeedbackPairs("p", ["a", "b", "a", "b"]);
    expect(pairs).toHaveLength(2);
  });
});

describe("feedbackTargetOf", () => {
  it("参加者には相手を返し、不参加者にはnull", () => {
    const users = ids(5);
    const target = feedbackTargetOf("practice-abc", users, "user-1");
    expect(target).not.toBeNull();
    expect(users).toContain(target);
    expect(feedbackTargetOf("practice-abc", users, "outsider")).toBeNull();
  });
});
