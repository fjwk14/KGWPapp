import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Button,
  Card,
  ErrorBanner,
  Input,
  LinkButton,
  TagBadge,
} from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { formatSeconds, safeHttpUrl } from "@/lib/video";
import type { ClipTag, Match, VideoClip } from "@/lib/types";
import { updateVideoUrl } from "../actions";

export default async function MatchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { membership } = await requireMembership();
  const supabase = await createClient();

  const { data: match } = await supabase
    .from("matches")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!match) notFound();
  const m = match as Match;

  const { data: clipsData } = await supabase
    .from("video_clips")
    .select("*")
    .eq("match_id", id)
    .order("start_time_seconds");
  const clips = (clipsData ?? []) as VideoClip[];

  let allTags: ClipTag[] = [];
  if (clips.length > 0) {
    const { data: tagsData } = await supabase
      .from("clip_tags")
      .select("*")
      .in(
        "clip_id",
        clips.map((c) => c.id)
      );
    allTags = (tagsData ?? []) as ClipTag[];
  }
  const isStaff = can.createClip(membership.role);

  return (
    <>
      <ErrorBanner message={error} />
      <Card>
        <h1 className="text-lg font-bold">{m.title}</h1>
        <p className="text-sm text-slate-500">
          {m.match_date ?? "日付未設定"}
          {m.opponent ? ` / vs ${m.opponent}` : ""}
          {m.competition ? ` / ${m.competition}` : ""}
        </p>
        {m.score_for != null && m.score_against != null && (
          <p className="mt-1 text-xl font-bold">
            {m.score_for} - {m.score_against}
            <span className="ml-2 text-sm font-normal text-slate-500">
              {m.result === "win" ? "勝ち" : m.result === "lose" ? "負け" : m.result === "draw" ? "引き分け" : ""}
            </span>
          </p>
        )}
        {m.notes && <p className="mt-2 text-sm text-slate-600">{m.notes}</p>}

        <div className="mt-3 border-t border-slate-100 pt-3">
          {safeHttpUrl(m.video_url) ? (
            <a
              href={safeHttpUrl(m.video_url)!}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-brand-600 underline"
            >
              🎥 試合動画を開く
            </a>
          ) : (
            <p className="text-sm text-slate-400">動画URL未登録</p>
          )}
          {isStaff && (
            <form action={updateVideoUrl} className="mt-2 flex gap-2">
              <input type="hidden" name="match_id" value={m.id} />
              <Input
                name="video_url"
                type="url"
                defaultValue={m.video_url ?? ""}
                placeholder="https://www.youtube.com/watch?v=..."
                className="flex-1 text-sm"
              />
              <Button type="submit" variant="secondary" className="shrink-0">
                保存
              </Button>
            </form>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <LinkButton href={`/matches/${m.id}/stats`} className="bg-slate-700 hover:bg-slate-800">
          📊 タグ集計
        </LinkButton>
        <LinkButton href={`/matches/${m.id}/report`} className="bg-emerald-600 hover:bg-emerald-700">
          🤖 AIレポート
        </LinkButton>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-600">
            クリップ({clips.length}件)
          </h2>
          {isStaff && (
            <LinkButton
              href={`/matches/${m.id}/clips/new`}
              className="min-h-9 px-3 text-xs"
            >
              + クリップ作成
            </LinkButton>
          )}
        </div>

        {clips.length === 0 && (
          <Card className="text-sm text-slate-500">
            まだクリップがありません。気になった場面をタイムスタンプ付きで登録しましょう。
          </Card>
        )}

        {clips.map((clip) => {
          const clipTags = allTags.filter((t) => t.clip_id === clip.id);
          return (
            <Link key={clip.id} href={`/clips/${clip.id}`} className="block">
              <Card className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{clip.title}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono">
                    {clip.quarter ? `Q${clip.quarter} ` : ""}
                    {formatSeconds(clip.start_time_seconds)}〜
                    {formatSeconds(clip.end_time_seconds)}
                  </span>
                </div>
                {clipTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {clipTags.map((t) => (
                      <TagBadge key={t.id} tagType={t.tag_type}>
                        {t.tag_value}
                      </TagBadge>
                    ))}
                  </div>
                )}
                {clip.description && (
                  <p className="text-xs text-slate-500">{clip.description}</p>
                )}
              </Card>
            </Link>
          );
        })}
      </section>
    </>
  );
}
