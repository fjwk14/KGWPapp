import { notFound, redirect } from "next/navigation";
import {
  Button,
  Card,
  ErrorBanner,
  Input,
  Label,
  Select,
  Textarea,
  TAG_TYPE_LABELS,
} from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import type { Match, TagTemplate } from "@/lib/types";
import { createClip } from "../../../actions";

// 1クリップ90秒以内で登録できるよう、クリップ情報 + タグ選択 +
// 最初のコメントを1画面・1送信で完了させる。タグは選択式チップ。
export default async function NewClipPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { membership, team } = await requireMembership();
  if (!can.createClip(membership.role)) redirect(`/matches/${id}`);

  const supabase = await createClient();
  const { data: match } = await supabase
    .from("matches")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();
  if (!match) notFound();

  const { data: templatesData } = await supabase
    .from("tag_templates")
    .select("*")
    .eq("team_id", team.id)
    .eq("is_active", true)
    .order("tag_type")
    .order("sort_order");
  const templates = (templatesData ?? []) as TagTemplate[];

  const grouped = templates.reduce<Record<string, TagTemplate[]>>((acc, t) => {
    (acc[t.tag_type] ??= []).push(t);
    return acc;
  }, {});

  return (
    <>
      <h1 className="text-lg font-bold">クリップ作成</h1>
      <p className="text-sm text-slate-500">{(match as Match).title}</p>

      <Card className="space-y-4">
        <ErrorBanner message={error} />
        <form action={createClip} className="space-y-4">
          <input type="hidden" name="match_id" value={id} />

          <div>
            <Label htmlFor="title">場面タイトル *</Label>
            <Input
              id="title"
              name="title"
              required
              placeholder="Q2 カウンター失点"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="start_time_seconds">開始(秒)*</Label>
              <Input
                id="start_time_seconds"
                name="start_time_seconds"
                type="number"
                min={0}
                required
                inputMode="numeric"
                placeholder="615"
              />
            </div>
            <div>
              <Label htmlFor="end_time_seconds">終了(秒)*</Label>
              <Input
                id="end_time_seconds"
                name="end_time_seconds"
                type="number"
                min={1}
                required
                inputMode="numeric"
                placeholder="645"
              />
            </div>
            <div>
              <Label htmlFor="quarter">Q</Label>
              <Select id="quarter" name="quarter" defaultValue="">
                <option value="">-</option>
                <option value="1">Q1</option>
                <option value="2">Q2</option>
                <option value="3">Q3</option>
                <option value="4">Q4</option>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="description">場面の説明</Label>
            <Textarea
              id="description"
              name="description"
              rows={2}
              placeholder="戻りが遅れて2対1を作られた"
            />
          </div>

          {Object.entries(grouped).map(([tagType, items]) => (
            <fieldset key={tagType}>
              <legend className="mb-1.5 text-sm font-medium text-slate-700">
                {TAG_TYPE_LABELS[tagType] ?? tagType}
              </legend>
              <div className="flex flex-wrap gap-2">
                {items.map((t) => (
                  <label key={t.id} className="cursor-pointer">
                    <input
                      type="checkbox"
                      name="tags"
                      value={`${t.tag_type}:${t.tag_value}`}
                      className="peer sr-only"
                    />
                    <span className="inline-block rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:text-white">
                      {t.tag_value}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <div>
            <Label htmlFor="first_comment">ひとことコメント(任意)</Label>
            <Input
              id="first_comment"
              name="first_comment"
              placeholder="切り替えの声かけを徹底したい"
            />
          </div>

          <Button type="submit" className="w-full">
            クリップを登録
          </Button>
        </form>
      </Card>
    </>
  );
}
