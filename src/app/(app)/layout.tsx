import Link from "next/link";
import { requireMembership } from "@/lib/session";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { signOut } from "@/app/login/actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { team, profile, membership } = await requireMembership();

  const navItems = [
    { href: "/dashboard", label: "ホーム", icon: "🏠" },
    { href: "/matches", label: "試合", icon: "🎬" },
    ...(can.manageTeam(membership.role)
      ? [{ href: "/admin", label: "管理", icon: "⚙️" }]
      : []),
  ];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <Link href="/dashboard" className="font-bold text-brand-900">
          {team.name}
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-500">
            {profile.name}
            <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              {ROLE_LABELS[membership.role]}
            </span>
          </span>
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
              className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-slate-600 hover:text-brand-600"
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
