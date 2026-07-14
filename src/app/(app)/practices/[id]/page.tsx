import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Button,
  Card,
  ErrorBanner,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { ATTENDANCE_LABELS, ATTENDANCE_STYLES } from "@/lib/constants";
import type { Practice, PracticeAttendance, Profile } from "@/lib/types";
import { saveAttendance, updatePractice, deletePractice } from "../actions";

const STATUS_ORDER = ["present", "absent", "late", "excused"] as const;

export default async function PracticeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { error, ok } = await searchParams;
  const { team, membership } = await requireMembership();
  const supabase = await createClient();

  const [{ data: practiceData }, { data: membersData }, { data: attData }] =
    await Promise.all([
      supabase
        .from("practices")
        .select(
          "id, practice_date, start_time, end_time, location, menu, note"
        )
        .eq("id", id)
        .eq("team_id", team.id)
        .maybeSingle(),
      supabase
        .from("memberships")
        .select("user_id, cap_number, users(name)")
        .eq("team_id", team.id)
        .eq("status", "active")
        .order("cap_number"),
      supabase
        .from("practice_attendances")
        .select("user_id, status")
        .eq("practice_id", id),
    ]);

  if (!practiceData) notFound();
  const practice = practiceData as Pick<
    Practice,
    "id" | "practice_date" | "start_time" | "end_time" | "location" | "menu" | "note"
  >;

  const members = (
    (membersData ?? []) as unknown as {
      user_id: string;
      cap_number: number | null;
      users: Pick<Profile, "name"> | null;
    }[]
  ).map((m) => ({
    user_id: m.user_id,
    cap_number: m.cap_number,
    name: m.users?.name ?? "不明",
  }));

  const statusByUser = new Map(
    ((attData ?? []) as Pick<PracticeAttendance, "user_id" | "status">[]).map(
      (a) => [a.user_id, a.status]
    )
  );

  const canRecord = can.recordPractice(membership);

  // 出欠サマリ
  const counts: Record<string, number> = {
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
  };
  for (const m of members) {
    const st = statusByUser.get(m.user_id) ?? "present";
    counts[st] = (counts[st] ?? 0) + 1;
  }

  return (
    <>
      <Link href="/practices" className="text-xs text-brand-600 underline">
        ← 練習記録
      </Link>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold">{practice.practice_date} の練習</h1>
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
              <div className="min-w-0 flex-1">
                <Label htmlFor="practice_date">日付</Label>
                <Input
                  type="date"
                  name="practice_date"
                  id="practice_date"
                  defaultValue={practice.practice_date}
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
                  defaultValue={practice.start_time ?? ""}
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
                  defaultValue={practice.end_time ?? ""}
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

      {/* 出欠サマリ */}
      <div className="grid grid-cols-4 gap-2">
        {STATUS_ORDER.map((st) => (
          <Card key={st} className="p-2 text-center">
            <div className="text-xl font-bold tabular-nums">{counts[st]}</div>
            <div className="text-[11px] text-slate-500">{ATTENDANCE_LABELS[st]}</div>
          </Card>
        ))}
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
            return (
              <Card key={m.user_id} className="flex items-center gap-2 p-2">
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
            const cur = statusByUser.get(m.user_id) ?? "present";
            return (
              <Card key={m.user_id} className="flex items-center gap-2 p-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {m.cap_number ? `#${m.cap_number} ` : ""}
                  {m.name}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${ATTENDANCE_STYLES[cur]}`}
                >
                  {ATTENDANCE_LABELS[cur]}
                </span>
              </Card>
            );
          })}
        </section>
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
