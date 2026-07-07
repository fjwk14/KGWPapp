import Link from "next/link";
import { Card, LinkButton, TagBadge } from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { ClipTag, Match, TacticalReport } from "@/lib/types";

export default async function DashboardPage() {
  const { team } = await requireMembership();
  const supabase = await createClient();

  const [matchesRes, clipsRes, tagsRes, commentsRes, reportRes] =
    await Promise.all([
      supabase
        .from("matches")
        .select("id, title, opponent, match_date, result, score_for, score_against")
        .eq("team_id", team.id)
        .order("match_date", { ascending: false, nullsFirst: false })
        .limit(3),
      supabase.from("video_clips").select("id").eq("team_id", team.id),
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
        .select("id, match_id, title, recommended_training_themes, created_at")
        .eq("team_id", team.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const matches = (matchesRes.data ?? []) as Pick<
    Match,
    "id" | "title" | "opponent" | "match_date" | "result" | "score_for" | "score_against"
  >[];
  const clips = clipsRes.data ?? [];
  const tags = (tagsRes.data ?? []) as Pick<
    ClipTag,
    "id" | "clip_id" | "tag_type" | "tag_value"
  >[];
  const comments = commentsRes.data ?? [];
  const report = reportRes.data as Pick<
    TacticalReport,
    "id" | "match_id" | "title" | "recommended_training_themes" | "created_at"
  > | null;

  const taggedClipIds = new Set(tags.map((t) => t.clip_id));
  const untaggedCount = clips.filter((c) => !taggedClipIds.has(c.id)).length;

  const count = (type: string, value: string) =>
    tags.filter((t) => t.tag_type === type && t.tag_value === value).length;

  // 失点原因ランキング: result:失点 が付いたクリップの cause タグを集計
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

  const passMissClips = new Set(
    tags
      .filter((t) => t.tag_type === "action" && t.tag_value === "パスミス")
      .map((t) => t.clip_id)
  ).size;
  // カウンター成功: 「カウンター」タグと「得点」タグが両方付いたクリップ数
  const scoredClipIds = new Set(
    tags
      .filter((t) => t.tag_type === "result" && t.tag_value === "得点")
      .map((t) => t.clip_id)
  );
  const counterSuccess = new Set(
    tags
      .filter(
        (t) =>
          (t.tag_type === "phase" || t.tag_type === "action") &&
          t.tag_value === "カウンター" &&
          scoredClipIds.has(t.clip_id)
      )
      .map((t) => t.clip_id)
  ).size;
  const counterFail = count("result", "カウンター被弾");
  const exclusionClips = new Set(
    tags
      .filter((t) =>
        ["退水", "退水獲得", "退水守備"].includes(t.tag_value)
      )
      .map((t) => t.clip_id)
  ).size;

  const stats = [
    { label: "登録クリップ", value: clips.length },
    { label: "未タグ付け", value: untaggedCount },
    { label: "パスミス関連", value: passMissClips },
    { label: "退水関連", value: exclusionClips },
    { label: "カウンター成功", value: counterSuccess },
    { label: "カウンター失敗", value: counterFail },
  ];

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">ダッシュボード</h1>
        <LinkButton href="/matches/new" className="min-h-9 px-3 text-xs">
          + 試合登録
        </LinkButton>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <Card key={s.label} className="p-3 text-center">
            <div className="text-xl font-bold text-brand-700">{s.value}</div>
            <div className="text-xs text-slate-500">{s.label}</div>
          </Card>
        ))}
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
                <div className="text-lg font-bold">
                  {m.score_for}-{m.score_against}
                </div>
              )}
            </Card>
          </Link>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">失点原因ランキング</h2>
        <Card>
          {concedeCauses.length === 0 ? (
            <p className="text-sm text-slate-500">
              失点クリップに原因タグが付くとここに表示されます
            </p>
          ) : (
            <ol className="space-y-1">
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
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">
          AIが提案する次回練習テーマ
        </h2>
        <Card>
          {!report ? (
            <p className="text-sm text-slate-500">
              試合詳細からAI戦術レポートを生成すると表示されます
            </p>
          ) : (
            <>
              <ul className="list-inside list-disc space-y-1 text-sm">
                {(report.recommended_training_themes ?? []).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <Link
                href={`/matches/${report.match_id}/report`}
                className="mt-2 inline-block text-xs text-brand-600 underline"
              >
                {report.title} を見る
              </Link>
            </>
          )}
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
