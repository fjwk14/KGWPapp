import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-bold">ページが見つかりません</h1>
      <p className="text-sm text-slate-500">
        URLが間違っているか、削除された可能性があります。
      </p>
      <Link
        href="/dashboard"
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
      >
        ホームへ戻る
      </Link>
    </main>
  );
}
