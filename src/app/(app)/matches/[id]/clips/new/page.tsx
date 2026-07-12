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
import { matchVideoLabel } from "@/lib/video";
import type { Match, MatchVideo, TagTemplate } from "@/lib/types";
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

  const [{ data: templatesData }, { data: videosData }] = await Promise.all([
    supabase
      .from("tag_templates")
      .select("*")
      .eq("team_id", team.id)
      .eq("is_active", true)
      .order("tag_type")
      .order("sort_order"),
    supabase
      .from("match_videos")
      .select("*")
      .eq("match_id", id)
      .order("quarter", { nullsFirst: false })
      .order("created_at"),
  ]);
  const templates = (templatesData ?? []) as TagTemplate[];
  const videos = (videosData ?? []) as MatchVideo[];

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

          <div>
            <Label htmlFor="video_id">対象の動画</Label>
            {videos.length > 0 ? (
              <>
                <Select id="video_id" name="video_id" defaultValue={videos[0].id}>
                  {videos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {matchVideoLabel(v)}
                    </option>
                  ))}
                  <option value="">紐づけない(あとで設定)</option>
                </Select>
                <p className="mt-1 text-xs text-slate-400">
                  開始・終了はこの動画内の時間を入力してください
                </p>
              </>
            ) : (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                動画が未登録です。試合詳細の「試合動画」から追加すると、
                該当場面へのリンクが使えるようになります(クリップは動画なしでも作成できます)。
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>開始 *</Label>
              <div className="flex items-center gap-1">
                <Input
                  name="start_min"
                  type="number"
                  min={0}
                  required
                  inputMode="numeric"
                  placeholder="10"
                  aria-label="開始 分"
                />
                <span className="text-sm text-slate-500">分</span>
                <Input
                  name="start_sec"
                  type="number"
                  min={0}
                  max={59}
                  required
                  inputMode="numeric"
                  placeholder="15"
                  aria-label="開始 秒"
                />
                <span className="text-sm text-slate-500">秒</span>
              </div>
            </div>
            <div>
              <Label>終了 *</Label>
              <div className="flex items-center gap-1">
                <Input
                  name="end_min"
                  type="number"
                  min={0}
                  required
                  inputMode="numeric"
                  placeholder="10"
                  aria-label="終了 分"
                />
                <span className="text-sm text-slate-500">分</span>
                <Input
                  name="end_sec"
                  type="number"
                  min={0}
                  max={59}
                  required
                  inputMode="numeric"
                  placeholder="45"
                  aria-label="終了 秒"
                />
                <span className="text-sm text-slate-500">秒</span>
              </div>
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
