"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/session";
import { commentSchema, tagSchema } from "@/lib/validation";

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

export async function addComment(formData: FormData) {
  const { team, userId } = await requireMembership();
  const clipId = String(formData.get("clip_id"));

  const parsed = commentSchema.safeParse({
    comment: formData.get("comment"),
    comment_type: formData.get("comment_type"),
  });
  if (!parsed.success) backTo(clipId, parsed.error.issues[0].message);

  const supabase = await createClient();
  const { error } = await supabase.from("clip_comments").insert({
    ...parsed.data,
    clip_id: clipId,
    team_id: team.id,
    user_id: userId,
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
