import { redirect } from "next/navigation";
import { Button, Card, ErrorBanner, Input, Label } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { createTeam, joinTeam } from "./actions";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (membership) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-xl font-bold text-brand-900">チームに参加する</h1>
        <p className="mt-2 text-sm text-slate-500">
          部の管理者から届いた招待コードを入力してください。
        </p>
      </div>

      <ErrorBanner message={params.error} />

      {/* 主動線: 招待コードで参加 */}
      <Card className="space-y-4">
        <h2 className="font-semibold">招待コードで参加</h2>
        <form action={joinTeam} className="space-y-3">
          <div>
            <Label htmlFor="invite_code">招待コード</Label>
            <Input
              id="invite_code"
              name="invite_code"
              required
              placeholder="例: ABC123"
              autoCapitalize="characters"
              autoComplete="off"
              className="text-center text-lg font-bold uppercase tracking-widest"
            />
          </div>
          <Button type="submit" className="w-full">
            このコードで参加する
          </Button>
        </form>
      </Card>

      {/* 副動線: チームを新規作成(部を初めて立ち上げる管理者向け) */}
      <details className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-600">
          新しくチームを作る(部の立ち上げ・管理者向け)
        </summary>
        <form action={createTeam} className="mt-3 space-y-4">
          <div>
            <Label htmlFor="name">チーム名</Label>
            <Input id="name" name="name" required placeholder="〇〇大学水球部" />
          </div>
          <div>
            <Label htmlFor="slug">チームID(半角英数字)</Label>
            <Input
              id="slug"
              name="slug"
              required
              pattern="[a-z0-9-]+"
              placeholder="kg-waterpolo"
            />
          </div>
          <Button type="submit" variant="secondary" className="w-full">
            チームを作成(管理者になります)
          </Button>
        </form>
      </details>

      <p className="text-center text-xs text-slate-400">
        ログイン中のメール: {user.email}
      </p>
      <form action={signOut} className="text-center">
        <button className="text-sm text-slate-400 underline">ログアウト</button>
      </form>
    </main>
  );
}
