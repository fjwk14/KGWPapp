import { clsx } from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { levelOf } from "@/lib/points";

export function Card({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-slate-200 bg-white p-4 shadow-sm",
        className
      )}
      {...props}
    />
  );
}

export function Button({
  className,
  variant = "primary",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" }) {
  return (
    <button
      className={clsx(
        "inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50",
        variant === "primary" && "bg-brand-600 text-white hover:bg-brand-700",
        variant === "secondary" &&
          "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700",
        className
      )}
      {...props}
    />
  );
}

export function LinkButton({
  className,
  href,
  children,
}: {
  className?: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700 active:scale-[0.98]",
        className
      )}
    >
      {children}
    </Link>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={clsx(
        "block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={clsx(
        "block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={clsx(
        "block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
        className
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={clsx("mb-1 block text-sm font-medium text-slate-700", className)}
      {...props}
    />
  );
}

const TAG_TYPE_COLORS: Record<string, string> = {
  action: "bg-blue-100 text-blue-800",
  cause: "bg-amber-100 text-amber-800",
  result: "bg-emerald-100 text-emerald-800",
  phase: "bg-purple-100 text-purple-800",
  player: "bg-pink-100 text-pink-800",
  tactic: "bg-cyan-100 text-cyan-800",
  situation: "bg-slate-200 text-slate-700",
};

export function TagBadge({
  tagType,
  children,
  className,
}: {
  tagType: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        TAG_TYPE_COLORS[tagType] ?? "bg-slate-200 text-slate-700",
        className
      )}
    >
      {children}
    </span>
  );
}

// 選手 / マネージャーを一目で区別するバッジ
export function RoleBadge({
  manager,
  className,
}: {
  manager: boolean;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
        manager ? "bg-pink-100 text-pink-700" : "bg-sky-100 text-sky-700",
        className
      )}
    >
      {manager ? "📋 マネ" : "🤽‍♂️ 選手"}
    </span>
  );
}

// メンバーの簡易アイコン: 名前の頭文字 + レベルに応じたリング色。
// 累積ポイントでリングが スレート→ブルー→…→虹 と進化する。
export function PointAvatar({
  name,
  total,
  size = "md",
  className,
}: {
  name: string;
  total: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const level = levelOf(total);
  const initial = (name ?? "?").trim().charAt(0) || "?";
  const rainbow = level.key === "rainbow";
  const sizes = {
    sm: "h-7 w-7 text-xs ring-2",
    md: "h-9 w-9 text-sm ring-2",
    lg: "h-14 w-14 text-lg ring-4",
  }[size];
  return (
    <span
      title={`${level.label} / ${total}pt`}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold ring-offset-1",
        sizes,
        rainbow
          ? "bg-gradient-to-br from-fuchsia-500 via-amber-400 to-emerald-400 text-white ring-fuchsia-400"
          : clsx(level.bg, level.text, level.ring),
        className
      )}
    >
      {initial}
    </span>
  );
}

// レベルの小さなチップ
export function LevelChip({ total, className }: { total: number; className?: string }) {
  const level = levelOf(total);
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
        level.key === "rainbow"
          ? "bg-gradient-to-r from-fuchsia-500 via-amber-400 to-emerald-400 text-white"
          : clsx(level.bg, level.text),
        className
      )}
    >
      Lv.{level.label}
    </span>
  );
}

export function ErrorBanner({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  );
}

export const TAG_TYPE_LABELS: Record<string, string> = {
  action: "アクション",
  cause: "原因",
  result: "結果",
  phase: "局面",
  player: "選手",
  tactic: "戦術",
  situation: "状況",
};

export const COMMENT_TYPE_LABELS: Record<string, string> = {
  observation: "観察",
  question: "質問",
  tactical_opinion: "戦術意見",
  coaching_note: "指導メモ",
};
