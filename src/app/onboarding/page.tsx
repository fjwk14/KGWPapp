import { redirect } from "next/navigation";
import { Button, Card, ErrorBanner, Input, Label } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { createTeam } from "./actions";

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
          まだどのチームにも所属していません。新しいチームを作成するか、
          チーム管理者にメンバー追加を依頼してください(登録メール:{" "}
          {user.email})。
        </p>
      </div>

      <Card className="space-y-4">
        <h2 className="font-semibold">新しいチームを作成</h2>
        <ErrorBanner message={params.error} />
        <form action={createTeam} className="space-y-4">
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
          <Button type="submit" className="w-full">
            チームを作成(管理者になります)
          </Button>
        </form>
      </Card>

      <form action={signOut} className="text-center">
        <button className="text-sm text-slate-400 underline">ログアウト</button>
      </form>
    </main>
  );
}
