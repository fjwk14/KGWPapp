import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Button,
  Card,
  ErrorBanner,
  Input,
  Select,
  TagBadge,
  COMMENT_TYPE_LABELS,
  TAG_TYPE_LABELS,
} from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { buildTimestampUrl, formatSeconds } from "@/lib/video";
import type {
  ClipComment,
  ClipTag,
  Match,
  TagTemplate,
  VideoClip,
} from "@/lib/types";
import { addComment, addTag, deleteComment, removeTag } from "../actions";

export default async function ClipDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { membership, team, userId } = await requireMembership();
  const supabase = await createClient();

  const { data: clipData } = await supabase
    .from("video_clips")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!clipData) notFound();
  const clip = clipData as VideoClip;

  const [{ data: matchData }, { data: tagsData }, { data: commentsData }, { data: templatesData }] =
    await Promise.all([
      supabase.from("matches").select("*").eq("id", clip.match_id).single(),
      supabase.from("clip_tags").select("*").eq("clip_id", id).order("created_at"),
      supabase
        .from("clip_comments")
        .select("*, users(name)")
        .eq("clip_id", id)
        .order("created_at"),
      supabase
        .from("tag_templates")
        .select("*")
        .eq("team_id", team.id)
        .eq("is_active", true)
        .order("tag_type")
        .order("sort_order"),
    ]);

  const match = matchData as Match;
  const tags = (tagsData ?? []) as ClipTag[];
  const comments = (commentsData ?? []) as (ClipComment & {
    users: { name: string } | null;
  })[];
  const templates = (templatesData ?? []) as TagTemplate[];
  const isStaff = can.tagClip(membership.role);

  const attached = new Set(tags.map((t) => `${t.tag_type}:${t.tag_value}`));
  const available = templates.filter(
    (t) => !attached.has(`${t.tag_type}:${t.tag_value}`)
  );

  return (
    <>
      <ErrorBanner message={error} />

      <Card className="space-y-2">
        <Link
          href={`/matches/${match.id}`}
          className="text-xs text-brand-600 underline"
        >
          ← {match.title}
        </Link>
        <h1 className="text-lg font-bold">{clip.title}</h1>
        <p className="text-sm text-slate-500">
          {clip.quarter ? `Q${clip.quarter} / ` : ""}
          {formatSeconds(clip.start_time_seconds)}〜
          {formatSeconds(clip.end_time_seconds)}
        </p>
        {clip.description && (
          <p className="text-sm text-slate-600">{clip.description}</p>
        )}
        {match.video_url ? (
          <a
            href={buildTimestampUrl(match.video_url, clip.start_time_seconds)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
          >
            ▶ 該当場面を動画で開く({formatSeconds(clip.start_time_seconds)}〜)
          </a>
        ) : (
          <p className="text-xs text-slate-400">
            試合に動画URLを登録すると該当場面へのリンクが表示されます
          </p>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-600">タグ</h2>
        <div className="flex flex-wrap gap-2">
          {tags.length === 0 && (
            <p className="text-sm text-slate-400">まだタグがありません</p>
          )}
          {tags.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1">
              <TagBadge tagType={t.tag_type}>
                {TAG_TYPE_LABELS[t.tag_type]}: {t.tag_value}
              </TagBadge>
              {isStaff && (
                <form action={removeTag}>
                  <input type="hidden" name="clip_id" value={clip.id} />
                  <input type="hidden" name="tag_id" value={t.id} />
                  <button
                    className="text-xs text-slate-400 hover:text-red-600"
                    aria-label="タグを削除"
                  >
                    ✕
                  </button>
                </form>
              )}
            </span>
          ))}
        </div>

        {isStaff && available.length > 0 && (
          <form action={addTag} className="flex gap-2">
            <input type="hidden" name="clip_id" value={clip.id} />
            <Select name="tag" className="flex-1 text-sm" defaultValue="">
              <option value="" disabled>
                タグを選択して追加...
              </option>
              {available.map((t) => (
                <option key={t.id} value={`${t.tag_type}:${t.tag_value}`}>
                  [{TAG_TYPE_LABELS[t.tag_type]}] {t.tag_value}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary" className="shrink-0">
              追加
            </Button>
          </form>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-600">
          コメント({comments.length})
        </h2>
        <div className="space-y-2">
          {comments.map((c) => (
            <div key={c.id} className="rounded-lg bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">
                  {(c.users as { name: string } | null)?.name ?? "不明"}
                  <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-[10px]">
                    {COMMENT_TYPE_LABELS[c.comment_type] ?? c.comment_type}
                  </span>
                </span>
                {c.user_id === userId && (
                  <form action={deleteComment}>
                    <input type="hidden" name="clip_id" value={clip.id} />
                    <input type="hidden" name="comment_id" value={c.id} />
                    <button className="text-xs text-slate-400 hover:text-red-600">
                      削除
                    </button>
                  </form>
                )}
              </div>
              <p className="mt-1 text-sm">{c.comment}</p>
            </div>
          ))}
        </div>

        <form action={addComment} className="space-y-2">
          <input type="hidden" name="clip_id" value={clip.id} />
          <div className="flex gap-2">
            <Select name="comment_type" className="w-32 shrink-0 text-sm" defaultValue="observation">
              {Object.entries(COMMENT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Input
              name="comment"
              required
              maxLength={1000}
              placeholder="短くコメントを残す"
              className="flex-1 text-sm"
            />
          </div>
          <Button type="submit" className="w-full">
            コメントする
          </Button>
        </form>
      </Card>
    </>
  );
}
