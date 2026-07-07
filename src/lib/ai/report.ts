import { aiReportSchema, type AiReport } from "@/lib/validation";
import { getAIProvider } from "./provider";
import type { ClipComment, ClipTag, Match, VideoClip } from "@/lib/types";
import { formatSeconds } from "@/lib/video";

export interface ReportInput {
  match: Match;
  clips: VideoClip[];
  tags: ClipTag[];
  comments: (ClipComment & { author_name: string })[];
}

// AI出力を強制するJSON Schema(zodのaiReportSchemaと同じ形)
const REPORT_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "レポートタイトル(日本語)" },
    summary: { type: "string", description: "試合全体の総括(3〜5文)" },
    offensive_findings: { type: "string", description: "攻撃面の分析" },
    defensive_findings: { type: "string", description: "守備面の分析" },
    transition_findings: {
      type: "string",
      description: "カウンター・切り替え(トランジション)の分析",
    },
    key_problem_patterns: {
      type: "array",
      items: { type: "string" },
      description: "繰り返し発生している問題パターン",
    },
    recommended_training_themes: {
      type: "array",
      items: { type: "string" },
      description: "次回練習テーマの提案",
    },
    meeting_points: {
      type: "array",
      items: { type: "string" },
      description: "試合前ミーティングで共有すべき要点",
    },
    ai_confidence: {
      type: "number",
      description: "データ量に基づく分析の確信度 0〜1",
    },
  },
  required: [
    "title",
    "summary",
    "offensive_findings",
    "defensive_findings",
    "transition_findings",
    "key_problem_patterns",
    "recommended_training_themes",
    "meeting_points",
    "ai_confidence",
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `あなたは大学水球チームの戦術アナリストです。
人間の戦術班が作成したクリップ・タグ・コメントを整理・集計し、示唆を出すのが役割です。
動画そのものは見ていないため、断定しすぎず、必ずタグとコメントを根拠として引用してください。
分析観点: 得点/失点パターン、カウンター成功・失敗、退水獲得・退水守備、パスミス傾向、
シュート選択、ポジション別課題、選手別改善点、次回練習テーマ、ミーティング共有事項。
出力はすべて日本語で書いてください。`;

export function buildReportPrompt(input: ReportInput): string {
  const { match, clips, tags, comments } = input;
  const tagsByClip = new Map<string, ClipTag[]>();
  for (const t of tags) {
    const list = tagsByClip.get(t.clip_id) ?? [];
    list.push(t);
    tagsByClip.set(t.clip_id, list);
  }
  const commentsByClip = new Map<string, typeof comments>();
  for (const c of comments) {
    const list = commentsByClip.get(c.clip_id) ?? [];
    list.push(c);
    commentsByClip.set(c.clip_id, list);
  }

  const clipSections = clips.map((clip) => {
    const clipTags = (tagsByClip.get(clip.id) ?? [])
      .map((t) => `${t.tag_type}:${t.tag_value}`)
      .join(", ");
    const clipComments = (commentsByClip.get(clip.id) ?? [])
      .map((c) => `- [${c.comment_type}] ${c.author_name}: ${c.comment}`)
      .join("\n");
    return [
      `### クリップ: ${clip.title}`,
      `時間: ${formatSeconds(clip.start_time_seconds)}〜${formatSeconds(clip.end_time_seconds)}${clip.quarter ? ` (Q${clip.quarter})` : ""}`,
      clip.description ? `説明: ${clip.description}` : null,
      clipTags ? `タグ: ${clipTags}` : "タグ: なし",
      clipComments ? `コメント:\n${clipComments}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  });

  const tagCounts = new Map<string, number>();
  for (const t of tags) {
    const key = `${t.tag_type}:${t.tag_value}`;
    tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1);
  }
  const tagSummary = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `- ${k}: ${n}件`)
    .join("\n");

  return [
    `## 試合情報`,
    `試合名: ${match.title}`,
    match.opponent ? `対戦相手: ${match.opponent}` : null,
    match.match_date ? `日付: ${match.match_date}` : null,
    match.score_for != null && match.score_against != null
      ? `スコア: ${match.score_for} - ${match.score_against} (${match.result ?? "不明"})`
      : null,
    match.notes ? `メモ: ${match.notes}` : null,
    ``,
    `## タグ集計 (全${tags.length}件)`,
    tagSummary || "(タグなし)",
    ``,
    `## クリップ詳細 (全${clips.length}件)`,
    ...clipSections,
    ``,
    `上記のクリップ・タグ・コメントをもとに戦術レポートを作成してください。`,
    `データが少ない場合はai_confidenceを低くし、その旨をsummaryに明記してください。`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

// AIキー未設定時のルールベースフォールバック。
// タグ集計から機械的にレポートを組み立てる(デモ用途)。
export function buildFallbackReport(input: ReportInput): AiReport {
  const { match, clips, tags } = input;
  const count = (type: string, value?: string) =>
    tags.filter(
      (t) => t.tag_type === type && (value === undefined || t.tag_value === value)
    ).length;

  const goals = count("result", "得点");
  const concede = count("result", "失点");
  const counters = count("phase", "カウンター") + count("action", "カウンター");
  const counterConceded = count("phase", "被カウンター") + count("result", "カウンター被弾");
  const passMiss = count("action", "パスミス");
  // ダッシュボードの「退水関連」と同じ基準(タグ値ベース)で数える
  const exclusions = new Set(
    tags
      .filter((t) => ["退水", "退水獲得", "退水守備"].includes(t.tag_value))
      .map((t) => t.clip_id)
  ).size;

  const topCauses = Object.entries(
    tags
      .filter((t) => t.tag_type === "cause")
      .reduce<Record<string, number>>((acc, t) => {
        acc[t.tag_value] = (acc[t.tag_value] ?? 0) + 1;
        return acc;
      }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const themes =
    topCauses.length > 0
      ? topCauses.map(([cause]) => `「${cause}」を減らすための反復練習`)
      : ["クリップとタグを増やして傾向を可視化する"];

  return {
    title: `${match.title} 戦術レポート(自動集計)`,
    summary: `クリップ${clips.length}件・タグ${tags.length}件からの自動集計レポートです。AIプロバイダーが未設定のため、タグ集計に基づく機械的なサマリーを表示しています。得点タグ${goals}件・失点タグ${concede}件が記録されています。`,
    offensive_findings: `得点関連タグ: ${goals}件。シュート関連: ${count("action", "シュート")}件。6対5関連: ${count("phase", "6対5")}件。`,
    defensive_findings: `失点関連タグ: ${concede}件。退水関連: ${exclusions}件。守備成功: ${count("result", "守備成功")}件。`,
    transition_findings: `カウンター関連: ${counters}件、被カウンター関連: ${counterConceded}件、パスミス: ${passMiss}件。`,
    key_problem_patterns: topCauses.map(([cause, n]) => `${cause}(${n}件)`),
    recommended_training_themes: themes,
    meeting_points:
      concede > 0
        ? [`失点場面(${concede}件)のクリップを全員で確認する`]
        : ["タグ付けされたクリップを全員で確認する"],
    ai_confidence: Math.min(0.4, tags.length / 100),
  };
}

export async function generateTacticalReport(
  input: ReportInput
): Promise<{ report: AiReport; provider: string }> {
  const provider = getAIProvider();
  if (!provider) {
    return { report: buildFallbackReport(input), provider: "fallback" };
  }

  const raw = await provider.completeJson({
    system: SYSTEM_PROMPT,
    prompt: buildReportPrompt(input),
    schema: REPORT_JSON_SCHEMA as unknown as Record<string, unknown>,
  });

  // AI出力のJSON型検証(スキーマ不一致は例外)
  const parsed = aiReportSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`AI出力の検証に失敗しました: ${parsed.error.message}`);
  }
  return { report: parsed.data, provider: provider.name };
}
