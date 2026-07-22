import Link from "next/link";
import { Button, Card, ErrorBanner, Input, Label, Select, Textarea } from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import {
  ATTENDANCE_LABELS,
  SELF_PRACTICE_CATEGORY_LABELS,
  TIME_OPTIONS_30MIN,
} from "@/lib/constants";
import type {
  AttendanceStatus,
  Practice,
  PracticeAttendance,
  Profile,
  SelfPractice,
} from "@/lib/types";
import { createPractice, deleteSelfPractice, logSelfPractice } from "./actions";

// 練習記録の一覧 + 新規記録。マネージャー以上が「当日その場で記録」または
// 「先に予定として作成」でき、後者は部員が各自出欠を事前申告する。
export default async function PracticesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { team, userId, membership } = await requireMembership();
  const supabase = await createClient();

  const [{ data: practicesData }, { data: attData }, { data: selfData }] =
    await Promise.all([
      supabase
        .from("practices")
        .select("id, practice_date, start_time, end_time, location, menu, status")
        .eq("team_id", team.id)
        .order("practice_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("practice_attendances")
        .select("practice_id, user_id, status")
        .eq("team_id", team.id),
      supabase
        .from("self_practices")
        .select("id, user_id, practice_date, category, menu, location, created_at, users(name)")
        .eq("team_id", team.id)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

  const practices = (practicesData ?? []) as Pick<
    Practice,
    "id" | "practice_date" | "start_time" | "end_time" | "location" | "menu" | "status"
  >[];
  const attendances = (attData ?? []) as (Pick<
    PracticeAttendance,
    "practice_id" | "status"
  > & { user_id: string })[];

  // 練習ごとの出欠サマリ(出席/欠席の人数)+ 自分の回答状況
  const summaryByPractice = new Map<string, { present: number; absent: number }>();
  const myStatusByPractice = new Map<string, AttendanceStatus>();
  for (const a of attendances) {
    const s = summaryByPractice.get(a.practice_id) ?? { present: 0, absent: 0 };
    if (a.status === "present" || a.status === "late" || a.status === "early_leave") {
      s.present += 1;
    }
    if (a.status === "absent") s.absent += 1;
    summaryByPractice.set(a.practice_id, s);
    if (a.user_id === userId) myStatusByPractice.set(a.practice_id, a.status);
  }

  const canRecord = can.recordPractice(membership);
  const today = new Date().toISOString().slice(0, 10);

  const selfPractices = (
    (selfData ?? []) as unknown as (Pick<
      SelfPractice,
      "id" | "user_id" | "practice_date" | "category" | "menu" | "location" | "created_at"
    > & { users: Pick<Profile, "name"> | null })[]
  ).map((s) => ({ ...s, name: s.users?.name ?? "不明" }));

  const scheduled = practices
    .filter((p) => p.status === "scheduled")
    .sort((a, b) => a.practice_date.localeCompare(b.practice_date));
  const done = practices.filter((p) => p.status === "done");

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">🤽‍♂️ 練習記録・出欠</h1>
        {can.viewTeamCondition(membership) && (
          <Link href="/condition" className="shrink-0 text-sm text-brand-600 underline">
            🩺 コンディション →
          </Link>
        )}
      </div>
      <ErrorBanner message={error} />

      {/* 自主練の記録(誰でも使える。チーム内公開でモチベーションにする) */}
      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-600">💪 自主練を記録</h2>
        <p className="text-xs text-slate-400">
          水中練習・ウエイトなど、個人でやった練習を記録できます。記録するとポイントが貯まります。
        </p>
        <form action={logSelfPractice} className="space-y-2">
          <div className="flex gap-2">
            <div className="w-32 shrink-0">
              <Label htmlFor="self_practice_date" className="sr-only">
                日付
              </Label>
              <Input
                type="date"
                name="practice_date"
                id="self_practice_date"
                defaultValue={today}
                className="appearance-none text-sm"
              />
            </div>
            <div className="w-24 shrink-0">
              <Label htmlFor="self_practice_category" className="sr-only">
                種別
              </Label>
              <Select name="category" id="self_practice_category" defaultValue="swim" className="text-sm">
                {Object.entries(SELF_PRACTICE_CATEGORY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-0 flex-1">
              <Label htmlFor="self_practice_location" className="sr-only">
                場所(任意)
              </Label>
              <Input
                type="text"
                name="location"
                id="self_practice_location"
                placeholder="場所(任意・例: 市民プール)"
                className="text-sm"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="self_practice_menu" className="sr-only">
              メニュー(任意)
            </Label>
            <Textarea
              name="menu"
              id="self_practice_menu"
              rows={3}
              placeholder={"メニュー(任意・複数行OK)\n例: スクワット3セット\nベンチプレス3セット"}
              className="text-sm"
            />
          </div>
          <Button type="submit" className="w-full">
            記録する
          </Button>
        </form>
        {selfPractices.length > 0 && (
          <div className="space-y-1.5 border-t border-slate-100 pt-2">
            <p className="text-xs font-semibold text-slate-500">
              みんなの自主練(最近{selfPractices.length}件)
            </p>
            <ul className="max-h-64 space-y-1.5 overflow-y-auto">
              {selfPractices.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate">
                    <span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                      {SELF_PRACTICE_CATEGORY_LABELS[s.category]}
                    </span>
                    <span className="font-semibold text-slate-700">{s.name}</span>
                    <span className="ml-1 text-slate-400">{s.practice_date.slice(5)}</span>
                    {s.location && <span className="ml-1 text-slate-400">@{s.location}</span>}
                    {s.menu && <span className="ml-1 text-slate-500">{s.menu}</span>}
                  </span>
                  {s.user_id === userId && (
                    <form action={deleteSelfPractice} className="shrink-0">
                      <input type="hidden" name="self_practice_id" value={s.id} />
                      <button type="submit" className="text-rose-400 underline">
                        削除
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {canRecord && (
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-600">練習作成</h2>
          <p className="text-xs text-slate-400">
            先に「予定」として作っておくと、部員が各自出欠を申告できます。
            当日その場で記録する場合はそのまま「記録して出欠へ」でOKです。
          </p>
          <form action={createPractice} className="space-y-3">
            <div className="flex gap-2">
              <div className="min-w-0 flex-[3]">
                <Label htmlFor="practice_date">日付</Label>
                <Input
                  type="date"
                  name="practice_date"
                  id="practice_date"
                  defaultValue={today}
                  className="appearance-none text-sm"
                />
              </div>
              <div className="min-w-0 flex-[2]">
                <Label htmlFor="start_time">開始</Label>
                <Select name="start_time" id="start_time" defaultValue="" className="text-sm">
                  <option value="">未定</option>
                  {TIME_OPTIONS_30MIN.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-0 flex-[2]">
                <Label htmlFor="end_time">終了</Label>
                <Select name="end_time" id="end_time" defaultValue="" className="text-sm">
                  <option value="">未定</option>
                  {TIME_OPTIONS_30MIN.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="location">場所(任意)</Label>
              <Input
                type="text"
                name="location"
                id="location"
                placeholder="市民プール など"
                className="text-sm"
              />
            </div>
            <div>
              <Label htmlFor="menu">メニュー(任意・複数行OK)</Label>
              <Textarea
                name="menu"
                id="menu"
                rows={4}
                placeholder={"kick swim ×4\n2往復 ×4\n片道 ×6\nゲーム 8分止め ×4"}
                className="text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                name="is_schedule"
                value="1"
                variant="secondary"
                className="flex-1"
              >
                📅 予定として作成(各自申告)
              </Button>
              <Button type="submit" name="is_schedule" value="" className="flex-1">
                記録して出欠へ
              </Button>
            </div>
          </form>
        </Card>
      )}

      {scheduled.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-600">今後の予定</h2>
          {scheduled.map((p) => {
            const my = myStatusByPractice.get(p.id);
            return (
              <Link key={p.id} href={`/practices/${p.id}`} className="block">
                <Card className="flex items-center justify-between gap-2 border-brand-200 bg-brand-50/40">
                  <div className="min-w-0">
                    <div className="font-semibold">{p.practice_date}</div>
                    <div className="truncate text-xs text-slate-500">
                      {[p.start_time, p.end_time].filter(Boolean).join("〜") || "時間未設定"}
                      {p.location ? ` / ${p.location}` : ""}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      my
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {my ? `回答済 ${ATTENDANCE_LABELS[my]}` : "未回答 →"}
                  </span>
                </Card>
              </Link>
            );
          })}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">これまでの練習</h2>
        {done.length === 0 ? (
          <Card className="text-sm text-slate-500">
            まだ練習記録がありません。
            {canRecord ? "上のフォームから記録を始めましょう。" : ""}
          </Card>
        ) : (
          done.map((p) => {
            const s = summaryByPractice.get(p.id);
            return (
              <Link key={p.id} href={`/practices/${p.id}`} className="block">
                <Card className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold">{p.practice_date}</div>
                    <div className="truncate text-xs text-slate-500">
                      {[p.start_time, p.end_time].filter(Boolean).join("〜") || "時間未設定"}
                      {p.location ? ` / ${p.location}` : ""}
                    </div>
                  </div>
                  {s && (
                    <div className="shrink-0 text-right text-xs">
                      <span className="font-semibold text-emerald-600">
                        {ATTENDANCE_LABELS.present} {s.present}
                      </span>
                      <span className="mx-1 text-slate-300">/</span>
                      <span className="font-semibold text-rose-600">
                        {ATTENDANCE_LABELS.absent} {s.absent}
                      </span>
                    </div>
                  )}
                </Card>
              </Link>
            );
          })
        )}
      </section>
    </>
  );
}
