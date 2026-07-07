import Link from "next/link";
import { Card, LinkButton } from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import type { Match } from "@/lib/types";

export default async function MatchesPage() {
  const { team, membership } = await requireMembership();
  const supabase = await createClient();

  const { data } = await supabase
    .from("matches")
    .select("id, title, opponent, match_date, competition, result, score_for, score_against, video_url")
    .eq("team_id", team.id)
    .order("match_date", { ascending: false, nullsFirst: false });

  const matches = (data ?? []) as Match[];

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">試合一覧</h1>
        {can.createMatch(membership.role) && (
          <LinkButton href="/matches/new" className="min-h-9 px-3 text-xs">
            + 試合登録
          </LinkButton>
        )}
      </div>

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
                {m.video_url ? (
                  <span className="text-emerald-600">🎥 動画あり</span>
                ) : (
                  <span className="text-slate-400">動画未登録</span>
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
