import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, RoleBadge } from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can, isManager } from "@/lib/permissions";
import {
  todayJST,
  CONDITION_LABELS,
  PAIN_LABELS,
  type ConditionLogEntry,
} from "@/lib/condition";
import type { ConditionLog, Profile, Role } from "@/lib/types";

// スタッフ(マネージャー・管理者)向け: チーム全員のコンディション一覧。
// 「今日誰が痛みを抱えているか」「調子を落としている部員はいないか」を
// 練習前にひと目で把握するための画面。選手が開くと自分のカルテへ。
export default async function ConditionTeamPage() {
  const { team, userId, membership } = await requireMembership();
  if (!can.viewTeamCondition(membership)) redirect(`/condition/${userId}`);

  const supabase = await createClient();
  const [{ data: membersData }, { data: logsData }] = await Promise.all([
    supabase
      .from("memberships")
      .select("user_id, cap_number, role, secondary_role, users(name)")
      .eq("team_id", team.id)
      .eq("status", "active")
      .order("cap_number"),
    supabase
      .from("condition_logs")
      .select("user_id, log_date, condition, motivation, sleep_hours, pain_level, pain_note")
      .eq("team_id", team.id)
      .order("log_date", { ascending: false })
      .limit(1000),
  ]);

  const members = (
    (membersData ?? []) as unknown as {
      user_id: string;
      cap_number: number | null;
      role: Role;
      secondary_role: Role | null;
      users: Pick<Profile, "name"> | null;
    }[]
  ).map((m) => ({
    user_id: m.user_id,
    cap_number: m.cap_number,
    name: m.users?.name ?? "不明",
    manager: isManager(m),
  }));

  const logs = ((logsData ?? []) as (ConditionLog & { user_id: string })[]).map(
    (l) => ({ ...l, sleep_hours: l.sleep_hours == null ? null : Number(l.sleep_hours) })
  );

  const today = todayJST();
  const latestByUser = new Map<string, ConditionLogEntry & { log_date: string }>();
  for (const l of logs) {
    if (!latestByUser.has(l.user_id)) latestByUser.set(l.user_id, l);
  }

  const todayCount = members.filter(
    (m) => latestByUser.get(m.user_id)?.log_date === today
  ).length;
  // 要注意: 直近の記録で痛みが「痛い」以上 or 調子が「不調」以下
  const alerts = members.filter((m) => {
    const l = latestByUser.get(m.user_id);
    return l && (l.pain_level >= 2 || l.condition <= 2);
  });

  return (
    <>
      <h1 className="text-lg font-bold">🩺 チームのコンディション</h1>
      <p className="text-xs text-slate-500">
        この一覧はマネージャー・管理者だけが見られます(選手同士では見えません)。
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Card className="p-3 text-center">
          <div className="text-2xl font-bold tabular-nums">
            {todayCount}
            <span className="text-sm font-normal text-slate-400">/{members.length}</span>
          </div>
          <div className="text-xs text-slate-500">今日の記録済み</div>
        </Card>
        <Card className="p-3 text-center">
          <div className={`text-2xl font-bold tabular-nums ${alerts.length > 0 ? "text-rose-600" : ""}`}>
            {alerts.length}
          </div>
          <div className="text-xs text-slate-500">要注意(痛み・不調)</div>
        </Card>
      </div>

      {alerts.length > 0 && (
        <Card className="space-y-2 border-rose-200">
          <h2 className="text-sm font-semibold text-rose-600">⚠️ 要注意</h2>
          {alerts.map((m) => {
            const l = latestByUser.get(m.user_id)!;
            return (
              <Link
                key={m.user_id}
                href={`/condition/${m.user_id}`}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="min-w-0 truncate font-medium text-brand-700 underline">
                  {m.cap_number ? `#${m.cap_number} ` : ""}
                  {m.name}
                </span>
                <span className="shrink-0 text-xs text-rose-600">
                  {l.pain_level >= 2
                    ? `${PAIN_LABELS[l.pain_level]}${l.pain_note ? `(${l.pain_note})` : ""}`
                    : CONDITION_LABELS[l.condition]}
                  <span className="ml-1 text-slate-400">{l.log_date.slice(5)}</span>
                </span>
              </Link>
            );
          })}
        </Card>
      )}

      <Card className="space-y-1">
        <h2 className="text-sm font-semibold text-slate-600">
          メンバー({members.length}人)
        </h2>
        {members.map((m) => {
          const l = latestByUser.get(m.user_id);
          return (
            <Link
              key={m.user_id}
              href={`/condition/${m.user_id}`}
              className="flex items-center justify-between gap-2 border-t border-slate-100 py-1.5 text-sm first:border-t-0"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <RoleBadge manager={m.manager} />
                <span className="min-w-0 truncate font-medium text-brand-700">
                  {m.cap_number ? `#${m.cap_number} ` : ""}
                  {m.name}
                </span>
              </span>
              {l ? (
                <span className="shrink-0 text-xs text-slate-500">
                  {l.log_date === today ? "今日" : l.log_date.slice(5)}:{" "}
                  {CONDITION_LABELS[l.condition]}
                  {l.sleep_hours != null ? ` / ${l.sleep_hours}h` : ""}
                  {l.pain_level >= 1 && (
                    <span className={l.pain_level >= 2 ? "ml-1 font-semibold text-rose-600" : "ml-1 text-amber-600"}>
                      {PAIN_LABELS[l.pain_level]}
                    </span>
                  )}
                </span>
              ) : (
                <span className="shrink-0 text-xs text-slate-300">記録なし</span>
              )}
            </Link>
          );
        })}
      </Card>
    </>
  );
}
