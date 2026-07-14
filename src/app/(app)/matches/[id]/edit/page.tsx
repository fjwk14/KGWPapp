import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Button,
  Card,
  ErrorBanner,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { COMPETITIONS } from "@/lib/constants";
import type { Match } from "@/lib/types";
import { updateMatch } from "../../actions";

export default async function EditMatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { membership } = await requireMembership();
  if (!can.editMatch(membership)) redirect(`/matches/${id}`);

  const supabase = await createClient();
  const { data: match } = await supabase
    .from("matches")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!match) notFound();
  const m = match as Match;

  return (
    <>
      <Link href={`/matches/${id}`} className="text-xs text-brand-600 underline">
        ← 試合詳細に戻る
      </Link>
      <h1 className="text-lg font-bold">試合を編集</h1>
      <Card className="space-y-4">
        <ErrorBanner message={error} />
        <form action={updateMatch} className="space-y-4">
          <input type="hidden" name="match_id" value={m.id} />
          <div>
            <Label htmlFor="title">試合名 *</Label>
            <Input id="title" name="title" required defaultValue={m.title} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <Label htmlFor="opponent">対戦相手</Label>
              <Input id="opponent" name="opponent" defaultValue={m.opponent ?? ""} />
            </div>
            <div className="min-w-0">
              <Label htmlFor="match_date">日付</Label>
              <Input
                id="match_date"
                name="match_date"
                type="date"
                className="appearance-none"
                defaultValue={m.match_date ?? ""}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="competition">大会名</Label>
            <Select id="competition" name="competition" defaultValue={m.competition ?? ""}>
              <option value="">選択してください</option>
              {COMPETITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              {/* 一覧にない既存値も選択肢として残す */}
              {m.competition && !COMPETITIONS.includes(m.competition as (typeof COMPETITIONS)[number]) && (
                <option value={m.competition}>{m.competition}</option>
              )}
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="result">結果</Label>
              <Select id="result" name="result" defaultValue={m.result ?? ""}>
                <option value="">未定</option>
                <option value="win">勝ち</option>
                <option value="lose">負け</option>
                <option value="draw">引き分け</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="score_for">得点</Label>
              <Input
                id="score_for"
                name="score_for"
                type="number"
                min={0}
                max={99}
                inputMode="numeric"
                defaultValue={m.score_for ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="score_against">失点</Label>
              <Input
                id="score_against"
                name="score_against"
                type="number"
                min={0}
                max={99}
                inputMode="numeric"
                defaultValue={m.score_against ?? ""}
              />
            </div>
          </div>

          {/* Q別スコア: 試合記録の「試合終了」で自動記入。手動でも修正できる */}
          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium text-slate-700">
              Q別スコア(得点 / 失点、任意)
            </legend>
            <div className="grid grid-cols-5 gap-1.5">
              {(["1", "2", "3", "4", "5"] as const).map((q) => {
                const s = m.quarter_scores?.[q];
                const label = q === "5" ? "PSO" : `Q${q}`;
                return (
                  <div key={q} className="min-w-0 space-y-1">
                    <p className="text-center text-xs font-semibold text-slate-500">
                      {label}
                    </p>
                    <Input
                      name={`q${q}_for`}
                      type="number"
                      min={0}
                      max={99}
                      inputMode="numeric"
                      placeholder="得"
                      defaultValue={s?.for ?? ""}
                      aria-label={`${label}の得点`}
                      className="px-1 text-center text-sm"
                    />
                    <Input
                      name={`q${q}_against`}
                      type="number"
                      min={0}
                      max={99}
                      inputMode="numeric"
                      placeholder="失"
                      defaultValue={s?.against ?? ""}
                      aria-label={`${label}の失点`}
                      className="px-1 text-center text-sm"
                    />
                  </div>
                );
              })}
            </div>
          </fieldset>
          <div>
            <Label htmlFor="notes">メモ</Label>
            <Textarea id="notes" name="notes" rows={3} defaultValue={m.notes ?? ""} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1">
              保存する
            </Button>
            <Link
              href={`/matches/${id}`}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
            >
              キャンセル
            </Link>
          </div>
        </form>
      </Card>
      <p className="text-xs text-slate-400">
        ※ 動画は試合詳細の「試合動画」欄で追加・削除できます。
      </p>

      {can.deleteMatch(membership) && (
        <Card className="space-y-2 border-red-200">
          <h2 className="text-sm font-semibold text-red-700">試合の削除</h2>
          <p className="text-xs text-slate-500">
            試合とそれに紐づく記録をすべて削除します。確認のうえ次の画面で試合名を入力すると実行できます。
          </p>
          <Link
            href={`/matches/${id}/delete`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-red-300 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50"
          >
            試合を削除する
          </Link>
        </Card>
      )}
    </>
  );
}
