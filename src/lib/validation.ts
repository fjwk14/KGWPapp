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

// javascript:等のスキームを拒否し、http/httpsのみ許可する
const optionalUrl = z
  .string()
  .trim()
  .url({ message: "URLの形式が正しくありません" })
  .refine((v) => /^https?:\/\//i.test(v), {
    message: "URLはhttp(s)で始まる必要があります",
  })
  .optional()
  .or(z.literal("").transform(() => undefined));

// FormDataの空文字をundefinedに正規化(z.coerce.numberの""→0事故を防ぐ)
const emptyAsUndefined = (v: unknown) =>
  v === "" || v == null ? undefined : v;

const optionalText = (max: number) =>
  z.preprocess(
    emptyAsUndefined,
    z.string().trim().max(max).optional()
  );

export const matchSchema = z.object({
  title: z.string().trim().min(1, "試合名は必須です").max(120),
  opponent: optionalText(120),
  match_date: z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が正しくありません")
      .optional()
  ),
  competition: optionalText(120),
  result: z.preprocess(
    emptyAsUndefined,
    z.enum(["win", "lose", "draw"]).optional()
  ),
  score_for: z.preprocess(
    emptyAsUndefined,
    z.coerce.number().int().min(0).max(99).optional()
  ),
  score_against: z.preprocess(
    emptyAsUndefined,
    z.coerce.number().int().min(0).max(99).optional()
  ),
  video_url: optionalUrl,
  notes: optionalText(2000),
});

export const clipSchema = z
  .object({
    title: z.string().trim().min(1, "クリップ名は必須です").max(120),
    start_time_seconds: z.preprocess(
      emptyAsUndefined,
      z.coerce.number({ message: "開始秒は必須です" }).int().min(0, "開始秒は0以上にしてください")
    ),
    end_time_seconds: z.preprocess(
      emptyAsUndefined,
      z.coerce.number({ message: "終了秒は必須です" }).int().min(1, "終了秒は1以上にしてください")
    ),
    quarter: z.preprocess(
      emptyAsUndefined,
      z.coerce
        .number()
        .int()
        .min(1, "クォーターは1〜4です")
        .max(4, "クォーターは1〜4です")
        .optional()
    ),
    description: optionalText(1000),
  })
  .refine((v) => v.start_time_seconds < v.end_time_seconds, {
    message: "開始秒は終了秒より前にしてください",
    path: ["end_time_seconds"],
  });

// クリップ作成フォーム(分・秒で入力し、合計秒に変換する)
const minField = z.preprocess(
  (v) => (v === "" || v == null ? 0 : v),
  z.coerce.number({ message: "分は数値で入力してください" }).int().min(0, "分は0以上です").max(999)
);
const secField = z.preprocess(
  (v) => (v === "" || v == null ? 0 : v),
  z.coerce.number({ message: "秒は数値で入力してください" }).int().min(0, "秒は0〜59です").max(59, "秒は0〜59です")
);

export const clipFormSchema = z
  .object({
    title: z.string().trim().min(1, "クリップ名は必須です").max(120),
    start_min: minField,
    start_sec: secField,
    end_min: minField,
    end_sec: secField,
    description: optionalText(1000),
  })
  .transform((v) => ({
    title: v.title,
    description: v.description,
    start_time_seconds: v.start_min * 60 + v.start_sec,
    end_time_seconds: v.end_min * 60 + v.end_sec,
  }))
  .refine((v) => v.start_time_seconds < v.end_time_seconds, {
    message: "開始時間は終了時間より前にしてください",
    path: ["end_min"],
  });

// 試合動画の追加(動画は試合後に共有されるため後付けできる)
export const matchVideoSchema = z.object({
  quarter: z.preprocess(
    emptyAsUndefined,
    z.coerce
      .number()
      .int()
      .min(1, "クオーターは1〜5です")
      .max(5, "クオーターは1〜5です")
      .optional()
  ),
  title: optionalText(120),
  url: z
    .string()
    .trim()
    .url({ message: "URLの形式が正しくありません" })
    .refine((v) => /^https?:\/\//i.test(v), {
      message: "URLはhttp(s)で始まる必要があります",
    }),
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

// AI戦術レポートの出力JSONスキーマ(AI出力の型検証に使用)。
// プロバイダーのstructured outputsは配列長や数値範囲の制約を強制できないため、
// 型・必須フィールドは厳格に検証し、範囲・長さは正規化(クランプ)する。
export const aiReportSchema = z.object({
  title: z
    .string()
    .min(1)
    .transform((s) => s.slice(0, 120)),
  summary: z.string().min(1),
  offensive_findings: z.string(),
  defensive_findings: z.string(),
  transition_findings: z.string(),
  key_problem_patterns: z.array(z.string()).transform((a) => a.slice(0, 10)),
  recommended_training_themes: z
    .array(z.string())
    .transform((a) => a.slice(0, 10)),
  meeting_points: z.array(z.string()).transform((a) => a.slice(0, 10)),
  ai_confidence: z.number().transform((n) => Math.min(1, Math.max(0, n))),
});

export type AiReport = z.infer<typeof aiReportSchema>;
