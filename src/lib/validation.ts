import { z } from "zod";

export const TAG_TYPES = [
  "action",
  "cause",
  "result",
  "phase",
  "player",
  "tactic",
  "situation",
] as const;

export const COMMENT_TYPES = [
  "observation",
  "question",
  "tactical_opinion",
  "coaching_note",
] as const;

const optionalUrl = z
  .string()
  .trim()
  .url({ message: "URLの形式が正しくありません" })
  .optional()
  .or(z.literal("").transform(() => undefined));

export const matchSchema = z.object({
  title: z.string().trim().min(1, "試合名は必須です").max(120),
  opponent: z.string().trim().max(120).optional(),
  match_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が正しくありません")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  competition: z.string().trim().max(120).optional(),
  result: z.enum(["win", "lose", "draw"]).optional().or(z.literal("").transform(() => undefined)),
  score_for: z.coerce.number().int().min(0).max(99).optional(),
  score_against: z.coerce.number().int().min(0).max(99).optional(),
  video_url: optionalUrl,
  notes: z.string().trim().max(2000).optional(),
});

export const clipSchema = z
  .object({
    title: z.string().trim().min(1, "クリップ名は必須です").max(120),
    start_time_seconds: z.coerce
      .number()
      .int()
      .min(0, "開始秒は0以上にしてください"),
    end_time_seconds: z.coerce
      .number()
      .int()
      .min(1, "終了秒は1以上にしてください"),
    quarter: z.coerce
      .number()
      .int()
      .min(1, "クォーターは1〜4です")
      .max(4, "クォーターは1〜4です")
      .optional(),
    description: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.start_time_seconds < v.end_time_seconds, {
    message: "開始秒は終了秒より前にしてください",
    path: ["end_time_seconds"],
  });

export const tagSchema = z.object({
  tag_type: z.enum(TAG_TYPES, { message: "不正なタグ種別です" }),
  tag_value: z.string().trim().min(1, "タグ値は必須です").max(60),
});

export const commentSchema = z.object({
  comment: z.string().trim().min(1, "コメントを入力してください").max(1000),
  comment_type: z.enum(COMMENT_TYPES),
});

export const teamSchema = z.object({
  name: z.string().trim().min(1, "チーム名は必須です").max(80),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "slugは小文字英数字とハイフンのみ"),
});

export const tagTemplateSchema = z.object({
  tag_type: z.enum(TAG_TYPES),
  tag_value: z.string().trim().min(1, "タグ値は必須です").max(60),
  description: z.string().trim().max(200).optional(),
});

// AI戦術レポートの出力JSONスキーマ(AI出力の型検証に使用)
export const aiReportSchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1),
  offensive_findings: z.string(),
  defensive_findings: z.string(),
  transition_findings: z.string(),
  key_problem_patterns: z.array(z.string()).max(10),
  recommended_training_themes: z.array(z.string()).min(1).max(10),
  meeting_points: z.array(z.string()).max(10),
  ai_confidence: z.number().min(0).max(1),
});

export type AiReport = z.infer<typeof aiReportSchema>;
