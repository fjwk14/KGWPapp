import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, TagBadge, TAG_TYPE_LABELS } from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { ClipTag, Match, VideoClip } from "@/lib/types";

// 試合単位のタグ集計。タグ種別ごとに件数を可視化する。
export default async function TagStatsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireMembership();
  const supabase = await createClient();

  const { data: matchData } = await supabase
    .from("matches")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();
  if (!matchData) notFound();
  const match = matchData as Pick<Match, "id" | "title">;

  const { data: clipsData } = await supabase
    .from("video_clips")
    .select("id")
    .eq("match_id", id);
  const clipIds = ((clipsData ?? []) as Pick<VideoClip, "id">[]).map((c) => c.id);

  let tags: ClipTag[] = [];
  if (clipIds.length > 0) {
    const { data: tagsData } = await supabase
      .from("clip_tags")
      .select("*")
      .in("clip_id", clipIds);
    tags = (tagsData ?? []) as ClipTag[];
  }

  const byType = tags.reduce<Record<string, Record<string, number>>>((acc, t) => {
    (acc[t.tag_type] ??= {})[t.tag_value] =
      ((acc[t.tag_type] ?? {})[t.tag_value] ?? 0) + 1;
    return acc;
  }, {});

  const maxCount = Math.max(
    1,
    ...Object.values(byType).flatMap((v) => Object.values(v))
  );

  return (
    <>
      <Link href={`/matches/${id}`} className="text-xs text-brand-600 underline">
        ← {match.title}
      </Link>
      <h1 className="text-lg font-bold">タグ集計</h1>
      <p className="text-sm text-slate-500">
        クリップ{clipIds.length}件 / タグ{tags.length}件
      </p>

      {tags.length === 0 && (
        <Card className="text-sm text-slate-500">
          クリップにタグを付けると集計が表示されます
        </Card>
      )}

      {Object.entries(byType).map(([tagType, values]) => (
        <Card key={tagType} className="space-y-2">
          <h2 className="text-sm font-semibold">
            <TagBadge tagType={tagType}>{TAG_TYPE_LABELS[tagType] ?? tagType}</TagBadge>
          </h2>
          <div className="space-y-1.5">
            {Object.entries(values)
              .sort((a, b) => b[1] - a[1])
              .map(([value, n]) => (
                <div key={value} className="flex items-center gap-2 text-sm">
                  <span className="w-28 shrink-0 truncate">{value}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                    <div
                      className="h-full rounded bg-brand-500"
                      style={{ width: `${(n / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right font-semibold">{n}</span>
                </div>
              ))}
          </div>
        </Card>
      ))}
    </>
  );
}
