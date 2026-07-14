import Link from "next/link";
import { Card, LinkButton, TagBadge } from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import {
  buildRankings,
  buildTeamSummary,
  formatRate,
  type StatsEvent,
} from "@/lib/stats";
import type { ClipTag, Match, Profile, TacticalReport } from "@/lib/types";

const RESULT_LABELS: Record<string, string> = {
  win: "勝ち",
  lose: "負け",
  draw: "引き分け",
};

// 試合結果の色分け(勝=emerald / 負=rose / 分=slate)
const RESULT_STYLES: Record<string, string> = {
  win: "text-emerald-600",
  lose: "text-rose-600",
  draw: "text-slate-500",
};

export default async function DashboardPage() {
  const { team } = await requireMembership();
  const supabase = await createClient();

  const [recentMatchesRes, eventsRes, membersRes, tagsRes, commentsRes, reportsRes] =
    await Promise.all([
      // 直近5試合分を取得し、上位3件を表示・残りはスタッツ要約の集計対象にする
      supabase
        .from("matches")
        .select("id, title, opponent, match_date, result, score_for, score_against")
        .eq("team_id", team.id)
        .order("match_date", { ascending: false, nullsFirst: false })
        .limit(5),
      supabase
        .from("stats_events")
        .select("id, match_id, quarter, player_id, type, subtype, result, is_extra_man")
        .eq("team_id", team.id),
      supabase
        .from("memberships")
        .select("user_id, users(name)")
        .eq("team_id", team.id),
      supabase
        .from("clip_tags")
        .select("id, clip_id, tag_type, tag_value")
        .eq("team_id", team.id),
      supabase
        .from("clip_comments")
        .select("id, comment, comment_type, created_at, clip_id, users(name)")
        .eq("team_id", team.id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("tactical_reports")
        .select("id, match_id, title, key_problem_patterns, created_at")
        .eq("team_id", team.id)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  const recentMatches = (recentMatchesRes.data ?? []) as Pick<
    Match,
    "id" | "title" | "opponent" | "match_date" | "result" | "score_for" | "score_against"
  >[];
  const matches = recentMatches.slice(0, 3);
  const recentMatchIds = new Set(recentMatches.map((m) => m.id));

  const allEvents = (eventsRes.data ?? []) as StatsEvent[];
  // チームのスタッツ要約は直近5試合分の記録に絞る
  const recentEvents = allEvents.filter((e) => recentMatchIds.has(e.match_id));

  const nameOf = new Map(
    (
      (membersRes.data ?? []) as unknown as {
        user_id: string;
        users: Pick<Profile, "name"> | null;
      }[]
    ).map((m) => [m.user_id, m.users?.name ?? "不明"])
  );

  const tags = (tagsRes.data ?? []) as Pick<
    ClipTag,
    "id" | "clip_id" | "tag_type" | "tag_value"
  >[];
  const comments = commentsRes.data ?? [];
  const reports = (reportsRes.data ?? []) as Pick<
    TacticalReport,
    "id" | "match_id" | "title" | "key_problem_patterns" | "created_at"
  >[];

  // ---------- チームのスタッツ要約(直近5試合程度) ----------
  const teamSummary = buildTeamSummary(recentEvents);
  const recentShots = recentEvents.filter((e) => e.type === "shot");
  const recentShotGoals = recentShots.filter((e) => e.result === "goal").length;
  const shotRate = recentShots.length > 0 ? recentShotGoals / recentShots.length : null;
  const counterJoinCount = recentEvents.filter((e) => e.type === "counter_join").length;
  const defenseStopCount = recentEvents.filter((e) => e.type === "defense_stop").length;

  const kpis: { label: string; value: string }[] = [
    { label: "シュート成功率", value: formatRate(shotRate) },
    { label: "退水決定率", value: formatRate(teamSummary.exclusionRate) },
    { label: "総得点", value: String(teamSummary.totalFor) },
    { label: "総失点", value: String(teamSummary.totalAgainst) },
    { label: "速攻参加", value: `${counterJoinCount}件` },
    { label: "対人守備成功", value: `${defenseStopCount}件` },
  ];

  // ---------- 選手ハイライト(通算記録からの得点王・アシスト王) ----------
  const rankings = buildRankings(allEvents);
  const topGoal = rankings.goals[0];
  const topAssist = rankings.assists[0];

  // ---------- 失点原因ランキング: result:失点 が付いたクリップの cause タグを集計 ----------
  const concededClipIds = new Set(
    tags
      .filter((t) => t.tag_type === "result" && t.tag_value === "失点")
      .map((t) => t.clip_id)
  );
  const concedeCauses = Object.entries(
    tags
      .filter((t) => t.tag_type === "cause" && concededClipIds.has(t.clip_id))
      .reduce<Record<string, number>>((acc, t) => {
        acc[t.tag_value] = (acc[t.tag_value] ?? 0) + 1;
        return acc;
      }, {})
  ).sort((a, b) => b[1] - a[1]);

  // ---------- 考える材料: 直近レポートの「繰り返し発生している問題パターン」(最大5件) ----------
  const problemPatterns = reports
    .flatMap((r) => r.key_problem_patterns ?? [])
    .slice(0, 5);

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">ダッシュボード</h1>
        <LinkButton href="/matches/new" className="min-h-9 px-3 text-xs">
          + 試合登録
        </LinkButton>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">直近の試合</h2>
        {matches.length === 0 && (
          <Card className="text-sm text-slate-500">
            まだ試合がありません。「+ 試合登録」から始めましょう。
          </Card>
        )}
        {matches.map((m) => (
          <Link key={m.id} href={`/matches/${m.id}`} className="block">
            <Card className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{m.title}</div>
                <div className="text-xs text-slate-500">
                  {m.match_date ?? "日付未設定"}
                  {m.opponent ? ` / vs ${m.opponent}` : ""}
                </div>
              </div>
              {m.score_for != null && m.score_against != null && (
                <div className="text-right">
                  <div
                    className={`text-lg font-bold ${m.result ? RESULT_STYLES[m.result] ?? "" : ""}`}
                  >
                    {m.score_for}-{m.score_against}
                  </div>
                  {m.result && (
                    <div className={`text-xs ${RESULT_STYLES[m.result] ?? "text-slate-500"}`}>
                      {RESULT_LABELS[m.result] ?? ""}
                    </div>
                  )}
                </div>
              )}
            </Card>
          </Link>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">
          チームのスタッツ要約
          {recentMatches.length > 0 ? `(直近${recentMatches.length}試合)` : ""}
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {kpis.map((k) => (
            <Card key={k.label} className="p-3 text-center">
              <div className="text-xl font-bold text-brand-700">{k.value}</div>
              <div className="text-xs text-slate-500">{k.label}</div>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">選手ハイライト</h2>
        <div className="grid grid-cols-2 gap-2">
          <Card className="p-3 text-center">
            <div className="text-xs text-slate-500">🏆 得点王</div>
            <div className="mt-1 font-bold">
              {topGoal ? nameOf.get(topGoal.user_id) ?? "不明" : "-"}
            </div>
            <div className="text-xs text-slate-400">{topGoal ? `${topGoal.count}点` : ""}</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-xs text-slate-500">🤝 アシスト王</div>
            <div className="mt-1 font-bold">
              {topAssist ? nameOf.get(topAssist.user_id) ?? "不明" : "-"}
            </div>
            <div className="text-xs text-slate-400">
              {topAssist ? `${topAssist.count}回` : ""}
            </div>
          </Card>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">課題の参考データ</h2>
        <Card className="space-y-3">
          <div>
            <h3 className="text-xs font-semibold text-slate-500">失点原因ランキング</h3>
            {concedeCauses.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">
                失点クリップに原因タグが付くとここに表示されます
              </p>
            ) : (
              <ol className="mt-1 space-y-1">
                {concedeCauses.slice(0, 5).map(([cause, n], i) => (
                  <li key={cause} className="flex items-center justify-between text-sm">
                    <span>
                      {i + 1}. <TagBadge tagType="cause">{cause}</TagBadge>
                    </span>
                    <span className="font-semibold">{n}件</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-500">
              直近レポートの問題パターン(参考)
            </h3>
            {problemPatterns.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">
                試合詳細からAI戦術レポートを生成すると表示されます
              </p>
            ) : (
              <ul className="mt-1 list-inside list-disc space-y-1 text-sm">
                {problemPatterns.map((p, i) => (
                  <li key={`${p}-${i}`}>{p}</li>
                ))}
              </ul>
            )}
          </div>
          <p className="border-t border-slate-100 pt-2 text-xs leading-relaxed text-slate-400">
            練習メニューはこれらを踏まえて、経験のある選手・スタッフで議論して決めましょう。
          </p>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">最近のコメント</h2>
        {comments.length === 0 ? (
          <Card className="text-sm text-slate-500">まだコメントがありません</Card>
        ) : (
          comments.map((c) => (
            <Link key={c.id} href={`/clips/${c.clip_id}`} className="block">
              <Card className="p-3">
                <p className="text-sm">{c.comment}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {(c.users as unknown as { name: string } | null)?.name ?? "不明"}
                  ・{new Date(c.created_at).toLocaleDateString("ja-JP")}
                </p>
              </Card>
            </Link>
          ))
        )}
      </section>
    </>
  );
}
