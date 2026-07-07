import { describe, expect, it } from "vitest";
import { buildFallbackReport, buildReportPrompt } from "@/lib/ai/report";
import { aiReportSchema } from "@/lib/validation";
import type { ClipTag, Match, VideoClip } from "@/lib/types";

const match: Match = {
  id: "m1",
  team_id: "t1",
  title: "テスト試合",
  opponent: "A大学",
  match_date: "2026-07-01",
  competition: null,
  result: "lose",
  score_for: 8,
  score_against: 11,
  video_url: null,
  notes: null,
  created_by: null,
  created_at: new Date().toISOString(),
};

const clips: VideoClip[] = [
  {
    id: "c1",
    team_id: "t1",
    match_id: "m1",
    title: "カウンター失点",
    start_time_seconds: 615,
    end_time_seconds: 645,
    quarter: 2,
    description: "戻り遅れ",
    created_by: null,
    created_at: new Date().toISOString(),
  },
];

const tags: ClipTag[] = [
  { id: "t1", team_id: "t1", clip_id: "c1", tag_type: "cause", tag_value: "戻り遅れ" },
  { id: "t2", team_id: "t1", clip_id: "c1", tag_type: "result", tag_value: "失点" },
  { id: "t3", team_id: "t1", clip_id: "c1", tag_type: "phase", tag_value: "被カウンター" },
];

describe("buildReportPrompt", () => {
  it("試合情報・タグ集計・クリップ・コメントを含む", () => {
    const prompt = buildReportPrompt({
      match,
      clips,
      tags,
      comments: [
        {
          id: "cm1",
          team_id: "t1",
          clip_id: "c1",
          user_id: "u1",
          comment: "切り替えを速く",
          comment_type: "tactical_opinion",
          created_at: new Date().toISOString(),
          author_name: "主将テスト",
        },
      ],
    });
    expect(prompt).toContain("テスト試合");
    expect(prompt).toContain("cause:戻り遅れ");
    expect(prompt).toContain("カウンター失点");
    expect(prompt).toContain("切り替えを速く");
    expect(prompt).toContain("主将テスト");
  });
});

describe("buildFallbackReport", () => {
  it("AIプロバイダー無しでもスキーマに適合するレポートを生成する", () => {
    const report = buildFallbackReport({ match, clips, tags, comments: [] });
    const parsed = aiReportSchema.safeParse(report);
    expect(parsed.success).toBe(true);
  });

  it("原因タグの上位が問題パターン・練習テーマに反映される", () => {
    const report = buildFallbackReport({ match, clips, tags, comments: [] });
    expect(report.key_problem_patterns.join()).toContain("戻り遅れ");
    expect(report.recommended_training_themes.join()).toContain("戻り遅れ");
  });

  it("データが少ないほど確信度が低い", () => {
    const report = buildFallbackReport({ match, clips, tags, comments: [] });
    expect(report.ai_confidence).toBeLessThanOrEqual(0.4);
  });
});
