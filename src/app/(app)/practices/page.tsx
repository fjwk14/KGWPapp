import Link from "next/link";
import { Button, Card, ErrorBanner, Input, Label, Textarea } from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { ATTENDANCE_LABELS } from "@/lib/constants";
import type { Practice, PracticeAttendance } from "@/lib/types";
import { createPractice } from "./actions";

// 練習記録の一覧 + 新規記録。マネージャー以上が当日の練習を残せる。
export default async function PracticesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { team, membership } = await requireMembership();
  const supabase = await createClient();

  const [{ data: practicesData }, { data: attData }] = await Promise.all([
    supabase
      .from("practices")
      .select("id, practice_date, start_time, end_time, location, menu")
      .eq("team_id", team.id)
      .order("practice_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("practice_attendances")
      .select("practice_id, status")
      .eq("team_id", team.id),
  ]);

  const practices = (practicesData ?? []) as Pick<
    Practice,
    "id" | "practice_date" | "start_time" | "end_time" | "location" | "menu"
  >[];
  const attendances = (attData ?? []) as Pick<
    PracticeAttendance,
    "practice_id" | "status"
  >[];

  // 練習ごとの出欠サマリ(出席/欠席の人数)
  const summaryByPractice = new Map<string, { present: number; absent: number }>();
  for (const a of attendances) {
    const s = summaryByPractice.get(a.practice_id) ?? { present: 0, absent: 0 };
    if (a.status === "present" || a.status === "late") s.present += 1;
    if (a.status === "absent") s.absent += 1;
    summaryByPractice.set(a.practice_id, s);
  }

  const canRecord = can.recordPractice(membership);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">🏊 練習記録・出欠</h1>
      </div>
      <ErrorBanner message={error} />

      {canRecord && (
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-600">新しい練習を記録</h2>
          <form action={createPractice} className="space-y-3">
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Label htmlFor="practice_date">日付</Label>
                <Input
                  type="date"
                  name="practice_date"
                  id="practice_date"
                  defaultValue={today}
                  className="appearance-none text-sm"
                />
              </div>
              <div className="w-24 shrink-0">
                <Label htmlFor="start_time">開始</Label>
                <Input
                  type="text"
                  name="start_time"
                  id="start_time"
                  inputMode="numeric"
                  placeholder="19:00"
                  className="text-sm"
                />
              </div>
              <div className="w-24 shrink-0">
                <Label htmlFor="end_time">終了</Label>
                <Input
                  type="text"
                  name="end_time"
                  id="end_time"
                  inputMode="numeric"
                  placeholder="21:00"
                  className="text-sm"
                />
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
            <Button type="submit" className="w-full">
              記録して出欠へ
            </Button>
          </form>
        </Card>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">これまでの練習</h2>
        {practices.length === 0 ? (
          <Card className="text-sm text-slate-500">
            まだ練習記録がありません。
            {canRecord ? "上のフォームから記録を始めましょう。" : ""}
          </Card>
        ) : (
          practices.map((p) => {
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
