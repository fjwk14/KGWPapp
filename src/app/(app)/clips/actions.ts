"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/session";
import { clipFormSchema, commentSchema, tagSchema } from "@/lib/validation";
import { can } from "@/lib/permissions";

// クリップ本体(タイトル・開始/終了時間・説明)を編集する
export async function updateClip(formData: FormData) {
  const { membership } = await requireMembership();
  const clipId = String(formData.get("clip_id"));
  const back = `/clips/${clipId}/edit`;

  if (!can.createClip(membership)) {
    redirect(`${back}?error=${encodeURIComponent("編集の権限がありません(戦術チーム以上)")}`);
  }

  const parsed = clipFormSchema.safeParse({
    title: formData.get("title"),
    start_min: formData.get("start_min"),
    start_sec: formData.get("start_sec"),
    end_min: formData.get("end_min"),
    end_sec: formData.get("end_sec"),
    description: formData.get("description") ?? undefined,
  });
  if (!parsed.success) {
    redirect(`${back}?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const supabase = await createClient();

  // 紐づける動画の変更(任意)。空文字は「紐づけ解除」。
  const rawVideoId = formData.get("video_id");
  let videoPatch: Partial<{ video_id: string | null; quarter: number | null }> =
    {};
  if (rawVideoId != null) {
    const videoId = String(rawVideoId).trim();
    if (videoId === "") {
      videoPatch = { video_id: null, quarter: null };
    } else {
      const { data: video } = await supabase
        .from("match_videos")
        .select("id, quarter")
        .eq("id", videoId)
        .maybeSingle();
      if (!video) {
        redirect(`${back}?error=${encodeURIComponent("選択された動画が見つかりません")}`);
      }
      videoPatch = { video_id: video.id, quarter: video.quarter };
    }
  }

  const { data, error } = await supabase
    .from("video_clips")
    .update({
      title: parsed.data.title,
      start_time_seconds: parsed.data.start_time_seconds,
      end_time_seconds: parsed.data.end_time_seconds,
      description: parsed.data.description ?? null,
      ...videoPatch,
    })
    .eq("id", clipId)
    .select("id");
  if (error || !data?.length) {
    redirect(`${back}?error=${encodeURIComponent("更新できませんでした(権限がない可能性があります)")}`);
  }
  revalidatePath(`/clips/${clipId}`);
  redirect(`/clips/${clipId}`);
}

function backTo(clipId: string, error?: string): never {
  redirect(
    error ? `/clips/${clipId}?error=${encodeURIComponent(error)}` : `/clips/${clipId}`
  );
}

export async function addTag(formData: FormData) {
  const { team, userId } = await requireMembership();
  const clipId = String(formData.get("clip_id"));
  const raw = String(formData.get("tag") ?? "");
  const idx = raw.indexOf(":");

  const parsed = tagSchema.safeParse({
    tag_type: raw.slice(0, idx),
    tag_value: raw.slice(idx + 1),
  });
  if (!parsed.success) backTo(clipId, "不正なタグです");

  const supabase = await createClient();
  const { error } = await supabase.from("clip_tags").insert({
    ...parsed.data,
    clip_id: clipId,
    team_id: team.id,
    created_by: userId,
  });
  if (error && error.code !== "23505") {
    backTo(clipId, `タグ追加に失敗しました: ${error.message}`);
  }
  revalidatePath(`/clips/${clipId}`);
  backTo(clipId);
}

export async function removeTag(formData: FormData) {
  await requireMembership();
  const clipId = String(formData.get("clip_id"));
  const tagId = String(formData.get("tag_id"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clip_tags")
    .delete()
    .eq("id", tagId)
    .select("id");
  if (error || !data?.length) {
    backTo(clipId, "タグを削除できませんでした(権限がない可能性があります)");
  }
  revalidatePath(`/clips/${clipId}`);
  backTo(clipId);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function addComment(formData: FormData) {
  const { team, userId } = await requireMembership();
  const clipId = String(formData.get("clip_id"));

  const parsed = commentSchema.safeParse({
    comment: formData.get("comment"),
    comment_type: formData.get("comment_type"),
  });
  if (!parsed.success) backTo(clipId, parsed.error.issues[0].message);

  // 返信先(話題)と宛先メンション(どちらも任意)
  const rawParent = String(formData.get("parent_comment_id") ?? "").trim();
  const parentId = UUID_RE.test(rawParent) ? rawParent : null;
  const rawMention = String(formData.get("mention") ?? "").trim();
  const mentionIds = UUID_RE.test(rawMention) ? [rawMention] : [];

  const supabase = await createClient();
  const { error } = await supabase.from("clip_comments").insert({
    ...parsed.data,
    clip_id: clipId,
    team_id: team.id,
    user_id: userId,
    parent_comment_id: parentId,
    mention_user_ids: mentionIds,
  });
  if (error) backTo(clipId, `コメント投稿に失敗しました: ${error.message}`);
  revalidatePath(`/clips/${clipId}`);
  backTo(clipId);
}

export async function deleteComment(formData: FormData) {
  await requireMembership();
  const clipId = String(formData.get("clip_id"));
  const commentId = String(formData.get("comment_id"));

  const supabase = await createClient();
  // RLSにより本人のコメントのみ削除できる
  const { data, error } = await supabase
    .from("clip_comments")
    .delete()
    .eq("id", commentId)
    .select("id");
  if (error || !data?.length) {
    backTo(clipId, "コメントを削除できませんでした(本人のみ削除できます)");
  }
  revalidatePath(`/clips/${clipId}`);
  backTo(clipId);
}
