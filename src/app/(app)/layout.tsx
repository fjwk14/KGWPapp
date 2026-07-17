import { Suspense } from "react";
import Link from "next/link";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { countUnreadComments, type CommentForUnread } from "@/lib/notifications";
import { fetchUserPoints } from "@/lib/points-data";
import { PointAvatar } from "@/components/ui";
import { signOut } from "@/app/login/actions";

// 未読バッジは別クエリ(コメント+既読)が必要なため、ヘッダー/ナビ本体の描画を
// 待たせないようSuspenseで分離してストリーミングする。
async function UnreadBadge({ teamId, userId }: { teamId: string; userId: string }) {
  const supabase = await createClient();
  const [{ data: commentsData }, { data: readsData }] = await Promise.all([
    supabase
      .from("clip_comments")
      .select("id, clip_id, parent_comment_id, user_id, mention_user_ids, created_at")
      .eq("team_id", teamId),
    supabase
      .from("comment_reads")
      .select("clip_id, last_read_at")
      .eq("team_id", teamId)
      .eq("user_id", userId),
  ]);
  const unreadCount = countUnreadComments(
    (commentsData ?? []) as CommentForUnread[],
    readsData ?? [],
    userId
  );
  if (unreadCount <= 0) return null;
  return (
    <span
      data-testid="unread-badge"
      className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white"
    >
      {unreadCount > 99 ? "99+" : unreadCount}
    </span>
  );
}

// ポイントアバターは全行動の集計が要るため、ヘッダー本体を待たせないよう
// Suspenseで分離してストリーミングする(未読バッジと同じ方針)。
async function HeaderAvatar({
  teamId,
  userId,
  name,
}: {
  teamId: string;
  userId: string;
  name: string;
}) {
  const supabase = await createClient();
  const points = await fetchUserPoints(supabase, teamId, userId);
  return <PointAvatar name={name} total={points.breakdown.total} size="sm" />;
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { team, profile, membership, userId } = await requireMembership();

  // アプリアイコン(水球帽のシャチ・ゴールドの球)のモチーフに合わせた
  // 統一感のあるアイコンセット。試合=ゴール、練習=水球プレーヤー。
  const navItems = [
    { href: "/dashboard", label: "ホーム", icon: "🏠" },
    { href: "/matches", label: "試合", icon: "🥅", showUnreadBadge: true },
    { href: "/practices", label: "練習", icon: "🤽‍♂️" },
    { href: "/rankings", label: "ランキング", icon: "🏆" },
    ...(can.manageTeam(membership)
      ? [{ href: "/admin", label: "設定", icon: "⚙️" }]
      : []),
  ];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <Link href="/dashboard" className="font-bold text-brand-900">
          {team.name}
        </Link>
        <div className="flex items-center gap-2 text-sm">
          <Link href="/me" className="flex items-center gap-1.5 text-slate-500 hover:text-brand-600">
            <Suspense
              fallback={<span className="inline-block h-7 w-7 shrink-0 rounded-full bg-slate-100" />}
            >
              <HeaderAvatar teamId={team.id} userId={userId} name={profile.name} />
            </Suspense>
            <span className="hidden sm:inline">{profile.name}</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              {ROLE_LABELS[membership.role]}
              {membership.secondary_role
                ? `/${ROLE_LABELS[membership.secondary_role]}`
                : ""}
            </span>
          </Link>
          <form action={signOut}>
            <button className="text-xs text-slate-400 underline">
              ログアウト
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 space-y-4 p-4 pb-24">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-slate-600 hover:text-brand-600"
            >
              <span className="relative text-lg leading-none">
                {item.icon}
                {"showUnreadBadge" in item && item.showUnreadBadge && (
                  <Suspense fallback={null}>
                    <UnreadBadge teamId={team.id} userId={userId} />
                  </Suspense>
                )}
              </span>
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
