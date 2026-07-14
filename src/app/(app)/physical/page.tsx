import Link from "next/link";
import { Button, Card, ErrorBanner, Input, Label, Select } from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import {
  PHYSICAL_METRICS,
  PHYSICAL_METRIC_MAP,
  buildMetricRanking,
  buildOverallRanking,
  buildPhysicalProfiles,
  type PhysicalMeasurementRow,
  type PhysicalRosterEntry,
} from "@/lib/physical";
import type { Profile } from "@/lib/types";
import { recordPhysicalMeasurements } from "./actions";

const medals = ["🥇", "🥈", "🥉"];

// チームのフィジカル測定・分析。スタッフ(マネージャー以上)は測定値を記録でき、
// 全メンバーは種目別ランキング・総合フィジカルスコアを閲覧できる。
export default async function PhysicalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; metric?: string }>;
}) {
  const { error, metric: metricParam } = await searchParams;
  const { team, membership } = await requireMembership();
  const supabase = await createClient();

  const [{ data: membersData }, { data: rowsData }] = await Promise.all([
    supabase
      .from("memberships")
      .select("user_id, cap_number, is_gk, field_position, users(name)")
      .eq("team_id", team.id)
      .eq("status", "active")
      .order("cap_number"),
    supabase
      .from("physical_measurements")
      .select("user_id, metric, value, measured_on")
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

  // numeric列はPostgREST/supabase-jsが文字列で返すため、ここで数値に正規化する
  const rows: PhysicalMeasurementRow[] = ((rowsData ?? []) as PhysicalMeasurementRow[]).map(
    (r) => ({ ...r, value: Number(r.value) })
  );

  const metricKey =
    metricParam && PHYSICAL_METRIC_MAP[metricParam] ? metricParam : PHYSICAL_METRICS[0].key;
  const metricRanking = buildMetricRanking(rows, roster, metricKey);
  const metricDef = PHYSICAL_METRIC_MAP[metricKey];

  const profiles = buildPhysicalProfiles(rows, roster);
  const overallRanking = buildOverallRanking(profiles);

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold">💪 フィジカル測定・分析</h1>
      </div>
      <ErrorBanner message={error} />

      {can.recordPhysical(membership.role) && (
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-600">測定値を記録</h2>
          <p className="text-xs text-slate-400">
            空欄の項目はスキップされます。まとめて複数項目を入力できます。
          </p>
          <form action={recordPhysicalMeasurements} className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="user_id">選手</Label>
                <Select name="user_id" id="user_id" required className="text-sm">
                  {[...roster]
                    .sort((a, b) => a.cap_number - b.cap_number)
                    .map((r) => (
                      <option key={r.user_id} value={r.user_id}>
                        #{r.cap_number} {r.name}
                      </option>
                    ))}
                </Select>
              </div>
              <div className="w-36 shrink-0">
                <Label htmlFor="measured_on">測定日</Label>
                <Input
                  type="date"
                  name="measured_on"
                  id="measured_on"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {PHYSICAL_METRICS.map((m) => (
                <div key={m.key}>
                  <Label htmlFor={m.key} className="text-xs">
                    {m.label}
                    <span className="ml-1 text-slate-400">({m.unit})</span>
                  </Label>
                  <Input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    name={m.key}
                    id={m.key}
                    placeholder="未入力"
                    className="text-sm tabular-nums"
                  />
                </div>
              ))}
            </div>

            <Button type="submit" className="w-full">
              記録する
            </Button>
          </form>
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-600">種目別ランキング</h2>
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

        {metricRanking.length === 0 ? (
          <p className="text-sm text-slate-400">まだ記録がありません</p>
        ) : (
          <ol className="space-y-1">
            {metricRanking.map((e, i) => (
              <li key={e.user_id} className="flex items-center justify-between text-sm">
                <Link
                  href={`/physical/${e.user_id}`}
                  className="min-w-0 truncate text-brand-700 hover:underline"
                >
                  <span className="mr-1.5 inline-block w-6 text-center">
                    {medals[i] ?? `${i + 1}.`}
                  </span>
                  <span className={i === 0 ? "font-bold" : "font-medium"}>
                    #{e.cap_number} {e.name}
                  </span>
                </Link>
                <span className="shrink-0 font-bold tabular-nums text-brand-700">
                  {e.value}
                  <span className="ml-0.5 text-xs font-normal text-slate-500">
                    {metricDef?.unit}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-[10px] text-slate-400">
          各選手の最新の記録で順位付けしています。
        </p>
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">総合フィジカルスコア ランキング</h2>
        <p className="text-xs text-slate-400">
          レーダー7軸(到達高・キープ・10m・持久・スロー・精度・引く力)のチーム内偏差値の平均です。
        </p>
        {overallRanking.length === 0 ? (
          <p className="text-sm text-slate-400">まだ記録がありません</p>
        ) : (
          <ol className="space-y-1">
            {overallRanking.map((e, i) => (
              <li key={e.user_id} className="flex items-center justify-between text-sm">
                <Link
                  href={`/physical/${e.user_id}`}
                  className="min-w-0 truncate text-brand-700 hover:underline"
                >
                  <span className="mr-1.5 inline-block w-6 text-center">
                    {medals[i] ?? `${i + 1}.`}
                  </span>
                  <span className={i === 0 ? "font-bold" : "font-medium"}>
                    #{e.cap_number} {e.name}
                  </span>
                </Link>
                <span className="shrink-0 font-bold tabular-nums text-brand-700">{e.score}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}
