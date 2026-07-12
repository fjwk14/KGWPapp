"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Card } from "@/components/ui";
import { regenerateInviteCode } from "./actions";

// 招待コードの表示・コピー・再発行。部員はこのコードを入力すると
// サインアップ時 or オンボーディングでそのままチームに参加できる。
export default function InviteCodeCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボード非対応でもコードは画面に表示されている
    }
  };

  return (
    <Card className="space-y-2">
      <h2 className="text-sm font-semibold text-slate-600">招待コード</h2>
      <p className="text-xs text-slate-400">
        部員に伝えてください。新規登録時にこのコードを入力すると、
        自動でこのチームに参加できます(メールでの追加は不要になります)。
      </p>
      <div className="flex items-center gap-2">
        <span className="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-center text-2xl font-bold tracking-widest">
          {code}
        </span>
        <button
          onClick={copy}
          className={clsx(
            "min-h-11 shrink-0 rounded-lg px-4 text-sm font-semibold",
            copied ? "bg-emerald-500 text-white" : "bg-brand-600 text-white"
          )}
        >
          {copied ? "コピー済" : "コピー"}
        </button>
      </div>
      <form action={regenerateInviteCode}>
        <button className="text-xs text-slate-400 underline">
          コードを再発行する(古いコードは使えなくなります)
        </button>
      </form>
    </Card>
  );
}
