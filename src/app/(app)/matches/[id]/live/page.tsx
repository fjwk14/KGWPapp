import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import type { Match, Profile } from "@/lib/types";
import type { RosterEntry, StatsEvent } from "@/lib/stats";
import LiveScreen from "./live-screen";

export default async function LiveStatsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { team, membership } = await requireMembership();
  // マネージャー(記録シート)/ 分析チーム(分析記録)のどちらかの権限があれば入れる
  const canManagerMode = can.recordStats(membership);
  const canAnalysisMode = can.recordAnalysis(membership);
  if (!canManagerMode && !canAnalysisMode) redirect(`/matches/${id}`);

  const supabase = await createClient();
  const { data: matchData } = await supabase
    .from("matches")
    .select("id, title, team_id")
    .eq("id", id)
    .maybeSingle();
  if (!matchData) notFound();
  const match = matchData as Pick<Match, "id" | "title" | "team_id">;

  const [{ data: membersData }, { data: rosterData }, { data: eventsData }] =
    await Promise.all([
      supabase
        .from("memberships")
        .select("user_id, cap_number, is_gk, users(name)")
        .eq("team_id", team.id)
        .eq("status", "active"),
      supabase
        .from("match_rosters")
        .select("user_id, cap_number, is_gk, users(name)")
        .eq("match_id", id)
        .order("cap_number"),
      supabase
        .from("stats_events")
        .select("id, match_id, quarter, player_id, type, subtype, result, is_extra_man, created_at")
        .eq("match_id", id)
        .order("created_at"),
    ]);

  const memberRows = (membersData ?? []) as unknown as {
    user_id: string;
    cap_number: number | null;
    is_gk: boolean;
    users: Pick<Profile, "name"> | null;
  }[];
  const members = memberRows.map((m) => ({
    user_id: m.user_id,
    name: m.users?.name ?? "不明",
  }));

  const savedRoster: RosterEntry[] = ((rosterData ?? []) as unknown as {
    user_id: string;
    cap_number: number;
    is_gk: boolean;
    users: Pick<Profile, "name"> | null;
  }[]).map((r) => ({
    user_id: r.user_id,
    cap_number: r.cap_number,
    is_gk: r.is_gk,
    name: r.users?.name ?? "不明",
  }));

  // この試合のロスターが未保存なら、管理画面で設定した各メンバーの
  // 既定(帽子番号あり)から初期ロスターを組み立て、毎回の手入力を省く
  const rosterSaved = savedRoster.length > 0;
  const defaultRoster: RosterEntry[] = memberRows
    .filter((m) => m.cap_number != null)
    .map((m) => ({
      user_id: m.user_id,
      cap_number: m.cap_number as number,
      is_gk: m.is_gk,
      name: m.users?.name ?? "不明",
    }))
    .sort((a, b) => a.cap_number - b.cap_number);
  const roster = rosterSaved ? savedRoster : defaultRoster;

  return (
    <>
      <div className="flex items-center justify-between">
        <Link href={`/matches/${id}`} className="text-xs text-brand-600 underline">
          ← 試合詳細
        </Link>
        <Link
          href={`/matches/${id}/scoresheet`}
          className="text-xs text-brand-600 underline"
        >
          記録シートを見る →
        </Link>
      </div>
      <h1 className="text-lg font-bold">試合記録</h1>
      <LiveScreen
        matchId={id}
        teamId={match.team_id}
        matchTitle={match.title}
        members={members}
        initialRoster={roster}
        rosterSaved={rosterSaved}
        initialEvents={(eventsData ?? []) as StatsEvent[]}
        canManagerMode={canManagerMode}
        canAnalysisMode={canAnalysisMode}
      />
    </>
  );
}
