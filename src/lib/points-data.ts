// ポイント算出のためのデータ取得(サーバー専用)。
// 既存テーブルからチーム全員分の PointInputs を組み立てる。
// 純粋な集計ロジックは points.ts に置き、ここは取得と突き合わせに徹する。
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computePoints,
  emptyPointInputs,
  type PointBreakdown,
  type PointInputs,
} from "./points";
import { receivedCommentIds, type CommentForUnread } from "./notifications";

export interface MemberPoints {
  user_id: string;
  inputs: PointInputs;
  breakdown: PointBreakdown;
}

// チーム全員分の PointInputs を作る。userId を指定すると1人分に絞る
// (ヘッダー/マイページ用。取得列は同じで、集計対象の user を限定する)。
export async function fetchTeamPointInputs(
  supabase: SupabaseClient,
  teamId: string
): Promise<Map<string, PointInputs>> {
  const [
    { data: conditions },
    { data: attendances },
    { data: selfPractices },
    { data: feedbacks },
    { data: comments },
    { data: clips },
    { data: tags },
    { data: proposals },
    { data: answers },
    { data: questions },
    { data: grants },
    { data: gakurenMatchesData },
    { data: gakurenMembers },
  ] = await Promise.all([
    supabase.from("condition_logs").select("user_id, log_date").eq("team_id", teamId),
    supabase.from("practice_attendances").select("user_id").eq("team_id", teamId),
    supabase.from("self_practices").select("user_id, practice_date").eq("team_id", teamId),
    supabase.from("peer_feedbacks").select("from_user_id").eq("team_id", teamId),
    supabase
      .from("clip_comments")
      .select("id, clip_id, parent_comment_id, user_id, mention_user_ids, created_at")
      .eq("team_id", teamId),
    supabase.from("video_clips").select("created_by").eq("team_id", teamId),
    supabase.from("clip_tags").select("created_by").eq("team_id", teamId),
    supabase.from("proposals").select("created_by, status").eq("team_id", teamId),
    supabase.from("qa_answers").select("id, created_by").eq("team_id", teamId),
    supabase.from("qa_questions").select("resolved_answer_id").eq("team_id", teamId),
    supabase.from("point_grants").select("user_id, points").eq("team_id", teamId),
    supabase
      .from("matches")
      .select("id")
      .eq("team_id", teamId)
      .eq("gakuren_involved", true),
    supabase
      .from("memberships")
      .select("user_id, role, secondary_role")
      .eq("team_id", teamId)
      .or("role.eq.gakuren,secondary_role.eq.gakuren"),
  ]);

  const map = new Map<string, PointInputs>();
  const ensure = (uid: string): PointInputs => {
    let e = map.get(uid);
    if (!e) {
      e = emptyPointInputs();
      map.set(uid, e);
    }
    return e;
  };

  for (const r of (conditions ?? []) as { user_id: string; log_date: string }[]) {
    ensure(r.user_id).conditionDates.push(r.log_date);
  }
  for (const r of (attendances ?? []) as { user_id: string }[]) {
    ensure(r.user_id).attendanceAnswers += 1;
  }
  for (const r of (selfPractices ?? []) as { user_id: string; practice_date: string }[]) {
    ensure(r.user_id).selfPracticeDates.push(r.practice_date);
  }
  for (const r of (feedbacks ?? []) as { from_user_id: string }[]) {
    ensure(r.from_user_id).peerFeedbackSent += 1;
  }

  const commentRows = (comments ?? []) as (CommentForUnread & { created_at: string })[];
  for (const c of commentRows) {
    ensure(c.user_id).commentDates.push(c.created_at.slice(0, 10));
  }
  // 返信・メンションを「もらった」数(自分の投稿は数えない)を全員分数える
  for (const uid of map.keys()) {
    ensure(uid).repliesReceived = receivedCommentIds(commentRows, uid).length;
  }
  // コメント投稿者以外(=まだ登場していないメンバー)は受信0でよい

  for (const r of (clips ?? []) as { created_by: string | null }[]) {
    if (r.created_by) ensure(r.created_by).clipsCreated += 1;
  }
  for (const r of (tags ?? []) as { created_by: string | null }[]) {
    if (r.created_by) ensure(r.created_by).tagsAdded += 1;
  }
  for (const r of (proposals ?? []) as { created_by: string; status: string }[]) {
    if (r.status === "adopted") ensure(r.created_by).proposalsAdopted += 1;
  }
  for (const r of (answers ?? []) as { id: string; created_by: string }[]) {
    ensure(r.created_by).qaAnswers += 1;
  }
  // ベストアンサー: 質問の resolved_answer_id が指す回答の著者に加点
  const answerAuthor = new Map(
    ((answers ?? []) as { id: string; created_by: string }[]).map((a) => [a.id, a.created_by])
  );
  for (const q of (questions ?? []) as { resolved_answer_id: string | null }[]) {
    if (!q.resolved_answer_id) continue;
    const author = answerAuthor.get(q.resolved_answer_id);
    if (author) ensure(author).qaBestAnswers += 1;
  }
  for (const r of (grants ?? []) as { user_id: string; points: number }[]) {
    ensure(r.user_id).manualPoints += r.points;
  }

  // 学連ロール(primary/secondary問わず)のメンバーにのみ、学連関与試合の
  // 件数を加算する(役職を持たないメンバーは対象外)
  const gakurenMatchCount = (gakurenMatchesData ?? []).length;
  if (gakurenMatchCount > 0) {
    for (const r of (gakurenMembers ?? []) as { user_id: string }[]) {
      ensure(r.user_id).gakurenMatches = gakurenMatchCount;
    }
  }

  return map;
}

// user1人分の集計(breakdown付き)。存在しなければ空(total 0)を返す。
export async function fetchUserPoints(
  supabase: SupabaseClient,
  teamId: string,
  userId: string
): Promise<MemberPoints> {
  const map = await fetchTeamPointInputs(supabase, teamId);
  const inputs = map.get(userId) ?? emptyPointInputs();
  return { user_id: userId, inputs, breakdown: computePoints(inputs) };
}
