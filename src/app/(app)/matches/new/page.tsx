import { redirect } from "next/navigation";
import { Button, Card, ErrorBanner, Input, Label, Select, Textarea } from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { can } from "@/lib/permissions";
import { COMPETITIONS } from "@/lib/constants";
import { createMatch } from "../actions";

// 試合登録は当日フローの入口。試合前に最低限だけ入力して
// すぐスタッツ入力へ進める。スコアは試合終了時に自動反映され、
// 動画は後日、試合詳細から添付する。
export default async function NewMatchPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const { membership } = await requireMembership();
  if (!can.createMatch(membership.role)) redirect("/matches");
  const canLive = can.recordStats(membership.role);

  return (
    <>
      <h1 className="text-lg font-bold">試合登録</h1>
      <p className="text-sm text-slate-500">
        試合前に最低限の情報だけ登録すればOK。スコアは試合記録の「試合終了」で
        自動反映、動画は後日共有されてから添付できます。
      </p>
      <Card className="space-y-4">
        <ErrorBanner message={params.error} />
        <form action={createMatch} className="space-y-4">
          <div>
            <Label htmlFor="title">試合名 *</Label>
            <Input id="title" name="title" required placeholder="関西学生リーグ 第3戦" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <Label htmlFor="opponent">対戦相手</Label>
              <Input id="opponent" name="opponent" placeholder="〇〇大学" />
            </div>
            <div className="min-w-0">
              <Label htmlFor="match_date">日付</Label>
              <Input
                id="match_date"
                name="match_date"
                type="date"
                className="appearance-none"
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="competition">大会名</Label>
            <Select id="competition" name="competition" defaultValue="">
              <option value="">選択してください</option>
              {COMPETITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="notes">メモ</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>
          <Button type="submit" className="w-full">
            登録する
          </Button>
          {canLive && (
            <button
              type="submit"
              name="next"
              value="live"
              className="min-h-12 w-full rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700"
            >
              ⏱ 登録してそのまま試合記録へ
            </button>
          )}
        </form>
      </Card>
      <p className="text-xs text-slate-400">
        ※ 結果・スコアの手動修正は試合詳細の「編集」からいつでもできます。
      </p>
    </>
  );
}
