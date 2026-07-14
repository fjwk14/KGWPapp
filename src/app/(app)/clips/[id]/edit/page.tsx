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
import { matchVideoLabel } from "@/lib/video";
import type { MatchVideo, VideoClip } from "@/lib/types";
import { updateClip } from "../../actions";

export default async function EditClipPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { membership } = await requireMembership();
  if (!can.createClip(membership)) redirect(`/clips/${id}`);

  const supabase = await createClient();
  const { data: clip } = await supabase
    .from("video_clips")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!clip) notFound();
  const c = clip as VideoClip;

  const { data: videosData } = await supabase
    .from("match_videos")
    .select("*")
    .eq("match_id", c.match_id)
    .order("quarter", { nullsFirst: false })
    .order("created_at");
  const videos = (videosData ?? []) as MatchVideo[];

  const startMin = Math.floor(c.start_time_seconds / 60);
  const startSec = c.start_time_seconds % 60;
  const endMin = Math.floor(c.end_time_seconds / 60);
  const endSec = c.end_time_seconds % 60;

  return (
    <>
      <Link href={`/clips/${id}`} className="text-xs text-brand-600 underline">
        ← クリップ詳細に戻る
      </Link>
      <h1 className="text-lg font-bold">クリップを編集</h1>
      <Card className="space-y-4">
        <ErrorBanner message={error} />
        <form action={updateClip} className="space-y-4">
          <input type="hidden" name="clip_id" value={c.id} />

          <div>
            <Label htmlFor="title">場面タイトル *</Label>
            <Input id="title" name="title" required defaultValue={c.title} />
          </div>

          {videos.length > 0 && (
            <div>
              <Label htmlFor="video_id">対象の動画</Label>
              <Select id="video_id" name="video_id" defaultValue={c.video_id ?? ""}>
                {videos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {matchVideoLabel(v)}
                  </option>
                ))}
                <option value="">紐づけない</option>
              </Select>
            </div>
          )}

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
                  defaultValue={startMin}
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
                  defaultValue={startSec}
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
                  defaultValue={endMin}
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
                  defaultValue={endSec}
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
              defaultValue={c.description ?? ""}
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" className="flex-1">
              保存する
            </Button>
            <Link
              href={`/clips/${id}`}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
            >
              キャンセル
            </Link>
          </div>
        </form>
      </Card>
      <p className="text-xs text-slate-400">
        ※ タグとコメントはクリップ詳細画面で編集できます。
      </p>
    </>
  );
}
