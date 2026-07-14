import Link from "next/link";
import { Card, LinkButton } from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import type { Match } from "@/lib/types";

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const { deleted } = await searchParams;
  const { team, membership } = await requireMembership();
  const supabase = await createClient();

  const { data } = await supabase
    .from("matches")
    .select("id, title, opponent, match_date, competition, result, score_for, score_against")
    .eq("team_id", team.id)
    .order("match_date", { ascending: false, nullsFirst: false });

  const matches = (data ?? []) as Match[];

  // 動画は後日添付されるため match_videos 側を数える
  const videoCounts = new Map<string, number>();
  if (matches.length > 0) {
    const { data: videos } = await supabase
      .from("match_videos")
      .select("match_id")
      .in(
        "match_id",
        matches.map((m) => m.id)
      );
    for (const v of (videos ?? []) as { match_id: string }[]) {
      videoCounts.set(v.match_id, (videoCounts.get(v.match_id) ?? 0) + 1);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">試合一覧</h1>
        {can.createMatch(membership) && (
          <LinkButton href="/matches/new" className="min-h-9 px-3 text-xs">
            + 試合登録
          </LinkButton>
        )}
      </div>

      {deleted && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          ✓ 試合を削除しました
        </div>
      )}

      {matches.length === 0 && (
        <Card className="text-sm text-slate-500">まだ試合がありません</Card>
      )}

      {matches.map((m) => (
        <Link key={m.id} href={`/matches/${m.id}`} className="block">
          <Card className="flex items-center justify-between">
            <div>
              <div className="font-semibold">{m.title}</div>
              <div className="text-xs text-slate-500">
                {m.match_date ?? "日付未設定"}
                {m.opponent ? ` / vs ${m.opponent}` : ""}
                {m.competition ? ` / ${m.competition}` : ""}
              </div>
              <div className="mt-1 text-xs">
                {(videoCounts.get(m.id) ?? 0) > 0 ? (
                  <span className="text-emerald-600">
                    🎥 動画{videoCounts.get(m.id)}本
                  </span>
                ) : (
                  <span className="text-slate-400">動画は後日添付できます</span>
                )}
              </div>
            </div>
            {m.score_for != null && m.score_against != null && (
              <div className="text-right">
                <div className="text-lg font-bold">
                  {m.score_for}-{m.score_against}
                </div>
                <div className="text-xs text-slate-500">
                  {m.result === "win" ? "勝ち" : m.result === "lose" ? "負け" : m.result === "draw" ? "引き分け" : ""}
                </div>
              </div>
            )}
          </Card>
        </Link>
      ))}
    </>
  );
}
