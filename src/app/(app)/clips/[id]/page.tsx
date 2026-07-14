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
import { buildTimestampUrl, formatSeconds, matchVideoLabel } from "@/lib/video";
import type {
  ClipComment,
  ClipTag,
  Match,
  MatchVideo,
  TagTemplate,
  VideoClip,
} from "@/lib/types";
import { addComment, addTag, deleteComment, removeTag } from "../actions";
import ViewTracker from "./view-tracker";

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

  const [
    { data: matchData },
    { data: tagsData },
    { data: commentsData },
    { data: templatesData },
    { data: membersData },
  ] = await Promise.all([
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
    supabase
      .from("memberships")
      .select("user_id, users(name)")
      .eq("team_id", team.id)
      .eq("status", "active"),
  ]);

  const match = matchData as Match;

  // 紐づいた動画(なければ旧video_urlへフォールバック)
  let video: MatchVideo | null = null;
  if (clip.video_id) {
    const { data: videoData } = await supabase
      .from("match_videos")
      .select("*")
      .eq("id", clip.video_id)
      .maybeSingle();
    video = (videoData as MatchVideo | null) ?? null;
  }
  const videoUrl = video?.url ?? match.video_url;

  const tags = (tagsData ?? []) as ClipTag[];
  const comments = (commentsData ?? []) as (ClipComment & {
    users: { name: string } | null;
  })[];
  const templates = (templatesData ?? []) as TagTemplate[];
  const isStaff = can.tagClip(membership);

  const attached = new Set(tags.map((t) => `${t.tag_type}:${t.tag_value}`));
  const available = templates.filter(
    (t) => !attached.has(`${t.tag_type}:${t.tag_value}`)
  );

  // メンバー(宛先メンションの選択肢 + メンションIDの名前解決)
  const members = ((membersData ?? []) as unknown as {
    user_id: string;
    users: { name: string } | null;
  }[]).map((m) => ({ user_id: m.user_id, name: m.users?.name ?? "不明" }));
  const nameOf = new Map(members.map((m) => [m.user_id, m.name]));

  // 話題(親コメント)ごとにスレッドへ分ける
  const threads = comments
    .filter((c) => !c.parent_comment_id)
    .map((root) => ({
      root,
      replies: comments.filter((c) => c.parent_comment_id === root.id),
    }));

  return (
    <>
      <ViewTracker clipId={clip.id} />
      <ErrorBanner message={error} />

      <Card className="space-y-2">
        <Link
          href={`/matches/${match.id}`}
          className="text-xs text-brand-600 underline"
        >
          ← {match.title}
        </Link>
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-lg font-bold">{clip.title}</h1>
          {isStaff && (
            <Link
              href={`/clips/${clip.id}/edit`}
              className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              ✏️ 編集
            </Link>
          )}
        </div>
        <p className="text-sm text-slate-500">
          {video ? `${matchVideoLabel(video)} / ` : clip.quarter === 5 ? "PSO / " : clip.quarter ? `Q${clip.quarter} / ` : ""}
          {formatSeconds(clip.start_time_seconds)}〜
          {formatSeconds(clip.end_time_seconds)}
        </p>
        {clip.description && (
          <p className="text-sm text-slate-600">{clip.description}</p>
        )}
        {videoUrl ? (
          <a
            href={buildTimestampUrl(videoUrl, clip.start_time_seconds)}
            target="_blank"
            rel="noreferrer"
            data-open-video
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
          >
            ▶ 該当場面を動画で開く({formatSeconds(clip.start_time_seconds)}〜)
          </a>
        ) : (
          <p className="text-xs text-slate-400">
            試合詳細の「試合動画」に動画を追加し、クリップ編集でその動画に
            紐づけると該当場面へのリンクが表示されます
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
          コメント・議論({comments.length})
        </h2>

        {threads.length === 0 && (
          <p className="text-sm text-slate-400">
            まだコメントがありません。下のフォームから最初の話題を投稿しましょう。
          </p>
        )}

        {/* 話題ごとのスレッド */}
        {threads.map(({ root, replies }) => (
          <div
            key={root.id}
            className="overflow-hidden rounded-xl border border-slate-200"
          >
            <CommentBlock
              c={root}
              clipId={clip.id}
              userId={userId}
              nameOf={nameOf}
            />
            {replies.length > 0 && (
              <div className="space-y-2 border-t border-slate-100 bg-slate-50/70 py-2 pl-5 pr-3">
                {replies.map((r) => (
                  <CommentBlock
                    key={r.id}
                    c={r}
                    clipId={clip.id}
                    userId={userId}
                    nameOf={nameOf}
                    isReply
                  />
                ))}
              </div>
            )}
            <details className="border-t border-slate-100 bg-white px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold text-brand-600">
                ↩ この話題に返信する
              </summary>
              <form action={addComment} className="mt-2 space-y-2">
                <input type="hidden" name="clip_id" value={clip.id} />
                <input type="hidden" name="parent_comment_id" value={root.id} />
                <input type="hidden" name="comment_type" value="observation" />
                <Input
                  name="comment"
                  required
                  maxLength={1000}
                  placeholder="返信を書く"
                  className="text-sm"
                />
                <div className="flex gap-2">
                  <Select name="mention" defaultValue="" className="min-w-0 flex-1 text-sm">
                    <option value="">宛先なし</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        → {m.name}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit" variant="secondary" className="shrink-0">
                    返信
                  </Button>
                </div>
              </form>
            </details>
          </div>
        ))}

        {/* 新しい話題 */}
        <form id="new-topic" action={addComment} className="space-y-2 border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold text-slate-500">新しい話題を投稿</p>
          <input type="hidden" name="clip_id" value={clip.id} />
          <Input
            name="comment"
            required
            maxLength={1000}
            placeholder="この場面について話したいこと"
            className="text-sm"
          />
          <div className="flex gap-2">
            <Select
              name="comment_type"
              className="min-w-0 flex-1 text-sm"
              defaultValue="observation"
            >
              {Object.entries(COMMENT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select name="mention" defaultValue="" className="min-w-0 flex-1 text-sm">
              <option value="">宛先なし</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  → {m.name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" className="w-full">
            コメントする
          </Button>
        </form>
        <p className="text-[10px] text-slate-400">
          ※ 話題の先頭コメントを削除すると、その返信もまとめて削除されます。
        </p>
      </Card>
    </>
  );
}

// コメント1件の表示(話題の起点・返信の両方で使う)
function CommentBlock({
  c,
  clipId,
  userId,
  nameOf,
  isReply = false,
}: {
  c: ClipComment & { users: { name: string } | null };
  clipId: string;
  userId: string;
  nameOf: Map<string, string>;
  isReply?: boolean;
}) {
  return (
    <div className={isReply ? "rounded-lg bg-white p-2.5" : "p-3"}>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs font-medium text-slate-500">
          {c.users?.name ?? "不明"}
          <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-[10px]">
            {COMMENT_TYPE_LABELS[c.comment_type] ?? c.comment_type}
          </span>
          {c.mention_user_ids?.map((uid) => (
            <span
              key={uid}
              className="ml-1 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700"
            >
              → {nameOf.get(uid) ?? "不明"}
            </span>
          ))}
        </span>
        {c.user_id === userId && (
          <form action={deleteComment}>
            <input type="hidden" name="clip_id" value={clipId} />
            <input type="hidden" name="comment_id" value={c.id} />
            <button className="shrink-0 text-xs text-slate-400 hover:text-red-600">
              削除
            </button>
          </form>
        )}
      </div>
      <p className="mt-1 text-sm">{c.comment}</p>
    </div>
  );
}
