import Link from "next/link";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { countUnreadComments, type CommentForUnread } from "@/lib/notifications";
import { signOut } from "@/app/login/actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { team, profile, membership, userId } = await requireMembership();
  const supabase = await createClient();

  const [{ data: commentsData }, { data: readsData }] = await Promise.all([
    supabase
      .from("clip_comments")
      .select("id, clip_id, parent_comment_id, user_id, mention_user_ids, created_at")
      .eq("team_id", team.id),
    supabase
      .from("comment_reads")
      .select("clip_id, last_read_at")
      .eq("team_id", team.id)
      .eq("user_id", userId),
  ]);
  const unreadCount = countUnreadComments(
    (commentsData ?? []) as CommentForUnread[],
    readsData ?? [],
    userId
  );

  const navItems = [
    { href: "/dashboard", label: "ホーム", icon: "🏠" },
    { href: "/matches", label: "試合", icon: "🎬", badge: unreadCount },
    { href: "/practices", label: "練習", icon: "🏊" },
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
        <div className="flex items-center gap-3 text-sm">
          <Link href="/me" className="text-slate-500 hover:text-brand-600">
            {profile.name}
            <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
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
                {"badge" in item && (item.badge ?? 0) > 0 && (
                  <span
                    data-testid="unread-badge"
                    className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white"
                  >
                    {(item.badge ?? 0) > 99 ? "99+" : item.badge}
                  </span>
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
