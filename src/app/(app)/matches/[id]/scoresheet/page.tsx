import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import {
  buildGkLines,
  buildPlayerLines,
  buildTeamSummary,
  formatRate,
  QUARTER_LABELS,
  QUARTERS,
  SHOT_COLUMN_LABELS,
  SHOT_COLUMNS,
  type RosterEntry,
  type StatsEvent,
} from "@/lib/stats";
import type { Match, Profile } from "@/lib/types";

function cell(goals: number, attempts: number): string {
  return attempts === 0 ? "-" : `${goals}-${attempts}`;
}

// 紙の記録シートと同じ集計表を自動生成するページ
export default async function ScoresheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireMembership();
  const supabase = await createClient();

  const { data: matchData } = await supabase
    .from("matches")
    .select("id, title, opponent, match_date")
    .eq("id", id)
    .maybeSingle();
  if (!matchData) notFound();
  const match = matchData as Pick<Match, "id" | "title" | "opponent" | "match_date">;

  const [{ data: rosterData }, { data: eventsData }] = await Promise.all([
    supabase
      .from("match_rosters")
      .select("user_id, cap_number, is_gk, users(name)")
      .eq("match_id", id)
      .order("cap_number"),
    supabase
      .from("stats_events")
      .select("id, match_id, quarter, player_id, type, subtype, result, is_extra_man")
      .eq("match_id", id)
      .order("created_at"),
  ]);

  const roster: RosterEntry[] = ((rosterData ?? []) as unknown as {
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
  const events = (eventsData ?? []) as StatsEvent[];

  const players = buildPlayerLines(events, roster);
  const gks = buildGkLines(events, roster);
  const team = buildTeamSummary(events);

  return (
    <>
      <Link href={`/matches/${id}`} className="text-xs text-brand-600 underline">
        ← {match.title}
      </Link>
      <h1 className="text-lg font-bold">スタッツ表</h1>
      <p className="text-sm text-slate-500">
        {match.match_date ?? ""}
        {match.opponent ? ` / vs ${match.opponent}` : ""} / イベント{events.length}件
      </p>

      {events.length === 0 && (
        <Card className="text-sm text-slate-500">
          まだ記録がありません。「リアルタイム入力」で試合中のスタッツを記録すると、
          紙の記録シートと同じ集計表がここに自動生成されます。
        </Card>
      )}

      {/* チームサマリ: Q別スコア */}
      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">得点</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[400px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="py-1 text-left">TEAM</th>
                {QUARTERS.map((q) => (
                  <th key={q} className="px-2 py-1">
                    {QUARTER_LABELS[q]}
                  </th>
                ))}
                <th className="px-2 py-1">合計</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100 font-semibold">
                <td className="py-1.5 text-left">自チーム</td>
                {QUARTERS.map((q) => (
                  <td key={q}>{team.goalsFor[q]}</td>
                ))}
                <td className="text-brand-700">{team.totalFor}</td>
              </tr>
              <tr>
                <td className="py-1.5 text-left">相手</td>
                {QUARTERS.map((q) => (
                  <td key={q}>{team.goalsAgainst[q]}</td>
                ))}
                <td>{team.totalAgainst}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* 退水決定率 / 攻撃効率 */}
      <div className="grid grid-cols-2 gap-2">
        <Card>
          <h2 className="text-sm font-semibold text-slate-600">退水決定率</h2>
          <p className="mt-1 text-2xl font-bold">{formatRate(team.exclusionRate)}</p>
          <p className="text-xs text-slate-500">
            ◯{team.extraManGoals} / 誘発{team.drawnExclusions}回
          </p>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-slate-600">
            シュートまで持ち込んだ回数
          </h2>
          <ul className="mt-1 space-y-0.5 text-sm">
            {QUARTERS.filter(
              (q) => team.attackEfficiency[q].attacks > 0 || q <= 4
            ).map((q) => (
              <li key={q} className="flex justify-between">
                <span className="text-slate-500">{QUARTER_LABELS[q]}</span>
                <span className="font-semibold">
                  {team.attackEfficiency[q].shots} / {team.attackEfficiency[q].attacks}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* 選手別テーブル */}
      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">
          選手スタッツ(ゴール-試投)
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-[900px] text-center text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] text-slate-500">
                <th className="sticky left-0 bg-white py-1 pr-2 text-left">選手</th>
                {SHOT_COLUMNS.map((c) => (
                  <th key={c} className="px-1.5 py-1">
                    {SHOT_COLUMN_LABELS[c]}
                  </th>
                ))}
                <th className="px-1.5">率</th>
                <th className="px-1.5">E誘発</th>
                <th className="px-1.5">P誘発</th>
                <th className="px-1.5">アシスト</th>
                <th className="px-1.5">カット</th>
                <th className="px-1.5">退水</th>
                <th className="px-1.5">OF</th>
                <th className="px-1.5">ミスP</th>
                <th className="px-1.5">K</th>
                <th className="px-1.5">M</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.user_id} className="border-b border-slate-100">
                  <td className="sticky left-0 bg-white py-1.5 pr-2 text-left font-semibold">
                    <span className="mr-1 text-slate-400">#{p.cap_number}</span>
                    {p.name}
                  </td>
                  {SHOT_COLUMNS.map((c) => (
                    <td key={c}>{cell(p.shots[c].goals, p.shots[c].attempts)}</td>
                  ))}
                  <td className="font-semibold">{formatRate(p.shotRate)}</td>
                  <td>{p.drawnExclusion || "-"}</td>
                  <td>{p.drawnPenalty || "-"}</td>
                  <td>{p.assists || "-"}</td>
                  <td>{p.cuts || "-"}</td>
                  <td>{p.exclusions || "-"}</td>
                  <td>{p.offensiveFouls || "-"}</td>
                  <td>{p.missPass || "-"}</td>
                  <td>{p.missKeep || "-"}</td>
                  <td>{p.missOther || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-400">
          P=ペナルティ / E=エキストラマン(退水中)。横にスクロールできます。
        </p>
      </Card>

      {/* GKテーブル */}
      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">GKスタッツ</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[400px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="py-1 text-left">GK</th>
                <th className="px-2">被シュート</th>
                <th className="px-2">失点</th>
                <th className="px-2">ブロック</th>
                <th className="px-2">枠外</th>
                <th className="px-2">阻止率</th>
              </tr>
            </thead>
            <tbody>
              {gks.map((g) => (
                <tr key={g.user_id} className="border-b border-slate-100">
                  <td className="py-1.5 text-left font-semibold">
                    <span className="mr-1 text-slate-400">#{g.cap_number}</span>
                    {g.name}
                  </td>
                  <td>{g.faced}</td>
                  <td>{g.goalsAgainst}</td>
                  <td>{g.blocks}</td>
                  <td>{g.offTarget}</td>
                  <td className="font-semibold">{formatRate(g.saveRate)}</td>
                </tr>
              ))}
              {gks.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-2 text-slate-400">
                    GKが登録されていません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-400">
          枠内シュート阻止率 = ブロック ÷ (失点 + ブロック)
        </p>
      </Card>
    </>
  );
}
