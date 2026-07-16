import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, ErrorBanner } from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import {
  buildConditionAdvice,
  summarizeByMonth,
  summarizeByWeek,
  todayJST,
  CONDITION_LABELS,
  PAIN_LABELS,
  type ConditionLogEntry,
} from "@/lib/condition";
import type { ConditionLog, Profile } from "@/lib/types";
import ConditionForm from "../condition-form";

// 5段階値を小さな水平バーで表示する
function ScaleBar({ value, max = 5 }: { value: number | null; max?: number }) {
  if (value == null) return <span className="text-slate-300">-</span>;
  return (
    <span className="flex items-center gap-1">
      <span className="h-2 w-16 rounded bg-slate-100">
        <span
          className="block h-2 rounded bg-brand-500"
          style={{ width: `${(value / max) * 100}%` }}
        />
      </span>
      <span className="w-7 text-right tabular-nums">{value}</span>
    </span>
  );
}

// 個人カルテ: 日々のコンディションの一覧・週次/月次の推移・対策。
// 本人と、マネージャー・管理者だけが開ける(RLSでも同じ制限)。
export default async function ConditionKartePage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { userId: targetId } = await params;
  const { error, ok } = await searchParams;
  const { team, userId, membership } = await requireMembership();

  const isSelf = targetId === userId;
  if (!isSelf && !can.viewTeamCondition(membership)) redirect("/me");

  const supabase = await createClient();
  const [{ data: targetData }, { data: logsData }] = await Promise.all([
    supabase.from("users").select("id, name").eq("id", targetId).maybeSingle(),
    supabase
      .from("condition_logs")
      .select(
        "id, team_id, user_id, log_date, condition, motivation, sleep_hours, pain_level, pain_note, note, created_at"
      )
      .eq("team_id", team.id)
      .eq("user_id", targetId)
      .order("log_date", { ascending: false })
      .limit(200),
  ]);

  const target = targetData as Pick<Profile, "id" | "name"> | null;
  const logs: ConditionLogEntry[] = ((logsData ?? []) as ConditionLog[]).map(
    (l) => ({ ...l, sleep_hours: l.sleep_hours == null ? null : Number(l.sleep_hours) })
  );

  const today = todayJST();
  const todayLog = logs.find((l) => l.log_date === today) ?? null;
  const weekly = summarizeByWeek(logs);
  const monthly = summarizeByMonth(logs);
  const advice = buildConditionAdvice(logs);
  const recent = logs.slice(0, 14);

  return (
    <>
      <Link href={isSelf ? "/me" : "/condition"} className="text-xs text-brand-600 underline">
        ← {isSelf ? "マイページ" : "チームのコンディション"}
      </Link>
      <h1 className="text-lg font-bold">
        🩺 個人カルテ{!isSelf && `: ${target?.name ?? "不明"}`}
      </h1>
      <p className="text-xs text-slate-500">
        🔒 このページを見られるのは本人とマネージャー・管理者だけです。
      </p>
      <ErrorBanner message={error} />
      {ok === "1" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          ✓ 記録しました
        </div>
      )}

      {isSelf && (
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-600">
            今日のコンディション({today})
          </h2>
          <ConditionForm
            logDate={today}
            redirectTo={`/condition/${userId}`}
            existing={todayLog}
          />
        </Card>
      )}

      {/* 対策・アドバイス */}
      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">💡 対策・アドバイス</h2>
        <ul className="space-y-1.5">
          {advice.map((a) => (
            <li key={a} className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">
              {a}
            </li>
          ))}
        </ul>
      </Card>

      {/* 週ごとの推移 */}
      {weekly.length > 0 && (
        <Card className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-600">週ごとの推移</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[10px] text-slate-500">
                  <th className="py-1">週(月曜〜)</th>
                  <th>調子</th>
                  <th>やる気</th>
                  <th className="text-right">睡眠</th>
                  <th className="text-right">痛み</th>
                  <th className="text-right">記録</th>
                </tr>
              </thead>
              <tbody>
                {weekly.map((w) => (
                  <tr key={w.period} className="border-b border-slate-100">
                    <td className="py-1.5 font-medium">{w.period.slice(5)}</td>
                    <td><ScaleBar value={w.avgCondition} /></td>
                    <td><ScaleBar value={w.avgMotivation} /></td>
                    <td className="text-right tabular-nums">
                      {w.avgSleep != null ? `${w.avgSleep}h` : "-"}
                    </td>
                    <td className="text-right">
                      {w.maxPain >= 2 ? (
                        <span className="font-semibold text-rose-600">
                          {PAIN_LABELS[w.maxPain]}
                        </span>
                      ) : (
                        <span className="text-slate-400">{PAIN_LABELS[w.maxPain]}</span>
                      )}
                    </td>
                    <td className="text-right tabular-nums text-slate-500">{w.count}日</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 月ごとの推移 */}
      {monthly.length > 1 && (
        <Card className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-600">月ごとの推移</h2>
          <div className="space-y-1">
            {monthly.map((m) => (
              <div key={m.period} className="flex items-center gap-2 text-xs">
                <span className="w-16 shrink-0 text-slate-500">{m.period}</span>
                <span className="h-2.5 flex-1 rounded bg-slate-100">
                  <span
                    className="block h-2.5 rounded bg-brand-500"
                    style={{ width: `${((m.avgCondition ?? 0) / 5) * 100}%` }}
                  />
                </span>
                <span className="w-24 shrink-0 text-right tabular-nums text-slate-600">
                  調子 {m.avgCondition ?? "-"} / {m.count}日
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 日々の記録 */}
      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">
          日々の記録(直近{recent.length}件)
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-400">まだ記録がありません</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((l) => (
              <li key={l.log_date} className="flex items-center gap-2 py-1.5 text-xs">
                <span className="w-20 shrink-0 text-slate-500">{l.log_date.slice(5)}</span>
                <span className="w-14 shrink-0 font-semibold">
                  {CONDITION_LABELS[l.condition]}
                </span>
                <span className="shrink-0 text-slate-500">やる気{l.motivation}</span>
                <span className="shrink-0 tabular-nums text-slate-500">
                  {l.sleep_hours != null ? `${l.sleep_hours}h` : ""}
                </span>
                {l.pain_level >= 1 && (
                  <span
                    className={`min-w-0 truncate ${l.pain_level >= 2 ? "font-semibold text-rose-600" : "text-amber-600"}`}
                  >
                    {PAIN_LABELS[l.pain_level]}
                    {l.pain_note ? `(${l.pain_note})` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
