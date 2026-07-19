import Link from "next/link";
import { Button, Card, ErrorBanner, Input, Label, LevelChip, PointAvatar, Select, Textarea } from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { fetchTeamPointInputs } from "@/lib/points-data";
import {
  computePoints,
  earnedBadges,
  nextLevelProgress,
  POINT_RULE_LABELS,
  emptyPointInputs,
} from "@/lib/points";
import type { PointGrant, Profile, Role } from "@/lib/types";
import { grantPoints, revokePointGrant } from "./actions";

// ポイント/レベルのハブ。自分の現在地・チームのトップ・獲得バッジ・
// ポイントの貯め方をまとめる。順位は上位のみ見せ、下位は晒さない
// (やる気を削がないための設計)。
export default async function PointsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const { team, userId, membership } = await requireMembership();
  const supabase = await createClient();

  const [{ data: membersData }, inputsMap, { data: grantsData }] = await Promise.all([
    supabase
      .from("memberships")
      .select("user_id, role, secondary_role, users(name)")
      .eq("team_id", team.id)
      .eq("status", "active"),
    fetchTeamPointInputs(supabase, team.id),
    supabase
      .from("point_grants")
      .select("id, user_id, granted_by, points, reason, created_at")
      .eq("team_id", team.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const members = (
    (membersData ?? []) as unknown as {
      user_id: string;
      role: Role;
      secondary_role: Role | null;
      users: Pick<Profile, "name"> | null;
    }[]
  ).map((m) => {
    const inputs = inputsMap.get(m.user_id) ?? emptyPointInputs();
    return {
      user_id: m.user_id,
      name: m.users?.name ?? "不明",
      total: computePoints(inputs).total,
    };
  });
  const nameOf = new Map(members.map((m) => [m.user_id, m.name]));

  const ranked = [...members].sort((a, b) => b.total - a.total);
  const myRank = ranked.findIndex((m) => m.user_id === userId);
  const me = ranked[myRank];
  const myInputs = inputsMap.get(userId) ?? emptyPointInputs();
  const myTotal = me?.total ?? 0;
  const prog = nextLevelProgress(myTotal);
  const myBadges = earnedBadges(myInputs, myTotal);
  const top = ranked.slice(0, 7).filter((m) => m.total > 0);
  const medals = ["🥇", "🥈", "🥉"];

  const canGrant = can.grantPoints(membership);
  const grants = (grantsData ?? []) as PointGrant[];

  return (
    <>
      <h1 className="text-lg font-bold">⭐ ポイント</h1>
      <ErrorBanner message={error} />
      {ok === "1" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          ✓ 反映しました
        </div>
      )}

      {/* 自分の現在地 */}
      <Card className="space-y-3">
        <div className="flex items-center gap-3">
          <PointAvatar name={me?.name ?? "?"} total={myTotal} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold">{me?.name ?? "あなた"}</span>
              <LevelChip total={myTotal} />
            </div>
            <div className="text-2xl font-bold tabular-nums text-brand-700">
              {myTotal}
              <span className="ml-1 text-sm font-normal text-slate-400">pt</span>
            </div>
          </div>
          {myRank >= 0 && (
            <div className="shrink-0 text-right">
              <div className="text-xs text-slate-400">チーム内</div>
              <div className="text-lg font-bold">{myRank + 1}位</div>
            </div>
          )}
        </div>
        {prog.next ? (
          <div>
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>次: Lv.{prog.next.label}</span>
              <span>あと {prog.remaining}pt</span>
            </div>
            <div className="h-2 rounded bg-slate-100">
              <div
                className="h-2 rounded bg-brand-500"
                style={{ width: `${Math.round(prog.ratio * 100)}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-center text-xs font-semibold text-fuchsia-600">
            🌈 最高レベル「虹」に到達!
          </p>
        )}
      </Card>

      {/* 獲得バッジ */}
      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">獲得バッジ</h2>
        {myBadges.length === 0 ? (
          <p className="text-sm text-slate-400">
            まだありません。記録・FB・提案などで集まります。
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {myBadges.map((b) => (
              <span
                key={b.key}
                title={b.desc}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
              >
                <span>{b.icon}</span>
                {b.label}
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* チームのトップ */}
      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">🏅 チームのトップ</h2>
        {top.length === 0 ? (
          <p className="text-sm text-slate-400">まだポイントの動きがありません</p>
        ) : (
          <ol className="space-y-1.5">
            {top.map((m, i) => (
              <li
                key={m.user_id}
                className={`flex items-center gap-2 rounded-lg text-sm ${
                  i === 0 ? "bg-amber-50 px-2 py-1 ring-1 ring-amber-200" : ""
                }`}
              >
                <span className="w-6 shrink-0 text-center">{medals[i] ?? `${i + 1}.`}</span>
                <PointAvatar name={m.name} total={m.total} size="sm" />
                <span
                  className={`min-w-0 truncate ${i === 0 ? "font-bold" : "font-medium"}`}
                >
                  {m.name}
                </span>
                <LevelChip total={m.total} />
                <span className="ml-auto shrink-0 font-bold tabular-nums text-brand-700">
                  {m.total}
                  <span className="ml-0.5 text-xs font-normal text-slate-400">pt</span>
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-[10px] text-slate-400">
          ※ 全員の順位ではなく上位のみ表示しています(自分の順位は上のカードで確認できます)。
        </p>
      </Card>

      {/* 手動ポイント付与(幹部・主将・管理者) */}
      {canGrant && (
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-600">
            🌟 特別功労ポイントを付与
          </h2>
          <p className="text-xs text-slate-400">
            アプリの外での貢献(意見・提案とその内容・大会運営の手伝い・後輩指導など)を
            理由付きで評価します。理由はチーム内に公開されます。
          </p>
          <form action={grantPoints} className="space-y-2">
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Label htmlFor="grant_user_id">対象</Label>
                <Select name="user_id" id="grant_user_id" required className="text-sm">
                  {[...members]
                    .sort((a, b) => a.name.localeCompare(b.name, "ja"))
                    .map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.name}
                      </option>
                    ))}
                </Select>
              </div>
              <div className="w-24 shrink-0">
                <Label htmlFor="grant_points">ポイント</Label>
                <Input
                  type="number"
                  name="points"
                  id="grant_points"
                  min={1}
                  max={50}
                  defaultValue={10}
                  required
                  className="text-sm tabular-nums"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="grant_reason">理由</Label>
              <Textarea
                name="reason"
                id="grant_reason"
                rows={2}
                required
                maxLength={300}
                placeholder="例: 練習メニューについて有益な提案をしてくれた(内容: ○○)"
                className="text-sm"
              />
            </div>
            <Button type="submit" className="w-full">
              ポイントを付与
            </Button>
          </form>
        </Card>
      )}

      {/* 特別功労ポイントの履歴(誰でも閲覧可・透明性のため) */}
      {grants.length > 0 && (
        <Card className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-600">🌟 特別功労ポイントの履歴</h2>
          <div className="space-y-2">
            {grants.map((g) => (
              <div
                key={g.id}
                className="flex items-start justify-between gap-2 border-t border-slate-100 pt-2 text-xs first:border-t-0 first:pt-0"
              >
                <div className="min-w-0">
                  <span className="font-semibold text-slate-700">
                    {nameOf.get(g.user_id) ?? "不明"}
                  </span>
                  <span className="text-slate-400"> +{g.points}pt</span>
                  <p className="text-slate-500">{g.reason}</p>
                  <p className="text-[10px] text-slate-400">
                    {nameOf.get(g.granted_by) ?? "不明"}が付与・{g.created_at.slice(0, 10)}
                  </p>
                </div>
                {(g.granted_by === userId || can.manageTeam(membership)) && (
                  <form action={revokePointGrant} className="shrink-0">
                    <input type="hidden" name="grant_id" value={g.id} />
                    <button type="submit" className="text-rose-400 underline">
                      取消
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ポイントの貯め方 */}
      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">ポイントの貯め方</h2>
        <ul className="space-y-1 text-sm">
          {POINT_RULE_LABELS.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-slate-600">{r.label}</span>
              <span className="shrink-0 font-semibold text-brand-700">{r.value}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-2 text-xs">
          <Link href="/proposals" className="text-brand-600 underline">
            💡 提案ボックス
          </Link>
          <Link href="/qa" className="text-brand-600 underline">
            🎓 Q&A掲示板
          </Link>
          <Link href="/me" className="text-brand-600 underline">
            マイページ
          </Link>
        </div>
      </Card>
    </>
  );
}
