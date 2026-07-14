import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button, Card, ErrorBanner, Input, Label } from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import type { Match } from "@/lib/types";
import { deleteMatch } from "../../actions";

// 試合削除の2段階目: 警告 + 試合名の完全一致入力で確定
export default async function DeleteMatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { membership } = await requireMembership();
  if (!can.deleteMatch(membership)) redirect(`/matches/${id}`);

  const supabase = await createClient();
  const { data: match } = await supabase
    .from("matches")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();
  if (!match) notFound();
  const m = match as Pick<Match, "id" | "title">;

  return (
    <>
      <Link href={`/matches/${id}`} className="text-xs text-brand-600 underline">
        ← 試合詳細に戻る
      </Link>
      <h1 className="text-lg font-bold text-red-700">試合を削除</h1>

      <Card className="space-y-4 border-red-200">
        <ErrorBanner message={error} />
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p className="font-semibold">この操作は取り消せません。</p>
          <p className="mt-1">
            「{m.title}」に紐づくクリップ・タグ・コメント・スタッツ記録・動画リンク・
            AIレポートもすべて削除されます。
          </p>
        </div>

        <form action={deleteMatch} className="space-y-3">
          <input type="hidden" name="match_id" value={m.id} />
          <div>
            <Label htmlFor="confirm_title">
              確認のため、試合名「{m.title}」を入力してください
            </Label>
            <Input
              id="confirm_title"
              name="confirm_title"
              required
              autoComplete="off"
              placeholder={m.title}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="min-h-11 flex-1 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700"
            >
              完全に削除する
            </button>
            <Link
              href={`/matches/${id}`}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
            >
              キャンセル
            </Link>
          </div>
        </form>
      </Card>
    </>
  );
}
