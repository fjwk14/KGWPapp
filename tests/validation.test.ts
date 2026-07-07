import { describe, expect, it } from "vitest";
import {
  clipSchema,
  commentSchema,
  matchSchema,
  tagSchema,
  aiReportSchema,
} from "@/lib/validation";

describe("matchSchema", () => {
  it("必須項目(title)が無いと失敗する", () => {
    expect(matchSchema.safeParse({ title: "" }).success).toBe(false);
    expect(matchSchema.safeParse({}).success).toBe(false);
  });

  it("有効な入力を受け付ける", () => {
    const result = matchSchema.safeParse({
      title: "リーグ第1戦",
      opponent: "A大学",
      match_date: "2026-07-01",
      score_for: "8",
      score_against: "11",
      video_url: "https://www.youtube.com/watch?v=abc",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.score_for).toBe(8);
    }
  });

  it("URL形式チェック: 不正なURLは失敗する", () => {
    expect(
      matchSchema.safeParse({ title: "x", video_url: "not-a-url" }).success
    ).toBe(false);
  });

  it("空のURLはundefinedとして受け付ける", () => {
    const result = matchSchema.safeParse({ title: "x", video_url: "" });
    expect(result.success).toBe(true);
  });

  it("負のスコアは失敗する", () => {
    expect(
      matchSchema.safeParse({ title: "x", score_for: "-1" }).success
    ).toBe(false);
  });
});

describe("clipSchema", () => {
  const base = { title: "クリップ", start_time_seconds: "10", end_time_seconds: "30" };

  it("start_time_seconds < end_time_seconds を強制する", () => {
    expect(clipSchema.safeParse(base).success).toBe(true);
    expect(
      clipSchema.safeParse({ ...base, start_time_seconds: "30", end_time_seconds: "30" })
        .success
    ).toBe(false);
    expect(
      clipSchema.safeParse({ ...base, start_time_seconds: "40", end_time_seconds: "30" })
        .success
    ).toBe(false);
  });

  it("quarterは1〜4のみ", () => {
    expect(clipSchema.safeParse({ ...base, quarter: "1" }).success).toBe(true);
    expect(clipSchema.safeParse({ ...base, quarter: "4" }).success).toBe(true);
    expect(clipSchema.safeParse({ ...base, quarter: "0" }).success).toBe(false);
    expect(clipSchema.safeParse({ ...base, quarter: "5" }).success).toBe(false);
  });

  it("タイトル必須", () => {
    expect(clipSchema.safeParse({ ...base, title: "" }).success).toBe(false);
  });
});

describe("tagSchema", () => {
  it("tag_typeは定義済みの値のみ許可する", () => {
    expect(tagSchema.safeParse({ tag_type: "action", tag_value: "シュート" }).success).toBe(true);
    expect(tagSchema.safeParse({ tag_type: "cause", tag_value: "判断ミス" }).success).toBe(true);
    expect(tagSchema.safeParse({ tag_type: "invalid", tag_value: "x" }).success).toBe(false);
    expect(tagSchema.safeParse({ tag_type: "", tag_value: "x" }).success).toBe(false);
  });

  it("tag_valueは必須", () => {
    expect(tagSchema.safeParse({ tag_type: "action", tag_value: "" }).success).toBe(false);
  });
});

describe("commentSchema", () => {
  it("comment_typeは定義済みの値のみ", () => {
    expect(
      commentSchema.safeParse({ comment: "ok", comment_type: "observation" }).success
    ).toBe(true);
    expect(
      commentSchema.safeParse({ comment: "ok", comment_type: "chat" }).success
    ).toBe(false);
  });

  it("空コメント・1000文字超は失敗する", () => {
    expect(
      commentSchema.safeParse({ comment: "", comment_type: "observation" }).success
    ).toBe(false);
    expect(
      commentSchema.safeParse({
        comment: "あ".repeat(1001),
        comment_type: "observation",
      }).success
    ).toBe(false);
  });
});

describe("aiReportSchema (AI出力のJSON型検証)", () => {
  const valid = {
    title: "テストレポート",
    summary: "総括",
    offensive_findings: "攻撃",
    defensive_findings: "守備",
    transition_findings: "切替",
    key_problem_patterns: ["戻り遅れ"],
    recommended_training_themes: ["カウンター対応"],
    meeting_points: ["失点場面の確認"],
    ai_confidence: 0.7,
  };

  it("有効なレポートを受け付ける", () => {
    expect(aiReportSchema.safeParse(valid).success).toBe(true);
  });

  it("ai_confidenceは0〜1", () => {
    expect(aiReportSchema.safeParse({ ...valid, ai_confidence: 1.5 }).success).toBe(false);
    expect(aiReportSchema.safeParse({ ...valid, ai_confidence: -0.1 }).success).toBe(false);
  });

  it("必須フィールド欠落は失敗する", () => {
    const { summary: _summary, ...missing } = valid;
    expect(aiReportSchema.safeParse(missing).success).toBe(false);
  });

  it("練習テーマは最低1件必要", () => {
    expect(
      aiReportSchema.safeParse({ ...valid, recommended_training_themes: [] }).success
    ).toBe(false);
  });
});
