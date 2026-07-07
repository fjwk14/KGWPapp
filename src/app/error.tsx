"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-bold">エラーが発生しました</h1>
      <p className="text-sm text-slate-500">
        時間をおいて再度お試しください。解決しない場合は管理者に連絡してください。
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
      >
        再読み込み
      </button>
    </main>
  );
}
