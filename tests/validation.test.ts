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

  it("javascript:等の危険なスキームは拒否する(XSS防止)", () => {
    expect(
      matchSchema.safeParse({ title: "x", video_url: "javascript:alert(1)" })
        .success
    ).toBe(false);
    expect(
      matchSchema.safeParse({ title: "x", video_url: "data:text/html,x" })
        .success
    ).toBe(false);
  });

  it("空欄のopponent/notesはundefinedになる(空文字を保存しない)", () => {
    const result = matchSchema.safeParse({ title: "x", opponent: "", notes: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.opponent).toBeUndefined();
      expect(result.data.notes).toBeUndefined();
    }
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

  it("開始秒の空文字は0扱いにせず必須エラーになる", () => {
    expect(
      clipSchema.safeParse({ ...base, start_time_seconds: "" }).success
    ).toBe(false);
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

  it("ai_confidenceは0〜1にクランプされる(範囲外でも生成を失敗させない)", () => {
    const over = aiReportSchema.safeParse({ ...valid, ai_confidence: 1.5 });
    expect(over.success).toBe(true);
    if (over.success) expect(over.data.ai_confidence).toBe(1);
    const under = aiReportSchema.safeParse({ ...valid, ai_confidence: -0.1 });
    expect(under.success).toBe(true);
    if (under.success) expect(under.data.ai_confidence).toBe(0);
  });

  it("必須フィールド欠落は失敗する", () => {
    const { summary: _summary, ...missing } = valid;
    expect(aiReportSchema.safeParse(missing).success).toBe(false);
  });

  it("配列は10件・タイトルは120文字に切り詰められる", () => {
    const result = aiReportSchema.safeParse({
      ...valid,
      title: "あ".repeat(200),
      key_problem_patterns: Array.from({ length: 15 }, (_, i) => `p${i}`),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title.length).toBe(120);
      expect(result.data.key_problem_patterns.length).toBe(10);
    }
  });
});
