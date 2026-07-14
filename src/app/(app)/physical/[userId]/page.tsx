import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Card, ErrorBanner, Input, Select } from "@/components/ui";
import { RadarChart } from "@/components/radar-chart";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { positionLabel } from "@/lib/constants";
import {
  PHYSICAL_METRICS,
  PHYSICAL_METRIC_MAP,
  buildPhysicalProfiles,
  generatePhysicalComment,
  type PhysicalMeasurementRow,
  type PhysicalRosterEntry,
} from "@/lib/physical";
import {
  buildGkPerformance,
  buildPerformanceProfiles,
} from "@/lib/performance";
import type { RosterEntry, StatsEvent } from "@/lib/stats";
import type { Profile } from "@/lib/types";
import { deletePhysicalMeasurement, updatePhysicalMeasurement } from "../actions";

function fmt(value: number | null, digits = 1): string {
  if (value == null) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

// 個人のフィジカル分析 + プレー総合スコア。
export default async function PhysicalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ metric?: string; ok?: string; error?: string }>;
}) {
  const { userId } = await params;
  const { metric: metricParam, ok, error } = await searchParams;
  const { team, membership } = await requireMembership();
  const canRecord = can.recordPhysical(membership);
  const supabase = await createClient();

  const [{ data: membersData }, { data: rowsData }, { data: eventsData }] =
    await Promise.all([
      supabase
        .from("memberships")
        .select("user_id, cap_number, is_gk, field_position, users(name)")
        .eq("team_id", team.id)
        .eq("status", "active")
        .order("cap_number"),
      supabase
        .from("physical_measurements")
        .select("id, user_id, metric, value, measured_on")
        .eq("team_id", team.id),
      supabase
        .from("stats_events")
        .select("id, match_id, quarter, player_id, type, subtype, result, is_extra_man")
        .eq("team_id", team.id),
    ]);

  const roster: PhysicalRosterEntry[] = (
    (membersData ?? []) as unknown as {
      user_id: string;
      cap_number: number | null;
      is_gk: boolean;
      field_position: number | null;
      users: Pick<Profile, "name"> | null;
    }[]
  ).map((m) => ({
    user_id: m.user_id,
    name: m.users?.name ?? "不明",
    cap_number: m.cap_number ?? 99,
    is_gk: m.is_gk,
    field_position: m.field_position,
  }));

  const target = roster.find((r) => r.user_id === userId);
  if (!target) notFound();

  // numeric列はPostgREST/supabase-jsが文字列で返すため、ここで数値に正規化する
  const rows: (PhysicalMeasurementRow & { id: string })[] = (
    (rowsData ?? []) as (PhysicalMeasurementRow & { id: string })[]
  ).map((r) => ({ ...r, value: Number(r.value) }));
  const profiles = buildPhysicalProfiles(rows, roster);
  const profile = profiles.find((p) => p.user_id === userId)!;
  const comment = generatePhysicalComment(profile);

  const metricKey =
    metricParam && PHYSICAL_METRIC_MAP[metricParam] ? metricParam : PHYSICAL_METRICS[0].key;
  const metricDef = PHYSICAL_METRIC_MAP[metricKey];
  const history = rows
    .filter((r) => r.user_id === userId && r.metric === metricKey)
    .sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  const historyMax = Math.max(1, ...history.map((h) => h.value));

  const statsRoster: RosterEntry[] = roster.map((r) => ({
    user_id: r.user_id,
    name: r.name,
    cap_number: r.cap_number,
    is_gk: r.is_gk,
  }));
  const events = (eventsData ?? []) as StatsEvent[];

  const performanceProfile = target.is_gk
    ? null
    : buildPerformanceProfiles(events, statsRoster).find((p) => p.user_id === userId) ?? null;
  const gkCard = target.is_gk
    ? buildGkPerformance(events, statsRoster).find((c) => c.user_id === userId) ?? null
    : null;

  const positionText = positionLabel(target.is_gk, target.field_position);

  return (
    <>
      <Link href="/physical" className="text-xs text-brand-600 underline">
        ← フィジカル
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">
          #{target.cap_number} {target.name}
        </h1>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {positionText}
        </span>
      </div>
      <ErrorBanner message={error} />
      {ok === "1" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          保存しました
        </div>
      )}

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-600">
          フィジカル6軸(本人 vs 同ポジ平均)
        </h2>
        <p className="text-xs text-slate-400">
          軸の値=その軸に属する測定項目のチーム内偏差値の平均です。
          測定値を記録するほど各軸が更新されます(2人以上の記録がある項目で差が出ます)。
        </p>
        <RadarChart
          axes={profile.axes.map((a) => ({
            label: a.label,
            value: a.teamT,
            secondaryValue: a.positionT,
          }))}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[380px] text-center text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-1 text-left">項目</th>
                <th className="px-2">記録</th>
                <th className="px-2">チームT</th>
                <th className="px-2">同ポジ平均T</th>
              </tr>
            </thead>
            <tbody>
              {profile.axes.map((axis) => (
                <Fragment key={axis.key}>
                  {/* 軸の見出し行(軸Tも表示) */}
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <td className="py-1 text-left font-bold text-brand-700">
                      {axis.label}
                    </td>
                    <td />
                    <td className="tabular-nums font-bold text-brand-700">
                      {Math.round(axis.teamT)}
                    </td>
                    <td className="tabular-nums text-slate-500">
                      {axis.positionT == null ? "-" : Math.round(axis.positionT)}
                    </td>
                  </tr>
                  {profile.metrics
                    .filter((m) => m.axis === axis.key)
                    .map((m) => (
                      <tr key={m.key} className="border-b border-slate-100">
                        <td className="py-1 pl-3 text-left font-medium">{m.label}</td>
                        <td className="tabular-nums">
                          {fmt(m.value)}
                          {m.value != null && (
                            <span className="ml-0.5 text-slate-400">{m.unit}</span>
                          )}
                        </td>
                        <td className="tabular-nums font-semibold">
                          {m.teamT == null ? "-" : Math.round(m.teamT)}
                        </td>
                        <td className="tabular-nums text-slate-500">
                          {m.positionT == null ? "-" : Math.round(m.positionT)}
                        </td>
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="rounded-lg bg-brand-50 p-2 text-sm leading-relaxed text-brand-900">
          {comment}
        </p>
        <p className="text-lg font-bold tabular-nums">
          総合フィジカルスコア {profile.overallPhysicalScore}
        </p>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-600">項目別の推移</h2>
        <form className="flex gap-2">
          <Select name="metric" defaultValue={metricKey} className="flex-1 text-sm">
            {PHYSICAL_METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}({m.unit})
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary" className="shrink-0">
            表示
          </Button>
        </form>
        {history.length === 0 ? (
          <p className="text-sm text-slate-400">まだ記録がありません</p>
        ) : (
          <ul className="space-y-1.5">
            {history.map((h, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 text-slate-500">{h.measured_on}</span>
                <span className="h-3 flex-1 rounded bg-slate-100">
                  <span
                    className="block h-3 rounded bg-brand-500"
                    style={{ width: `${Math.max(4, (h.value / historyMax) * 100)}%` }}
                  />
                </span>
                <span className="w-16 shrink-0 text-right font-semibold tabular-nums">
                  {h.value}
                  {metricDef?.unit}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* スタッフはこの項目の各記録をいつでも編集・削除できる */}
        {canRecord && history.length > 0 && (
          <div className="space-y-1.5 border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-500">記録の編集・削除</p>
            {history.map((h) => (
              <div key={`edit-${h.id}`} className="flex items-center gap-1.5">
                <span className="w-24 shrink-0 text-xs text-slate-500">
                  {h.measured_on}
                </span>
                <form
                  action={updatePhysicalMeasurement}
                  className="flex min-w-0 flex-1 items-center gap-1"
                >
                  <input type="hidden" name="measurement_id" value={h.id} />
                  <input type="hidden" name="user_id" value={userId} />
                  <input type="hidden" name="measured_on" value={h.measured_on} />
                  <Input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    name="value"
                    defaultValue={h.value}
                    className="min-w-0 flex-1 px-2 py-1.5 text-sm tabular-nums"
                    aria-label={`${h.measured_on}の${metricDef?.label ?? ""}`}
                  />
                  <Button
                    type="submit"
                    variant="secondary"
                    className="min-h-9 shrink-0 px-2 text-xs"
                  >
                    保存
                  </Button>
                </form>
                <form action={deletePhysicalMeasurement} className="shrink-0">
                  <input type="hidden" name="measurement_id" value={h.id} />
                  <input type="hidden" name="user_id" value={userId} />
                  <Button
                    type="submit"
                    variant="danger"
                    className="min-h-9 px-2 text-xs"
                  >
                    削除
                  </Button>
                </form>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">プレー総合スコア</h2>
        {performanceProfile && (
          <>
            <RadarChart
              axes={performanceProfile.axes.map((a) => ({
                label: a.label + (a.approx ? "※" : ""),
                value: a.t,
              }))}
              primaryLabel="本人"
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] text-center text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-1 text-left">軸</th>
                    <th className="px-2">生値</th>
                    <th className="px-2">T得点</th>
                  </tr>
                </thead>
                <tbody>
                  {performanceProfile.axes.map((a) => (
                    <tr key={a.key} className="border-b border-slate-100">
                      <td className="py-1 text-left font-medium">
                        {a.label}
                        {a.approx && <span className="ml-1 text-amber-600">※簡易推定</span>}
                      </td>
                      <td className="tabular-nums">{fmt(a.rawValue, 2)}</td>
                      <td className="tabular-nums font-semibold">{Math.round(a.t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-lg font-bold tabular-nums">
              総合プレースコア {performanceProfile.overallPerformance}
            </p>
            {performanceProfile.axes.some((a) => a.approx) && (
              <p className="text-[10px] text-slate-400">
                ※
                {performanceProfile.axes
                  .filter((a) => a.approx)
                  .map((a) => a.label)
                  .join("・")}
                は専用の記録項目がまだ無いため、既存の記録(アシスト・シュート関与・カット・被退水)からの簡易推定です。
              </p>
            )}
          </>
        )}
        {gkCard && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs text-slate-500">被シュート</p>
              <p className="text-xl font-bold tabular-nums">{gkCard.faced}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">失点</p>
              <p className="text-xl font-bold tabular-nums">{gkCard.goalsAgainst}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">セーブ率</p>
              <p className="text-xl font-bold tabular-nums">
                {gkCard.saveRate == null ? "-" : `${Math.round(gkCard.saveRate * 100)}%`}
              </p>
            </div>
          </div>
        )}
        {!performanceProfile && !gkCard && (
          <p className="text-sm text-slate-400">まだ試合記録がありません</p>
        )}
      </Card>
    </>
  );
}
