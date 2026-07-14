import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Button,
  Card,
  ErrorBanner,
  Label,
  Textarea,
} from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import type { Match, TacticalReport } from "@/lib/types";
import { generateReport, updateReport } from "./actions";

function ListSection({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-600">{title}</h3>
      <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function TextSection({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-600">{title}</h3>
      <p className="mt-1 whitespace-pre-wrap text-sm">{text}</p>
    </div>
  );
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; edit?: string }>;
}) {
  const { id } = await params;
  const { error, edit } = await searchParams;
  const { membership } = await requireMembership();
  const supabase = await createClient();

  const { data: matchData } = await supabase
    .from("matches")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();
  if (!matchData) notFound();
  const match = matchData as Pick<Match, "id" | "title">;

  const { data: reportsData } = await supabase
    .from("tactical_reports")
    .select("*")
    .eq("match_id", id)
    .order("created_at", { ascending: false });
  const reports = (reportsData ?? []) as TacticalReport[];
  const latest = reports[0] ?? null;
  const isEditing = edit === "1" && latest && can.editReport(membership);

  return (
    <>
      <Link href={`/matches/${id}`} className="text-xs text-brand-600 underline">
        ← {match.title}
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">AI戦術レポート</h1>
        {can.generateReport(membership) && (
          <form action={generateReport}>
            <input type="hidden" name="match_id" value={id} />
            <Button type="submit" className="min-h-9 px-3 text-xs">
              🤖 {latest ? "再生成" : "レポート生成"}
            </Button>
          </form>
        )}
      </div>
      <ErrorBanner message={error} />

      {!latest && (
        <Card className="text-sm text-slate-500">
          まだレポートがありません。クリップ・タグ・コメントを登録してから「レポート生成」を押してください。
          AIはタグとコメントを整理・集計して、次回練習テーマと戦術示唆に変換します。
        </Card>
      )}

      {latest && !isEditing && (
        <Card className="space-y-4">
          <div>
            <h2 className="font-bold">{latest.title}</h2>
            <p className="text-xs text-slate-400">
              {new Date(latest.created_at).toLocaleString("ja-JP")} / 確信度:{" "}
              {latest.ai_confidence != null
                ? `${Math.round(latest.ai_confidence * 100)}%`
                : "-"}
            </p>
          </div>
          <TextSection title="総括" text={latest.summary} />
          <TextSection title="攻撃面" text={latest.offensive_findings} />
          <TextSection title="守備面" text={latest.defensive_findings} />
          <TextSection title="トランジション" text={latest.transition_findings} />
          <ListSection title="繰り返し発生している問題" items={latest.key_problem_patterns} />
          <ListSection
            title="次回練習テーマ"
            items={latest.recommended_training_themes}
          />
          <ListSection title="ミーティング共有事項" items={latest.meeting_points} />

          {can.editReport(membership) && (
            <Link
              href={`/matches/${id}/report?edit=1`}
              className="inline-block text-sm text-brand-600 underline"
            >
              ✏️ レポートを編集・確定する(幹部・主将)
            </Link>
          )}
        </Card>
      )}

      {latest && isEditing && (
        <Card>
          <form action={updateReport} className="space-y-3">
            <input type="hidden" name="match_id" value={id} />
            <input type="hidden" name="report_id" value={latest.id} />
            <div>
              <Label>総括</Label>
              <Textarea name="summary" rows={3} defaultValue={latest.summary ?? ""} />
            </div>
            <div>
              <Label>攻撃面</Label>
              <Textarea
                name="offensive_findings"
                rows={3}
                defaultValue={latest.offensive_findings ?? ""}
              />
            </div>
            <div>
              <Label>守備面</Label>
              <Textarea
                name="defensive_findings"
                rows={3}
                defaultValue={latest.defensive_findings ?? ""}
              />
            </div>
            <div>
              <Label>トランジション</Label>
              <Textarea
                name="transition_findings"
                rows={3}
                defaultValue={latest.transition_findings ?? ""}
              />
            </div>
            <div>
              <Label>問題パターン(1行1項目)</Label>
              <Textarea
                name="key_problem_patterns"
                rows={3}
                defaultValue={(latest.key_problem_patterns ?? []).join("\n")}
              />
            </div>
            <div>
              <Label>次回練習テーマ(1行1項目)</Label>
              <Textarea
                name="recommended_training_themes"
                rows={3}
                defaultValue={(latest.recommended_training_themes ?? []).join("\n")}
              />
            </div>
            <div>
              <Label>ミーティング共有事項(1行1項目)</Label>
              <Textarea
                name="meeting_points"
                rows={3}
                defaultValue={(latest.meeting_points ?? []).join("\n")}
              />
            </div>
            <Button type="submit" className="w-full">
              保存して確定
            </Button>
          </form>
        </Card>
      )}

      {reports.length > 1 && (
        <Card>
          <h2 className="text-sm font-semibold text-slate-600">過去のレポート</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-500">
            {reports.slice(1).map((r) => (
              <li key={r.id}>
                {r.title}({new Date(r.created_at).toLocaleDateString("ja-JP")})
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
