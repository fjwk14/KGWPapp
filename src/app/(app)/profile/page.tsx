import { Button, Card, ErrorBanner, Input, Label } from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/permissions";
import { updateEmail, updateProfileName } from "./actions";

// 自分のプロフィール(氏名)をいつでも編集できるページ
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const { profile, membership } = await requireMembership();

  const roles = [membership.role, membership.secondary_role]
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ROLE_LABELS[r]);

  return (
    <>
      <h1 className="text-lg font-bold">プロフィール</h1>

      <Card className="space-y-4">
        <ErrorBanner message={error} />
        {ok === "1" && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            ✓ 名前を更新しました
          </div>
        )}
        {ok === "email" && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            ✓ 確認メールを送りました。届いたメールのリンクを開くと変更が確定します
            (新旧両方のアドレスに届く場合があります)。
          </div>
        )}

        <div className="text-sm text-slate-500">
          <p>
            現在の表示名: <span className="font-semibold text-slate-800">{profile.name}</span>
          </p>
          <p className="mt-0.5">メール: {profile.email}</p>
          <p className="mt-0.5">役職: {roles.join(" 兼 ")}</p>
        </div>

        <form action={updateProfileName} className="space-y-3">
          <div>
            <Label>名前(漢字フルネーム)</Label>
            <div className="flex gap-2">
              <Input
                name="family_name"
                required
                maxLength={20}
                defaultValue={profile.family_name ?? ""}
                placeholder="姓(例: 浅田)"
                className="min-w-0 flex-1"
                aria-label="姓"
              />
              <Input
                name="given_name"
                required
                maxLength={20}
                defaultValue={profile.given_name ?? ""}
                placeholder="名(例: 峻平)"
                className="min-w-0 flex-1"
                aria-label="名"
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              姓・名を漢字で入力してください。チーム内の表示に使われます。
            </p>
          </div>
          <Button type="submit" className="w-full">
            名前を保存する
          </Button>
        </form>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-600">メールアドレスを変更</h2>
        <p className="text-xs text-slate-400">
          ログインに使うメールアドレスを変更します。入力後に届く確認メールの
          リンクを開くと変更が確定します(開くまでは今のアドレスのままです)。
        </p>
        <form action={updateEmail} className="space-y-2">
          <div>
            <Label htmlFor="new_email">新しいメールアドレス</Label>
            <Input
              type="email"
              name="new_email"
              id="new_email"
              required
              placeholder="new-address@example.com"
              className="text-sm"
            />
          </div>
          <Button type="submit" variant="secondary" className="w-full">
            確認メールを送る
          </Button>
        </form>
      </Card>
    </>
  );
}
