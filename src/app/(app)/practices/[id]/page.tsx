import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Button,
  Card,
  ErrorBanner,
  Input,
  Label,
  RoleBadge,
  Select,
  Textarea,
} from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can, isManager } from "@/lib/permissions";
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_STYLES,
  PRACTICE_STATUS_LABELS,
} from "@/lib/constants";
import { feedbackTargetOf } from "@/lib/feedback";
import { todayJST } from "@/lib/condition";
import type {
  ConditionLog,
  PeerFeedback,
  Practice,
  PracticeAttendance,
  Profile,
  Role,
} from "@/lib/types";
import ConditionForm from "../../condition/condition-form";
import {
  markPracticeDone,
  saveAttendance,
  submitMyAttendance,
  submitPeerFeedback,
  updatePractice,
  deletePractice,
} from "../actions";

const STATUS_ORDER = ["present", "absent", "late", "early_leave", "excused"] as const;

export default async function PracticeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { error, ok } = await searchParams;
  const { team, userId, membership } = await requireMembership();
  const supabase = await createClient();

  const today = todayJST();
  const [
    { data: practiceData },
    { data: membersData },
    { data: attData },
    { data: fbData },
    { data: myConditionData },
  ] = await Promise.all([
    supabase
      .from("practices")
      .select(
        "id, practice_date, start_time, end_time, location, menu, note, status"
      )
      .eq("id", id)
      .eq("team_id", team.id)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("user_id, cap_number, role, secondary_role, users(name)")
      .eq("team_id", team.id)
      .eq("status", "active")
      .order("cap_number"),
    supabase
      .from("practice_attendances")
      .select("user_id, status, reason")
      .eq("practice_id", id),
    supabase
      .from("peer_feedbacks")
      .select("id, from_user_id, to_user_id, good, advice, created_at")
      .eq("practice_id", id)
      .order("created_at"),
    supabase
      .from("condition_logs")
      .select("log_date, condition, motivation, sleep_hours, pain_level, pain_note")
      .eq("team_id", team.id)
      .eq("user_id", userId)
      .eq("log_date", today)
      .maybeSingle(),
  ]);

  if (!practiceData) notFound();
  const practice = practiceData as Pick<
    Practice,
    | "id"
    | "practice_date"
    | "start_time"
    | "end_time"
    | "location"
    | "menu"
    | "note"
    | "status"
  >;
  const isScheduled = practice.status === "scheduled";

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

  const attRows = (attData ?? []) as Pick<
    PracticeAttendance,
    "user_id" | "status" | "reason"
  >[];
  const statusByUser = new Map(attRows.map((a) => [a.user_id, a.status]));
  const reasonByUser = new Map(attRows.map((a) => [a.user_id, a.reason]));

  const canRecord = can.recordPractice(membership);

  // ---------- 練習後ピアFB(実施済みの練習のみ) ----------
  // 参加者(出席・遅刻)でランダムな円環ペアを作る。practice_idシードの
  // 決定的シャッフルなので、誰がいつ開いても同じ相手になる。
  const feedbacks = (fbData ?? []) as Pick<
    PeerFeedback,
    "id" | "from_user_id" | "to_user_id" | "good" | "advice" | "created_at"
  >[];
  const participantIds = members
    .filter((m) => {
      const st = statusByUser.get(m.user_id);
      return st === "present" || st === "late" || st === "early_leave";
    })
    .map((m) => m.user_id);
  const myFbTarget =
    practice.status === "done"
      ? feedbackTargetOf(practice.id, participantIds, userId)
      : null;
  const myFb = feedbacks.find((f) => f.from_user_id === userId) ?? null;
  const nameById = new Map(members.map((m) => [m.user_id, m]));
  const displayName = (uid: string) => {
    const m = nameById.get(uid);
    return m ? `${m.cap_number ? `#${m.cap_number} ` : ""}${m.name}` : "不明";
  };

  // ---------- 今日のコンディション(この練習が今日の場合のみ) ----------
  const showCondition = practice.practice_date === today;
  const rawCondition = (myConditionData ?? null) as ConditionLog | null;
  const myCondition = rawCondition
    ? {
        ...rawCondition,
        sleep_hours:
          rawCondition.sleep_hours == null ? null : Number(rawCondition.sleep_hours),
      }
    : null;

  // 出欠サマリ。未回答は「出席」扱いにせず、別枠でカウントする
  // (予定はまだ全員が回答しているとは限らない)。
  const counts: Record<string, number> = {
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
  };
  let unansweredCount = 0;
  for (const m of members) {
    const st = statusByUser.get(m.user_id);
    if (st) counts[st] = (counts[st] ?? 0) + 1;
    else unansweredCount += 1;
  }

  return (
    <>
      <Link href="/practices" className="text-xs text-brand-600 underline">
        ← 練習記録
      </Link>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold">{practice.practice_date} の練習</h1>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
            isScheduled
              ? "bg-amber-100 text-amber-700"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {PRACTICE_STATUS_LABELS[practice.status]}
        </span>
      </div>
      <ErrorBanner message={error} />
      {ok === "1" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          保存しました
        </div>
      )}

      {/* 練習情報 */}
      {canRecord ? (
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-600">練習内容</h2>
          <form action={updatePractice} className="space-y-3">
            <input type="hidden" name="practice_id" value={practice.id} />
            <div className="flex gap-2">
              <div className="min-w-0 flex-[3]">
                <Label htmlFor="practice_date">日付</Label>
                <Input
                  type="date"
                  name="practice_date"
                  id="practice_date"
                  defaultValue={practice.practice_date}
                  className="appearance-none text-sm"
                />
              </div>
              <div className="min-w-0 flex-[2]">
                <Label htmlFor="start_time">開始</Label>
                <Input
                  type="time"
                  name="start_time"
                  id="start_time"
                  step={1800}
                  defaultValue={practice.start_time ?? ""}
                  className="appearance-none text-sm"
                />
              </div>
              <div className="min-w-0 flex-[2]">
                <Label htmlFor="end_time">終了</Label>
                <Input
                  type="time"
                  name="end_time"
                  id="end_time"
                  step={1800}
                  defaultValue={practice.end_time ?? ""}
                  className="appearance-none text-sm"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="location">場所(任意)</Label>
              <Input
                type="text"
                name="location"
                id="location"
                defaultValue={practice.location ?? ""}
                className="text-sm"
              />
            </div>
            <div>
              <Label htmlFor="menu">メニュー</Label>
              <Textarea
                name="menu"
                id="menu"
                rows={5}
                defaultValue={practice.menu ?? ""}
                className="text-sm"
              />
            </div>
            <div>
              <Label htmlFor="note">メモ(任意)</Label>
              <Textarea
                name="note"
                id="note"
                rows={2}
                defaultValue={practice.note ?? ""}
                className="text-sm"
              />
            </div>
            <Button type="submit" className="w-full">
              練習内容を更新
            </Button>
          </form>
        </Card>
      ) : (
        <Card className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-600">練習内容</h2>
          <p className="text-xs text-slate-500">
            {[practice.start_time, practice.end_time].filter(Boolean).join("〜") ||
              "時間未設定"}
            {practice.location ? ` / ${practice.location}` : ""}
          </p>
          {practice.menu && (
            <p className="whitespace-pre-wrap text-sm text-slate-700">
              {practice.menu}
            </p>
          )}
          {practice.note && (
            <p className="whitespace-pre-wrap border-t border-slate-100 pt-2 text-sm text-slate-500">
              {practice.note}
            </p>
          )}
        </Card>
      )}

      {/* 自分の出欠を申告(全員が使える。予定でも実施済みでも回答・修正できる) */}
      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">あなたの出欠</h2>
        <form action={submitMyAttendance} className="space-y-2">
          <input type="hidden" name="practice_id" value={practice.id} />
          <div className="grid grid-cols-5 gap-1.5">
            {STATUS_ORDER.map((st) => (
              <Button
                key={st}
                type="submit"
                name="status"
                value={st}
                variant={statusByUser.get(userId) === st ? "primary" : "secondary"}
                className="min-h-11 px-0.5 text-[11px]"
              >
                {ATTENDANCE_LABELS[st]}
              </Button>
            ))}
          </div>
          <div>
            <Label htmlFor="attendance_reason" className="text-xs text-slate-400">
              理由(任意・出席以外を選ぶ場合はチーム内に公開されます)
            </Label>
            <Input
              type="text"
              name="reason"
              id="attendance_reason"
              defaultValue={reasonByUser.get(userId) ?? ""}
              placeholder="例: 発熱のため欠席します"
              maxLength={300}
              className="text-sm"
            />
          </div>
        </form>
      </Card>

      {/* 今日のコンディション(練習日が今日のときだけ、出欠のついでに記録) */}
      {showCondition && (
        <Card className="space-y-3">
          <details open={!myCondition}>
            <summary className="cursor-pointer text-sm font-semibold text-slate-600">
              🩺 今日のコンディション
              {myCondition ? (
                <span className="ml-2 text-xs font-normal text-emerald-600">記録済み(タップで修正)</span>
              ) : (
                <span className="ml-2 text-xs font-normal text-amber-600">未記録</span>
              )}
            </summary>
            <div className="pt-3">
              <ConditionForm
                logDate={today}
                redirectTo={`/practices/${practice.id}`}
                existing={myCondition}
              />
            </div>
          </details>
        </Card>
      )}

      {/* 練習後ピアFB(実施済みの練習のみ・チーム内公開) */}
      {practice.status === "done" && participantIds.length >= 2 && (
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-600">
            🤝 今日のひとことFB
          </h2>
          {myFbTarget ? (
            <>
              <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">
                あなたのFB相手:{" "}
                <span className="font-bold">{displayName(myFbTarget)}</span>
                <span className="mt-0.5 block text-xs text-brand-700">
                  練習ごとにランダムで決まります。良かったプレーをひとこと伝えましょう。
                </span>
              </p>
              <form action={submitPeerFeedback} className="space-y-2">
                <input type="hidden" name="practice_id" value={practice.id} />
                <input type="hidden" name="to_user_id" value={myFb?.to_user_id ?? myFbTarget} />
                <div>
                  <Label htmlFor="fb_good">良かったところ(必須)</Label>
                  <Textarea
                    name="good"
                    id="fb_good"
                    rows={2}
                    required
                    maxLength={500}
                    defaultValue={myFb?.good ?? ""}
                    placeholder="例: カウンターの戻りが速くて助かった"
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="fb_advice">アドバイス・応援(任意)</Label>
                  <Textarea
                    name="advice"
                    id="fb_advice"
                    rows={2}
                    maxLength={500}
                    defaultValue={myFb?.advice ?? ""}
                    placeholder="例: シュートのときもう半身浮くともっと強い"
                    className="text-sm"
                  />
                </div>
                <Button type="submit" className="w-full">
                  {myFb ? "FBを書き直す" : "FBを送る"}
                </Button>
              </form>
            </>
          ) : (
            <p className="text-xs text-slate-400">
              この練習の参加者(出席・遅刻)にFB相手が割り当てられます。
            </p>
          )}
          {feedbacks.length > 0 && (
            <div className="space-y-2 border-t border-slate-100 pt-2">
              <p className="text-xs font-semibold text-slate-500">
                みんなのFB({feedbacks.length}件・チーム内公開)
              </p>
              {feedbacks.map((f) => (
                <div key={f.id} className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500">
                    {displayName(f.from_user_id)} →{" "}
                    <span className="font-semibold">{displayName(f.to_user_id)}</span>
                  </p>
                  <p className="text-sm text-slate-700">👍 {f.good}</p>
                  {f.advice && (
                    <p className="text-sm text-slate-600">💬 {f.advice}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* 出欠サマリ(項目が増えたため3列で折り返す) */}
      <div className="grid grid-cols-3 gap-2">
        {STATUS_ORDER.map((st) => (
          <Card key={st} className="p-2 text-center">
            <div className="text-xl font-bold tabular-nums">{counts[st]}</div>
            <div className="text-[11px] text-slate-500">{ATTENDANCE_LABELS[st]}</div>
          </Card>
        ))}
        {unansweredCount > 0 && (
          <Card className="p-2 text-center">
            <div className="text-xl font-bold tabular-nums text-slate-400">
              {unansweredCount}
            </div>
            <div className="text-[11px] text-slate-500">未回答</div>
          </Card>
        )}
      </div>

      {/* 出欠(マネージャーは編集、それ以外は閲覧) */}
      {canRecord ? (
        <form action={saveAttendance} className="space-y-2">
          <input type="hidden" name="practice_id" value={practice.id} />
          <input
            type="hidden"
            name="member_ids"
            value={members.map((m) => m.user_id).join(",")}
          />
          <h2 className="text-sm font-semibold text-slate-600">
            出欠({members.length}人)
          </h2>
          <p className="text-xs text-slate-400">
            初期値は全員「出席」です。欠席・遅刻・見学の人だけ切り替えて保存してください。
          </p>
          {members.map((m) => {
            const cur = statusByUser.get(m.user_id) ?? "present";
            const reason = reasonByUser.get(m.user_id);
            return (
              <Card key={m.user_id} className="space-y-1 p-2">
                <div className="flex items-center gap-2">
                  <RoleBadge manager={m.manager} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {m.cap_number ? `#${m.cap_number} ` : ""}
                    {m.name}
                  </span>
                  <div className="w-24 shrink-0">
                    <Select
                      name={`status_${m.user_id}`}
                      defaultValue={cur}
                      className="py-2 text-sm"
                    >
                      {STATUS_ORDER.map((st) => (
                        <option key={st} value={st}>
                          {ATTENDANCE_LABELS[st]}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                {reason && (
                  <p className="pl-1 text-xs text-slate-500">理由: {reason}</p>
                )}
              </Card>
            );
          })}
          <div className="pt-2">
            <Button type="submit" className="w-full">
              出欠を保存
            </Button>
          </div>
        </form>
      ) : (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-600">
            出欠({members.length}人)
          </h2>
          {members.map((m) => {
            const cur = statusByUser.get(m.user_id);
            const reason = reasonByUser.get(m.user_id);
            return (
              <Card key={m.user_id} className="space-y-1 p-2">
                <div className="flex items-center gap-2">
                  <RoleBadge manager={m.manager} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {m.cap_number ? `#${m.cap_number} ` : ""}
                    {m.name}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      cur ? ATTENDANCE_STYLES[cur] : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {cur ? ATTENDANCE_LABELS[cur] : "未回答"}
                  </span>
                </div>
                {reason && (
                  <p className="pl-1 text-xs text-slate-500">理由: {reason}</p>
                )}
              </Card>
            );
          })}
        </section>
      )}

      {canRecord && isScheduled && (
        <form action={markPracticeDone}>
          <input type="hidden" name="practice_id" value={practice.id} />
          <Button type="submit" variant="secondary" className="w-full">
            ✓ この練習を実施済みにする
          </Button>
        </form>
      )}

      {canRecord && (
        <Card className="space-y-2">
          <h2 className="text-sm font-semibold text-rose-600">練習を削除</h2>
          <p className="text-xs text-slate-500">
            この練習記録と出欠をまとめて削除します。元に戻せません。
          </p>
          <form action={deletePractice}>
            <input type="hidden" name="practice_id" value={practice.id} />
            <Button type="submit" variant="danger" className="w-full">
              この練習を削除
            </Button>
          </form>
        </Card>
      )}
    </>
  );
}
