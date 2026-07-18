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
import { can } from "@/lib/permissions";
import {
  PROPOSAL_CATEGORY_LABELS,
  PROPOSAL_STATUS_LABELS,
  PROPOSAL_STATUS_STYLES,
} from "@/lib/constants";
import type { Proposal, ProposalStatus, Profile } from "@/lib/types";
import { createProposal, updateProposalStatus } from "./actions";

const STATUS_FLOW: ProposalStatus[] = ["open", "reviewing", "adopted", "declined"];

// 改善・課題の提案ボックス。誰でも投稿でき、幹部が状態を進める。
// アプリ改善の提案はそのまま開発の入力になる。
export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const { team, userId, membership } = await requireMembership();
  const supabase = await createClient();

  const [{ data: proposalsData }, { data: membersData }] = await Promise.all([
    supabase
      .from("proposals")
      .select("id, created_by, category, title, body, solution, is_anonymous, status, created_at")
      .eq("team_id", team.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("memberships")
      .select("user_id, users(name)")
      .eq("team_id", team.id),
  ]);

  const proposals = (proposalsData ?? []) as Proposal[];
  const nameOf = new Map(
    (
      (membersData ?? []) as unknown as {
        user_id: string;
        users: Pick<Profile, "name"> | null;
      }[]
    ).map((m) => [m.user_id, m.users?.name ?? "不明"])
  );
  const canManage = can.editReport(membership);
  // 匿名表示: 著者名は出さない。ただし本人には「あなたの投稿」と分かるようにする
  const authorLabel = (p: Proposal) => {
    if (p.is_anonymous) return p.created_by === userId ? "匿名(あなた)" : "匿名";
    return nameOf.get(p.created_by) ?? "不明";
  };

  const openCount = proposals.filter((p) => p.status === "open").length;

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold">💡 提案ボックス</h1>
        <Link href="/points" className="shrink-0 text-xs text-brand-600 underline">
          ⭐ ポイント →
        </Link>
      </div>
      <p className="text-xs text-slate-500">
        アプリの改善点・チームの課題・練習メニューなど、気づいたことを自由に。
        採用されると +30pt。アプリ改善の提案は開発に直接届きます。
      </p>
      <ErrorBanner message={error} />
      {ok === "1" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          ✓ 反映しました
        </div>
      )}

      {/* 投稿フォーム */}
      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-600">提案する</h2>
        <form action={createProposal} className="space-y-2">
          <FormDraft storageKey="proposal-new" />
          <div className="flex gap-2">
            <div className="w-32 shrink-0">
              <Label htmlFor="category">種別</Label>
              <Select name="category" id="category" defaultValue="app" className="text-sm">
                {Object.entries(PROPOSAL_CATEGORY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-0 flex-1">
              <Label htmlFor="title">タイトル</Label>
              <Input name="title" id="title" required maxLength={120} className="text-sm" />
            </div>
          </div>
          <div>
            <Label htmlFor="body">内容(困っていること・気づき)</Label>
            <Textarea name="body" id="body" rows={3} required maxLength={2000} className="text-sm" />
          </div>
          <div>
            <Label htmlFor="solution">解決案(任意)</Label>
            <Textarea name="solution" id="solution" rows={2} maxLength={2000} className="text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="is_anonymous" className="h-4 w-4" />
            匿名で投稿する(名前を出さない)
          </label>
          <Button type="submit" className="w-full">
            提案を送る
          </Button>
        </form>
      </Card>

      {/* 一覧 */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-600">
          みんなの提案({proposals.length}件)
        </h2>
        {openCount > 0 && (
          <span className="text-xs text-sky-600">受付中 {openCount}件</span>
        )}
      </div>
      {proposals.length === 0 ? (
        <Card className="text-sm text-slate-400">
          まだ提案がありません。最初の一件を送ってみましょう。
        </Card>
      ) : (
        proposals.map((p) => (
          <Card key={p.id} className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                    {PROPOSAL_CATEGORY_LABELS[p.category]}
                  </span>
                  <span className="font-semibold">{p.title}</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {authorLabel(p)} ・ {p.created_at.slice(0, 10)}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${PROPOSAL_STATUS_STYLES[p.status]}`}
              >
                {PROPOSAL_STATUS_LABELS[p.status]}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{p.body}</p>
            {p.solution && (
              <p className="whitespace-pre-wrap rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">
                💡 解決案: {p.solution}
              </p>
            )}
            {canManage && (
              <form action={updateProposalStatus} className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
                <input type="hidden" name="proposal_id" value={p.id} />
                {STATUS_FLOW.map((s) => (
                  <Button
                    key={s}
                    type="submit"
                    name="status"
                    value={s}
                    variant={p.status === s ? "primary" : "secondary"}
                    className="min-h-8 px-2.5 text-xs"
                  >
                    {PROPOSAL_STATUS_LABELS[s]}
                  </Button>
                ))}
              </form>
            )}
          </Card>
        ))
      )}
    </>
  );
}
