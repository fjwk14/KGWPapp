import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Button,
  Card,
  ErrorBanner,
  Input,
  Label,
  Select,
} from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can, ROLE_LABELS } from "@/lib/permissions";
import type { Membership, Profile, Role } from "@/lib/types";
import { FIELD_POSITIONS } from "@/lib/constants";
import { addMember, bulkUpdateMembers } from "./actions";
import InviteCodeCard from "./invite-code-card";

const STATUS_LABELS: Record<string, string> = {
  active: "在籍",
  inactive: "休部",
  graduated: "卒業",
  removed: "削除",
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const { team, membership } = await requireMembership();
  if (!can.manageTeam(membership.role)) redirect("/dashboard");

  const supabase = await createClient();
  const { data: membersData } = await supabase
    .from("memberships")
    .select("*, users(id, name, email)")
    .eq("team_id", team.id)
    .order("created_at");
  const members = (membersData ?? []) as (Membership & {
    users: Pick<Profile, "id" | "name" | "email"> | null;
  })[];
  const ROLE_OPTIONS = Object.entries(ROLE_LABELS) as [Role, string][];

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold">チーム設定</h1>
        <div className="flex flex-col items-end gap-0.5">
          <Link href="/admin/tags" className="text-sm text-brand-600 underline">
            タグテンプレート管理 →
          </Link>
          <Link href="/engagement" className="text-sm text-brand-600 underline">
            メンバーの視聴状況 →
          </Link>
        </div>
      </div>
      <ErrorBanner message={error} />
      {ok === "1" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          更新しました
        </div>
      )}

      <InviteCodeCard code={team.invite_code} />

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-600">
          メンバーを個別に追加(メール)
        </h2>
        <p className="text-xs text-slate-400">
          招待コードを使わない場合はこちら。追加したい部員に先にサインアップしてもらい、
          そのメールアドレスを入力してください。
        </p>
        <form action={addMember} className="space-y-2">
          <Input
            name="email"
            type="email"
            required
            placeholder="member@example.com"
            className="text-sm"
          />
          <div className="flex gap-2">
            <Select name="role" className="flex-1 text-sm" defaultValue="player">
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Button type="submit" className="shrink-0">
              追加
            </Button>
          </div>
        </form>
      </Card>

      <form action={bulkUpdateMembers} className="space-y-2">
        <input
          type="hidden"
          name="member_ids"
          value={members.map((m) => m.id).join(",")}
        />
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-600">
            メンバー({members.length}人)
          </h2>
          {members.map((m) => (
            <div key={m.id}>
              <Card className="space-y-2">
                <div>
                  <span className="font-semibold">{m.users?.name ?? "不明"}</span>
                  <span className="ml-2 text-xs text-slate-400">{m.users?.email}</span>
                </div>
                <div className="flex gap-2">
                  <Select
                    name={`role_${m.id}`}
                    defaultValue={m.role satisfies Role}
                    className="flex-1 text-sm"
                  >
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  <Select
                    name={`status_${m.id}`}
                    defaultValue={m.status}
                    className="flex-1 text-sm"
                  >
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
                {/* 役職の併用は管理者のみ(例: 管理者 兼 主将)。primary=admin のときだけ有効 */}
                <div>
                  <label className="text-xs text-slate-400">
                    併用役職(管理者のみ・任意)
                  </label>
                  <Select
                    name={`secondary_role_${m.id}`}
                    defaultValue={m.secondary_role ?? ""}
                    className="w-full text-sm"
                  >
                    <option value="">なし</option>
                    {ROLE_OPTIONS.filter(([value]) => value !== "admin").map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      )
                    )}
                  </Select>
                </div>
                {/* 既定の帽子番号・ポジション(試合記録の初期値になる) */}
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-slate-400">帽子番号</label>
                    <Input
                      name={`cap_number_${m.id}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={2}
                      defaultValue={m.cap_number ?? ""}
                      placeholder="未設定"
                      className="text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-slate-400">ポジション</label>
                    <Select
                      name={`position_${m.id}`}
                      defaultValue={
                        m.is_gk ? "gk" : m.field_position ? String(m.field_position) : ""
                      }
                      className="w-full text-sm"
                    >
                      <option value="">未設定</option>
                      {FIELD_POSITIONS.map((p) => (
                        <option key={p.value} value={String(p.value)}>
                          {p.label}
                        </option>
                      ))}
                      <option value="gk">GK</option>
                    </Select>
                  </div>
                </div>
              </Card>
            </div>
          ))}
        </section>
        <div className="sticky bottom-16 z-20 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <Button type="submit" className="w-full">
            一括更新
          </Button>
        </div>
      </form>
    </>
  );
}
