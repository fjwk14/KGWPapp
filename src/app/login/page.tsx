import { Button, Card, ErrorBanner, Input, Label } from "@/components/ui";
import { signIn, signUp } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const isSignUp = params.mode === "signup";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-brand-900">関学水球アプリ</h1>
        <p className="mt-1 text-sm text-slate-500">
          試合記録・記録シート・動画クリップ・AI分析をひとつに
        </p>
      </div>

      <Card className="space-y-4">
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-sm font-semibold">
          <a
            href="/login"
            className={
              isSignUp
                ? "flex-1 rounded-md py-2 text-center text-slate-500"
                : "flex-1 rounded-md bg-white py-2 text-center text-brand-700 shadow-sm"
            }
          >
            ログイン
          </a>
          <a
            href="/login?mode=signup"
            className={
              isSignUp
                ? "flex-1 rounded-md bg-white py-2 text-center text-brand-700 shadow-sm"
                : "flex-1 rounded-md py-2 text-center text-slate-500"
            }
          >
            新規登録
          </a>
        </div>
        <p className="text-sm text-slate-500">
          {isSignUp
            ? "はじめての方はこちら。登録済みの方は「ログイン」を選んでください。"
            : "登録済みの方はメールアドレスとパスワードでログインしてください。"}
        </p>
        <ErrorBanner message={params.error} />
        <form action={isSignUp ? signUp : signIn} className="space-y-4">
          {isSignUp && (
            <div>
              <Label htmlFor="name">名前</Label>
              <Input id="name" name="name" required placeholder="表示名" />
            </div>
          )}
          {isSignUp && (
            <div>
              <Label htmlFor="invite_code">招待コード(任意)</Label>
              <Input
                id="invite_code"
                name="invite_code"
                placeholder="例: ABC123"
                autoCapitalize="characters"
                autoComplete="off"
                className="uppercase"
              />
              <p className="mt-1 text-xs text-slate-400">
                部のコードを入れると、登録と同時にそのチームに参加できます
                (後からでも参加できます)。
              </p>
            </div>
          )}
          <div>
            <Label htmlFor="email">メールアドレス</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
            />
          </div>
          <div>
            <Label htmlFor="password">パスワード</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={isSignUp ? "new-password" : "current-password"}
            />
          </div>
          <Button type="submit" className="w-full">
            {isSignUp ? "アカウント作成" : "ログイン"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
