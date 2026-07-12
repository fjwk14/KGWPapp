"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/session";
import {
  clipFormSchema,
  matchSchema,
  matchVideoSchema,
  tagSchema,
} from "@/lib/validation";
import { can } from "@/lib/permissions";

export async function createMatch(formData: FormData) {
  const { team, userId } = await requireMembership();

  const parsed = matchSchema.safeParse({
    title: formData.get("title"),
    opponent: formData.get("opponent") ?? undefined,
    match_date: formData.get("match_date") ?? undefined,
    competition: formData.get("competition") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) {
    redirect(
      `/matches/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("matches")
    .insert({ ...parsed.data, team_id: team.id, created_by: userId })
    .select("id")
    .single();

  if (error) {
    // RLS違反(権限外)もここに落ちる
    redirect(
      `/matches/new?error=${encodeURIComponent(`登録に失敗しました: ${error.message}`)}`
    );
  }
  // 「登録してそのままスタッツ入力へ」ボタンからの送信は
  // 試合当日フロー: そのままリアルタイム入力(出場メンバー選択)へ進む
  if (formData.get("next") === "live") {
    redirect(`/matches/${data.id}/live`);
  }
  redirect(`/matches/${data.id}`);
}

// 試合の内容(試合名・対戦相手・日付・大会・結果・スコア・動画URL・メモ)を編集する
export async function updateMatch(formData: FormData) {
  const { membership } = await requireMembership();
  const matchId = String(formData.get("match_id"));
  const back = `/matches/${matchId}/edit`;

  if (!can.editMatch(membership.role)) {
    redirect(`${back}?error=${encodeURIComponent("編集の権限がありません(戦術班以上)")}`);
  }

  const parsed = matchSchema.safeParse({
    title: formData.get("title"),
    opponent: formData.get("opponent") ?? undefined,
    match_date: formData.get("match_date") ?? undefined,
    competition: formData.get("competition") ?? undefined,
    result: formData.get("result") ?? undefined,
    score_for: formData.get("score_for") || undefined,
    score_against: formData.get("score_against") || undefined,
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) {
    redirect(`${back}?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  // 空欄になった項目はNULLで明示的にクリアする(undefinedだと未更新扱いになるため)
  // 動画は match_videos で管理するため、ここでは扱わない
  const d = parsed.data;
  const patch = {
    title: d.title,
    opponent: d.opponent ?? null,
    match_date: d.match_date ?? null,
    competition: d.competition ?? null,
    result: d.result ?? null,
    score_for: d.score_for ?? null,
    score_against: d.score_against ?? null,
    notes: d.notes ?? null,
  };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("matches")
    .update(patch)
    .eq("id", matchId)
    .select("id");
  if (error || !data?.length) {
    redirect(
      `${back}?error=${encodeURIComponent("更新できませんでした(権限がない可能性があります)")}`
    );
  }
  revalidatePath(`/matches/${matchId}`);
  redirect(`/matches/${matchId}`);
}

// 試合動画を後から添付する(クオーター単位 or フル動画)
export async function addMatchVideo(formData: FormData) {
  const { team, userId } = await requireMembership();
  const matchId = String(formData.get("match_id"));
  const back = `/matches/${matchId}`;

  const parsed = matchVideoSchema.safeParse({
    quarter: formData.get("quarter") ?? undefined,
    title: formData.get("video_title") ?? undefined,
    url: formData.get("url"),
  });
  if (!parsed.success) {
    redirect(`${back}?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("match_videos").insert({
    match_id: matchId,
    team_id: team.id,
    quarter: parsed.data.quarter ?? null,
    title: parsed.data.title ?? null,
    url: parsed.data.url,
    created_by: userId,
  });
  if (error) {
    redirect(
      `${back}?error=${encodeURIComponent(`動画を追加できませんでした(権限がない可能性があります)`)}`
    );
  }
  revalidatePath(back);
  redirect(back);
}

export async function deleteMatchVideo(formData: FormData) {
  await requireMembership();
  const matchId = String(formData.get("match_id"));
  const videoId = String(formData.get("video_id"));
  const back = `/matches/${matchId}`;

  const supabase = await createClient();
  const { error } = await supabase
    .from("match_videos")
    .delete()
    .eq("id", videoId);
  if (error) {
    redirect(
      `${back}?error=${encodeURIComponent("動画を削除できませんでした(権限がない可能性があります)")}`
    );
  }
  revalidatePath(back);
  redirect(back);
}

// クリップ作成 + タグ付け + 最初のコメントを1回のsubmitで完了させる(90秒UX)
export async function createClip(formData: FormData) {
  const { team, userId } = await requireMembership();
  const matchId = String(formData.get("match_id"));
  const back = `/matches/${matchId}/clips/new`;

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

  // 紐づける動画(任意)。時間はこの動画内のオフセットを指す。
  // クオーターは動画側の設定を引き継ぐ。
  const videoId = String(formData.get("video_id") ?? "").trim();
  let videoFields: Partial<{ video_id: string; quarter: number | null }> = {};
  if (videoId) {
    const { data: video } = await supabase
      .from("match_videos")
      .select("id, quarter")
      .eq("id", videoId)
      .eq("match_id", matchId)
      .maybeSingle();
    if (!video) {
      redirect(`${back}?error=${encodeURIComponent("選択された動画が見つかりません")}`);
    }
    videoFields = { video_id: video.id, quarter: video.quarter };
  }

  const { data: clip, error } = await supabase
    .from("video_clips")
    .insert({
      ...parsed.data,
      ...videoFields,
      match_id: matchId,
      team_id: team.id,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) {
    redirect(
      `${back}?error=${encodeURIComponent(`クリップ作成に失敗しました: ${error.message}`)}`
    );
  }

  // タグ(チェックボックス name="tags" value="type:value")
  const rawTags = formData.getAll("tags").map(String);
  const tagRows = [];
  for (const raw of rawTags) {
    const idx = raw.indexOf(":");
    const candidate = { tag_type: raw.slice(0, idx), tag_value: raw.slice(idx + 1) };
    const tagParsed = tagSchema.safeParse(candidate);
    if (tagParsed.success) {
      tagRows.push({
        ...tagParsed.data,
        clip_id: clip.id,
        team_id: team.id,
        created_by: userId,
      });
    }
  }
  // クリップ本体は作成済みのため、タグ・コメントの失敗は
  // クリップ詳細ページ上のエラーとして通知する(無言で落とさない)
  const failures: string[] = [];

  if (tagRows.length > 0) {
    const { error: tagError } = await supabase.from("clip_tags").insert(tagRows);
    if (tagError) failures.push("タグの保存に失敗しました");
  }

  // 最初のコメント(任意)
  const firstComment = String(formData.get("first_comment") ?? "").trim();
  if (firstComment) {
    const { error: commentError } = await supabase.from("clip_comments").insert({
      clip_id: clip.id,
      team_id: team.id,
      user_id: userId,
      comment: firstComment.slice(0, 1000),
      comment_type: "observation",
    });
    if (commentError) failures.push("コメントの保存に失敗しました");
  }

  if (failures.length > 0) {
    redirect(
      `/clips/${clip.id}?error=${encodeURIComponent(`クリップは作成されましたが、${failures.join("・")}。もう一度お試しください。`)}`
    );
  }
  redirect(`/clips/${clip.id}`);
}
