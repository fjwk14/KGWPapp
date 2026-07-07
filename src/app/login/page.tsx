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
        <h1 className="text-2xl font-bold text-brand-900">KG Tactical Video</h1>
        <p className="mt-1 text-sm text-slate-500">
          試合動画をチームの戦術知に変換する
        </p>
      </div>

      <Card className="space-y-4">
        <ErrorBanner message={params.error} />
        <form action={isSignUp ? signUp : signIn} className="space-y-4">
          {isSignUp && (
            <div>
              <Label htmlFor="name">名前</Label>
              <Input id="name" name="name" required placeholder="表示名" />
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
        <p className="text-center text-sm text-slate-500">
          {isSignUp ? (
            <a href="/login" className="text-brand-600 underline">
              ログインはこちら
            </a>
          ) : (
            <a href="/login?mode=signup" className="text-brand-600 underline">
              新規アカウント作成はこちら
            </a>
          )}
        </p>
      </Card>
    </main>
  );
}
