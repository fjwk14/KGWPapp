import Link from "next/link";
import { Card, LinkButton, LevelChip, PointAvatar } from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isManager, ROLE_LABELS } from "@/lib/permissions";
import { positionLabel, ATTENDANCE_LABELS } from "@/lib/constants";
import {
  buildPhysicalProfiles,
  type PhysicalMeasurementRow,
  type PhysicalRosterEntry,
} from "@/lib/physical";
import { buildGkPerformance, buildPerformanceProfiles } from "@/lib/performance";
import { receivedCommentIds, type CommentForUnread } from "@/lib/notifications";
import { monthlyAttendanceSummary } from "@/lib/practices";
import { todayJST, CONDITION_LABELS } from "@/lib/condition";
import { fetchUserPoints } from "@/lib/points-data";
import { earnedBadges, nextLevelProgress } from "@/lib/points";
import type { RosterEntry, StatsEvent } from "@/lib/stats";
import type {
  AttendanceStatus,
  ClipComment,
  ConditionLog,
  PeerFeedback,
  Profile,
} from "@/lib/types";
import ConditionForm from "../condition/condition-form";

// 選手個人のマイページ。コンディション・プレー評価・フィジカル評価・出席率・
// もらったFB/コメントを1画面にまとめる(詳細な軸別レーダーは /physical/[userId] へ)。
export default async function MyPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const { ok } = await searchParams;
  const { team, userId, profile, membership } = await requireMembership();
  const supabase = await createClient();
  const today = todayJST();

  const [
    { data: myMembershipData },
    { data: membersData },
    { data: rowsData },
    { data: eventsData },
    { data: attendanceData },
    { data: practicesData },
    { data: commentsData },
    { data: clipsData },
    { data: conditionData },
    { data: receivedFbData },
  ] = await Promise.all([
    supabase
      .from("memberships")
      .select("field_position, secondary_field_position")
      .eq("team_id", team.id)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("user_id, cap_number, is_gk, field_position, secondary_field_position, users(name)")
      .eq("team_id", team.id)
      .eq("status", "active"),
    supabase
      .from("physical_measurements")
      .select("user_id, metric, value, measured_on")
      .eq("team_id", team.id),
    supabase
      .from("stats_events")
      .select("id, match_id, quarter, player_id, type, subtype, result, is_extra_man")
      .eq("team_id", team.id),
    supabase
      .from("practice_attendances")
      .select("practice_id, status")
      .eq("team_id", team.id)
      .eq("user_id", userId),
    supabase.from("practices").select("id, practice_date").eq("team_id", team.id),
    supabase
      .from("clip_comments")
      .select("id, clip_id, parent_comment_id, user_id, mention_user_ids, comment, created_at, users(name)")
      .eq("team_id", team.id)
      .order("created_at", { ascending: false }),
    supabase.from("video_clips").select("id, title, match_id").eq("team_id", team.id),
    supabase
      .from("condition_logs")
      .select("log_date, condition, motivation, sleep_hours, pain_level, pain_note")
      .eq("team_id", team.id)
      .eq("user_id", userId)
      .order("log_date", { ascending: false })
      .limit(7),
    supabase
      .from("peer_feedbacks")
      .select("id, practice_id, from_user_id, good, advice, created_at")
      .eq("team_id", team.id)
      .eq("to_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const myPositionData = myMembershipData as {
    field_position: number | null;
    secondary_field_position: number | null;
  } | null;
  const fieldPosition = myPositionData?.field_position ?? null;
  const secondaryFieldPosition = myPositionData?.secondary_field_position ?? null;
  const positionText = positionLabel(membership.is_gk, fieldPosition, secondaryFieldPosition);
  const roles = [membership.role, membership.secondary_role]
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ROLE_LABELS[r]);

  // ---------- フィジカル・プレー評価(要約のみ。詳細は/physicalへ) ----------
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
  const rows: PhysicalMeasurementRow[] = ((rowsData ?? []) as PhysicalMeasurementRow[]).map(
    (r) => ({ ...r, value: Number(r.value) })
  );
  const myPhysical = buildPhysicalProfiles(rows, roster).find((p) => p.user_id === userId);

  const statsRoster: RosterEntry[] = roster.map((r) => ({
    user_id: r.user_id,
    name: r.name,
    cap_number: r.cap_number,
    is_gk: r.is_gk,
  }));
  const events = (eventsData ?? []) as StatsEvent[];
  const myPerformance = membership.is_gk
    ? null
    : buildPerformanceProfiles(events, statsRoster).find((p) => p.user_id === userId);
  const myGk = membership.is_gk
    ? buildGkPerformance(events, statsRoster).find((c) => c.user_id === userId)
    : null;

  // ---------- 出席率 ----------
  const attendances = (attendanceData ?? []) as {
    practice_id: string;
    status: AttendanceStatus;
  }[];
  const attendanceCounts: Record<AttendanceStatus, number> = {
    present: 0,
    absent: 0,
    late: 0,
    early_leave: 0,
    excused: 0,
  };
  for (const a of attendances) attendanceCounts[a.status] += 1;
  const totalPractices = attendances.length;
  const attendedCount =
    attendanceCounts.present + attendanceCounts.late + attendanceCounts.early_leave;
  const attendanceRate =
    totalPractices > 0 ? Math.round((attendedCount / totalPractices) * 100) : null;

  const practiceDateById = new Map(
    ((practicesData ?? []) as { id: string; practice_date: string }[]).map((p) => [
      p.id,
      p.practice_date,
    ])
  );
  const monthlyAttendance = monthlyAttendanceSummary(
    attendances
      .map((a) => ({
        status: a.status,
        practice_date: practiceDateById.get(a.practice_id),
      }))
      .filter((a): a is { status: AttendanceStatus; practice_date: string } =>
        Boolean(a.practice_date)
      )
  ).slice(0, 6);

  // ---------- ポイント・レベル・バッジ ----------
  const myPoints = await fetchUserPoints(supabase, team.id, userId);
  const pointTotal = myPoints.breakdown.total;
  const pointProgress = nextLevelProgress(pointTotal);
  const myBadges = earnedBadges(myPoints.inputs, pointTotal);

  // ---------- コンディション(今日の記録+直近の推移) ----------
  const conditionLogs = ((conditionData ?? []) as ConditionLog[]).map((l) => ({
    ...l,
    sleep_hours: l.sleep_hours == null ? null : Number(l.sleep_hours),
  }));
  const todayCondition = conditionLogs.find((l) => l.log_date === today) ?? null;

  // ---------- もらったFB(練習後ピアフィードバック) ----------
  const receivedFbs = (receivedFbData ?? []) as Pick<
    PeerFeedback,
    "id" | "practice_id" | "from_user_id" | "good" | "advice" | "created_at"
  >[];
  const memberNameById = new Map(roster.map((r) => [r.user_id, r.name]));

  // ---------- 最近もらったコメント ----------
  const comments = (commentsData ?? []) as unknown as (ClipComment & {
    users: Pick<Profile, "name"> | null;
  })[];
  const receivedIds = new Set(
    receivedCommentIds(comments as unknown as CommentForUnread[], userId)
  );
  const clipTitleById = new Map(
    ((clipsData ?? []) as { id: string; title: string; match_id: string }[]).map((c) => [
      c.id,
      c.title,
    ])
  );
  const recentReceived = comments.filter((c) => receivedIds.has(c.id)).slice(0, 5);

  return (
    <>
      <h1 className="text-lg font-bold">マイページ</h1>

      <Card className="flex items-center justify-between">
        <div>
          <p className="font-bold">{profile.name}</p>
          <p className="text-xs text-slate-500">
            {roles.join(" 兼 ")}
            {membership.cap_number ? ` / #${membership.cap_number}` : ""}
            {` / ${positionText}`}
          </p>
        </div>
        <Link href="/profile" className="shrink-0 text-xs text-brand-600 underline">
          プロフィール編集 →
        </Link>
      </Card>

      {ok === "1" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          ✓ 記録しました
        </div>
      )}

      {/* ポイント・レベル */}
      <Card className="space-y-3">
        <div className="flex items-center gap-3">
          <PointAvatar name={profile.name} total={pointTotal} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <LevelChip total={pointTotal} />
              <Link href="/points" className="text-xs text-brand-600 underline">
                詳しく →
              </Link>
            </div>
            <div className="text-2xl font-bold tabular-nums text-brand-700">
              {pointTotal}
              <span className="ml-1 text-sm font-normal text-slate-400">pt</span>
            </div>
          </div>
        </div>
        {pointProgress.next && (
          <div>
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>次: Lv.{pointProgress.next.label}</span>
              <span>あと {pointProgress.remaining}pt</span>
            </div>
            <div className="h-2 rounded bg-slate-100">
              <div
                className="h-2 rounded bg-brand-500"
                style={{ width: `${Math.round(pointProgress.ratio * 100)}%` }}
              />
            </div>
          </div>
        )}
        {myBadges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {myBadges.map((b) => (
              <span
                key={b.key}
                title={b.desc}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
              >
                {b.icon} {b.label}
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* 今日のコンディション */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-600">
            🩺 今日のコンディション
          </h2>
          <Link
            href={`/condition/${userId}`}
            className="shrink-0 text-xs text-brand-600 underline"
          >
            個人カルテ →
          </Link>
        </div>
        <details open={!todayCondition}>
          <summary className="cursor-pointer text-xs text-slate-500">
            {todayCondition ? (
              <>
                記録済み:{" "}
                <span className="font-semibold text-emerald-600">
                  {CONDITION_LABELS[todayCondition.condition]}
                </span>
                {todayCondition.sleep_hours != null &&
                  ` / 睡眠${todayCondition.sleep_hours}h`}
                (タップで修正)
              </>
            ) : (
              "今日はまだ未記録です(タップして記録)"
            )}
          </summary>
          <div className="pt-3">
            <ConditionForm logDate={today} redirectTo="/me" existing={todayCondition} />
          </div>
        </details>
      </Card>

      {/* フィジカル・プレー評価はマネージャー(非競技者)には表示しない */}
      {!isManager(membership) && (
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-600">フィジカル・プレー評価</h2>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-brand-50 p-3 text-center">
              <div className="text-2xl font-bold text-brand-700">
                {myPhysical?.overallPhysicalScore ?? "-"}
              </div>
              <div className="text-xs text-slate-500">総合フィジカルスコア</div>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3 text-center">
              {myGk ? (
                <>
                  <div className="text-2xl font-bold text-emerald-700">
                    {myGk.saveRate == null ? "-" : `${Math.round(myGk.saveRate * 100)}%`}
                  </div>
                  <div className="text-xs text-slate-500">セーブ率(GK)</div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold text-emerald-700">
                    {myPerformance?.overallPerformance ?? "-"}
                  </div>
                  <div className="text-xs text-slate-500">総合プレースコア</div>
                </>
              )}
            </div>
          </div>
          <LinkButton href={`/physical/${userId}`} className="w-full">
            軸別のレーダーを詳しく見る →
          </LinkButton>
        </Card>
      )}

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">練習出席率</h2>
        {totalPractices === 0 ? (
          <p className="text-sm text-slate-400">まだ練習記録がありません</p>
        ) : (
          <>
            <p className="text-3xl font-bold tabular-nums text-brand-700">
              {attendanceRate}
              <span className="ml-1 text-base font-normal text-slate-400">%</span>
            </p>
            <div className="flex gap-3 text-xs text-slate-500">
              <span>出席 {attendanceCounts.present}</span>
              <span>遅刻 {attendanceCounts.late}</span>
              <span>早退 {attendanceCounts.early_leave}</span>
              <span>欠席 {attendanceCounts.absent}</span>
              <span>見学 {attendanceCounts.excused}</span>
            </div>
            {monthlyAttendance.length > 0 && (
              <div className="space-y-1 border-t border-slate-100 pt-2">
                <p className="text-xs font-semibold text-slate-500">月別</p>
                {monthlyAttendance.map((m) => (
                  <div key={m.month} className="flex items-center gap-2 text-xs">
                    <span className="w-16 shrink-0 text-slate-500">{m.month}</span>
                    <span className="h-2.5 flex-1 rounded bg-slate-100">
                      <span
                        className="block h-2.5 rounded bg-brand-500"
                        style={{ width: `${Math.max(4, m.rate ?? 0)}%` }}
                      />
                    </span>
                    <span className="w-20 shrink-0 text-right tabular-nums text-slate-600">
                      {m.rate}% ({m.present}/{m.total})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <Link href="/practices" className="text-xs text-brand-600 underline">
          練習記録一覧へ →
        </Link>
      </Card>

      {/* もらったFB(練習後ピアフィードバック) */}
      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">🤝 もらったFB</h2>
        {receivedFbs.length === 0 ? (
          <p className="text-sm text-slate-400">
            練習後のひとことFBがここに届きます
          </p>
        ) : (
          <ul className="space-y-2">
            {receivedFbs.map((f) => (
              <li key={f.id} className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[11px] text-slate-500">
                  {memberNameById.get(f.from_user_id) ?? "不明"} ・{" "}
                  {f.created_at.slice(0, 10)}
                </p>
                <p className="text-sm text-slate-700">👍 {f.good}</p>
                {f.advice && <p className="text-sm text-slate-600">💬 {f.advice}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">最近もらったコメント</h2>
        {recentReceived.length === 0 ? (
          <p className="text-sm text-slate-400">
            まだメンションや返信がありません
          </p>
        ) : (
          <ul className="space-y-2">
            {recentReceived.map((c) => (
              <li key={c.id}>
                <Link href={`/clips/${c.clip_id}`} className="block">
                  <p className="text-xs text-slate-400">
                    {clipTitleById.get(c.clip_id) ?? "クリップ"} ・{" "}
                    {c.users?.name ?? "不明"}
                  </p>
                  <p className="truncate text-sm text-slate-700">{c.comment}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
