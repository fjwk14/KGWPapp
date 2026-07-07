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
import { addMember, updateMember } from "./actions";

const STATUS_LABELS: Record<string, string> = {
  active: "在籍",
  inactive: "休部",
  graduated: "卒業",
  removed: "削除",
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
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

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">チーム管理</h1>
        <Link href="/admin/tags" className="text-sm text-brand-600 underline">
          タグテンプレート管理 →
        </Link>
      </div>
      <ErrorBanner message={error} />

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-600">メンバー追加</h2>
        <p className="text-xs text-slate-400">
          追加したい部員に先にサインアップしてもらい、そのメールアドレスを入力してください。
        </p>
        <form action={addMember} className="flex gap-2">
          <Input
            name="email"
            type="email"
            required
            placeholder="member@example.com"
            className="flex-1 text-sm"
          />
          <Select name="role" className="w-28 shrink-0 text-sm" defaultValue="player">
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Button type="submit" className="shrink-0">
            追加
          </Button>
        </form>
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">
          メンバー({members.length}人)
        </h2>
        {members.map((m) => (
          <Card key={m.id} className="space-y-2">
            <div>
              <span className="font-semibold">{m.users?.name ?? "不明"}</span>
              <span className="ml-2 text-xs text-slate-400">{m.users?.email}</span>
            </div>
            <form action={updateMember} className="flex gap-2">
              <input type="hidden" name="membership_id" value={m.id} />
              <Select
                name="role"
                defaultValue={m.role satisfies Role}
                className="flex-1 text-sm"
              >
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <Select name="status" defaultValue={m.status} className="flex-1 text-sm">
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="secondary" className="shrink-0">
                更新
              </Button>
            </form>
          </Card>
        ))}
      </section>
    </>
  );
}
