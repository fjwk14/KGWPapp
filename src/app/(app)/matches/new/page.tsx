import { redirect } from "next/navigation";
import { Button, Card, ErrorBanner, Input, Label, Select, Textarea } from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { can } from "@/lib/permissions";
import { createMatch } from "../actions";

export default async function NewMatchPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const { membership } = await requireMembership();
  if (!can.createMatch(membership.role)) redirect("/matches");

  return (
    <>
      <h1 className="text-lg font-bold">試合登録</h1>
      <Card className="space-y-4">
        <ErrorBanner message={params.error} />
        <form action={createMatch} className="space-y-4">
          <div>
            <Label htmlFor="title">試合名 *</Label>
            <Input id="title" name="title" required placeholder="関西学生リーグ 第3戦" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="opponent">対戦相手</Label>
              <Input id="opponent" name="opponent" placeholder="〇〇大学" />
            </div>
            <div>
              <Label htmlFor="match_date">日付</Label>
              <Input id="match_date" name="match_date" type="date" />
            </div>
          </div>
          <div>
            <Label htmlFor="competition">大会名</Label>
            <Input id="competition" name="competition" placeholder="関西学生リーグ" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="result">結果</Label>
              <Select id="result" name="result" defaultValue="">
                <option value="">未定</option>
                <option value="win">勝ち</option>
                <option value="lose">負け</option>
                <option value="draw">引き分け</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="score_for">得点</Label>
              <Input id="score_for" name="score_for" type="number" min={0} max={99} inputMode="numeric" />
            </div>
            <div>
              <Label htmlFor="score_against">失点</Label>
              <Input id="score_against" name="score_against" type="number" min={0} max={99} inputMode="numeric" />
            </div>
          </div>
          <div>
            <Label htmlFor="video_url">動画URL(YouTube等)</Label>
            <Input id="video_url" name="video_url" type="url" placeholder="https://www.youtube.com/watch?v=..." />
          </div>
          <div>
            <Label htmlFor="notes">メモ</Label>
            <Textarea id="notes" name="notes" rows={3} />
          </div>
          <Button type="submit" className="w-full">登録する</Button>
        </form>
      </Card>
    </>
  );
}
