"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/session";
import { can } from "@/lib/permissions";
import { generateTacticalReport } from "@/lib/ai/report";
import type { ClipComment, ClipTag, Match, VideoClip } from "@/lib/types";

function backTo(matchId: string, error?: string): never {
  redirect(
    error
      ? `/matches/${matchId}/report?error=${encodeURIComponent(error)}`
      : `/matches/${matchId}/report`
  );
}

export async function generateReport(formData: FormData) {
  const { membership, userId } = await requireMembership();
  const matchId = String(formData.get("match_id"));

  if (!can.generateReport(membership)) {
    backTo(matchId, "レポート生成の権限がありません(戦術チーム以上)");
  }

  const supabase = await createClient();
  const { data: matchData } = await supabase
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();
  if (!matchData) backTo(matchId, "試合が見つかりません");
  const match = matchData as Match;

  const { data: clipsData } = await supabase
    .from("video_clips")
    .select("*")
    .eq("match_id", matchId)
    .order("start_time_seconds");
  const clips = (clipsData ?? []) as VideoClip[];

  if (clips.length === 0) {
    backTo(matchId, "クリップがありません。先にクリップを作成してください。");
  }

  const clipIds = clips.map((c) => c.id);
  const [{ data: tagsData }, { data: commentsData }] = await Promise.all([
    supabase.from("clip_tags").select("*").in("clip_id", clipIds),
    supabase
      .from("clip_comments")
      .select("*, users(name)")
      .in("clip_id", clipIds),
  ]);
  const tags = (tagsData ?? []) as ClipTag[];
  const comments = ((commentsData ?? []) as (ClipComment & {
    users: { name: string } | null;
  })[]).map((c) => ({ ...c, author_name: c.users?.name ?? "不明" }));

  let result;
  try {
    result = await generateTacticalReport({ match, clips, tags, comments });
  } catch (e) {
    backTo(matchId, `AIレポート生成に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
  }

  const { report } = result;
  const { error } = await supabase.from("tactical_reports").insert({
    match_id: matchId,
    team_id: match.team_id,
    generated_by: userId,
    title: report.title,
    summary: report.summary,
    offensive_findings: report.offensive_findings,
    defensive_findings: report.defensive_findings,
    transition_findings: report.transition_findings,
    key_problem_patterns: report.key_problem_patterns,
    recommended_training_themes: report.recommended_training_themes,
    meeting_points: report.meeting_points,
    ai_confidence: report.ai_confidence,
  });
  if (error) backTo(matchId, `レポート保存に失敗しました: ${error.message}`);

  revalidatePath(`/matches/${matchId}/report`);
  backTo(matchId);
}

// executive / captain / admin がレポートを編集・確定する
export async function updateReport(formData: FormData) {
  const { membership } = await requireMembership();
  const matchId = String(formData.get("match_id"));
  const reportId = String(formData.get("report_id"));

  if (!can.editReport(membership)) {
    backTo(matchId, "レポート編集の権限がありません(幹部・主将のみ)");
  }

  const toLines = (v: FormDataEntryValue | null) =>
    String(v ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tactical_reports")
    .update({
      summary: String(formData.get("summary") ?? "").trim(),
      offensive_findings: String(formData.get("offensive_findings") ?? "").trim(),
      defensive_findings: String(formData.get("defensive_findings") ?? "").trim(),
      transition_findings: String(formData.get("transition_findings") ?? "").trim(),
      key_problem_patterns: toLines(formData.get("key_problem_patterns")),
      recommended_training_themes: toLines(
        formData.get("recommended_training_themes")
      ),
      meeting_points: toLines(formData.get("meeting_points")),
    })
    .eq("id", reportId)
    .select("id");
  if (error || !data?.length) {
    backTo(matchId, "更新できませんでした(権限がない可能性があります)");
  }

  revalidatePath(`/matches/${matchId}/report`);
  backTo(matchId);
}
