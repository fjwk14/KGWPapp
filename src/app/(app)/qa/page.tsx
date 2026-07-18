import Link from "next/link";
import {
  Button,
  Card,
  ErrorBanner,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui";
import FormDraft from "@/components/form-draft";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { QA_CATEGORY_LABELS } from "@/lib/constants";
import type { QaQuestion } from "@/lib/types";
import { askQuestion } from "./actions";

// Q&A掲示板。授業・単位・就活・水球のコツなどを先輩に聞ける。
// 質問は匿名可、回答は記名。学年は詳細ページで表示する。
export default async function QaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { team } = await requireMembership();
  const supabase = await createClient();

  const [{ data: questionsData }, { data: answersData }] = await Promise.all([
    supabase
      .from("qa_questions")
      .select("id, category, title, is_anonymous, resolved_answer_id, created_at")
      .eq("team_id", team.id)
      .order("created_at", { ascending: false }),
    supabase.from("qa_answers").select("question_id").eq("team_id", team.id),
  ]);

  const questions = (questionsData ?? []) as Pick<
    QaQuestion,
    "id" | "category" | "title" | "is_anonymous" | "resolved_answer_id" | "created_at"
  >[];
  const answerCount = new Map<string, number>();
  for (const a of (answersData ?? []) as { question_id: string }[]) {
    answerCount.set(a.question_id, (answerCount.get(a.question_id) ?? 0) + 1);
  }

  const unresolved = questions.filter((q) => !q.resolved_answer_id).length;

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold">🎓 Q&A掲示板</h1>
        <Link href="/points" className="shrink-0 text-xs text-brand-600 underline">
          ⭐ ポイント →
        </Link>
      </div>
      <p className="text-xs text-slate-500">
        授業・単位・就活・水球のコツなど、先輩に気軽に聞ける掲示板です。
        質問は匿名でもOK。回答すると +3pt、ベストアンサーで +10pt。
      </p>
      <ErrorBanner message={error} />

      {/* 質問フォーム */}
      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-600">質問する</h2>
        <form action={askQuestion} className="space-y-2">
          <FormDraft storageKey="qa-new" />
          <div className="flex gap-2">
            <div className="w-32 shrink-0">
              <Label htmlFor="category">種別</Label>
              <Select name="category" id="category" defaultValue="class" className="text-sm">
                {Object.entries(QA_CATEGORY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-0 flex-1">
              <Label htmlFor="title">質問(短く)</Label>
              <Input name="title" id="title" required maxLength={120} className="text-sm" />
            </div>
          </div>
          <div>
            <Label htmlFor="body">詳しく</Label>
            <Textarea name="body" id="body" rows={3} required maxLength={2000} className="text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="is_anonymous" className="h-4 w-4" defaultChecked />
            匿名で質問する
          </label>
          <Button type="submit" className="w-full">
            質問を投稿
          </Button>
        </form>
      </Card>

      {/* 一覧 */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-600">
          みんなの質問({questions.length}件)
        </h2>
        {unresolved > 0 && (
          <span className="text-xs text-amber-600">未解決 {unresolved}件</span>
        )}
      </div>
      {questions.length === 0 ? (
        <Card className="text-sm text-slate-400">まだ質問がありません。</Card>
      ) : (
        questions.map((q) => (
          <Link key={q.id} href={`/qa/${q.id}`} className="block">
            <Card className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                    {QA_CATEGORY_LABELS[q.category]}
                  </span>
                  <span className="min-w-0 truncate font-semibold">{q.title}</span>
                </div>
                <p className="text-[11px] text-slate-400">{q.created_at.slice(0, 10)}</p>
              </div>
              <div className="shrink-0 text-right">
                {q.resolved_answer_id ? (
                  <span className="text-xs font-semibold text-emerald-600">解決済み</span>
                ) : (
                  <span className="text-xs text-slate-400">未解決</span>
                )}
                <div className="text-xs text-slate-500">回答 {answerCount.get(q.id) ?? 0}</div>
              </div>
            </Card>
          </Link>
        ))
      )}
    </>
  );
}
