import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Button,
  Card,
  ErrorBanner,
  Input,
  Label,
  RoleBadge,
  Select,
} from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can, isManager, ROLE_LABELS } from "@/lib/permissions";
import type { Membership, Profile, Role } from "@/lib/types";
import { FIELD_POSITIONS } from "@/lib/constants";
import { enrollmentYearOptions, gradeLabel } from "@/lib/grade";
import { addMember, bulkUpdateMembers, removeMember, updateTeamBranding } from "./actions";
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
  if (!can.manageTeam(membership)) redirect("/dashboard");

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
          <Link href="/condition" className="text-sm text-brand-600 underline">
            チームのコンディション →
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

      {/* チームロゴ(ヘッダーに表示)。他大学・他チーム展開を見据え、
          色ではなく画像URLのみを設定する軽量な項目にしている */}
      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-600">チームロゴ</h2>
        <p className="text-xs text-slate-400">
          画像を公開URLでホストし、そのURLを貼り付けてください。ヘッダーにチーム名と並んで表示されます。
          空欄で更新するとロゴを消せます。
        </p>
        <form action={updateTeamBranding} className="flex items-center gap-2">
          {team.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={team.logo_url}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
            />
          )}
          <Input
            name="logo_url"
            type="url"
            placeholder="https://example.com/logo.png"
            defaultValue={team.logo_url ?? ""}
            className="flex-1 text-sm"
          />
          <Button type="submit" className="shrink-0">
            保存
          </Button>
        </form>
      </Card>

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
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-600">
              メンバー({members.length}人)
            </h2>
            {/* 上部にも更新ボタン(下までスクロールしなくても保存できる) */}
            <Button type="submit" className="min-h-9 shrink-0 px-3 text-xs">
              一括更新
            </Button>
          </div>
          {members.map((m) => (
            <div key={m.id}>
              <Card className="space-y-2">
                {/* 名前を優先表示(メールが長くても切れないよう別行に落とす) */}
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <RoleBadge manager={isManager(m)} />
                    <span className="font-semibold">{m.users?.name ?? "不明"}</span>
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                      {gradeLabel(m.enrollment_year)}
                    </span>
                  </div>
                  <div className="truncate text-xs text-slate-400">
                    {m.users?.email}
                  </div>
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
                <div>
                  <label className="text-xs text-slate-400">入部年度(学年の算出に使用)</label>
                  <Select
                    name={`enrollment_year_${m.id}`}
                    defaultValue={m.enrollment_year ? String(m.enrollment_year) : ""}
                    className="w-full text-sm"
                  >
                    <option value="">未設定</option>
                    {enrollmentYearOptions().map((y) => (
                      <option key={y} value={String(y)}>
                        {y}年入部
                      </option>
                    ))}
                  </Select>
                </div>
                {/* 役職の併用は全ロール可(例: 選手 兼 分析チーム)。権限は両方の和集合 */}
                <div>
                  <label className="text-xs text-slate-400">
                    併用役職(任意・権限は両方に効きます)
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
                {/* 既定の帽子番号・ポジション(試合記録の初期値になる)。
                    マネージャーは競技者ではないため設定不要 */}
                {isManager(m) ? (
                  <p className="text-xs text-slate-400">
                    マネージャーは帽子番号・ポジションの設定は不要です。
                  </p>
                ) : (
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
                )}
                {/* ポジションの併用(任意)。複数ポジションをこなす選手向け */}
                {!isManager(m) && (
                  <div>
                    <label className="text-xs text-slate-400">
                      併用ポジション(任意)
                    </label>
                    <Select
                      name={`secondary_position_${m.id}`}
                      defaultValue={
                        m.secondary_field_position ? String(m.secondary_field_position) : ""
                      }
                      className="w-full text-sm"
                    >
                      <option value="">なし</option>
                      {FIELD_POSITIONS.map((p) => (
                        <option key={p.value} value={String(p.value)}>
                          {p.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
                {/* 登録削除(重複アカウントの整理用)。誤タップ防止に折りたたみ */}
                <details>
                  <summary
                    className="cursor-pointer text-xs text-rose-400"
                    data-testid={`remove-toggle-${m.id}`}
                  >
                    このメンバーを登録削除...
                  </summary>
                  <div className="mt-2 space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-2">
                    <p className="text-xs text-rose-700">
                      チームから削除します(間違って複数アカウントで登録した場合の整理用)。
                      本人のアカウントや過去の記録は消えません。
                      引退・卒業は上の在籍状況の変更で行ってください。
                    </p>
                    <Button
                      formAction={removeMember.bind(null, m.id)}
                      variant="danger"
                      className="min-h-9 w-full text-xs"
                      data-testid={`remove-member-${m.id}`}
                    >
                      {m.users?.name ?? "このメンバー"} を削除する
                    </Button>
                  </div>
                </details>
              </Card>
            </div>
          ))}
        </section>
        {/* 下部の更新ボタン(下ナビと重ならないよう通常配置。上部にもボタンあり) */}
        <div className="pt-2">
          <Button type="submit" className="w-full">
            一括更新
          </Button>
        </div>
      </form>
    </>
  );
}
