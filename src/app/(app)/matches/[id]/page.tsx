import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Button,
  Card,
  ErrorBanner,
  Input,
  LinkButton,
  Select,
  TagBadge,
} from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { formatSeconds, matchVideoLabel, safeHttpUrl } from "@/lib/video";
import type { ClipTag, Match, MatchVideo, VideoClip } from "@/lib/types";
import { addMatchVideo, deleteMatchVideo } from "../actions";

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

  const [{ data: videosData }, { data: clipsData }] = await Promise.all([
    supabase
      .from("match_videos")
      .select("*")
      .eq("match_id", id)
      .order("quarter", { nullsFirst: false })
      .order("created_at"),
    supabase
      .from("video_clips")
      .select("*")
      .eq("match_id", id)
      .order("start_time_seconds"),
  ]);
  const videos = (videosData ?? []) as MatchVideo[];
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
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-lg font-bold">{m.title}</h1>
          {isStaff && (
            <Link
              href={`/matches/${m.id}/edit`}
              className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              ✏️ 編集
            </Link>
          )}
        </div>
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
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <LinkButton href={`/matches/${m.id}/stats`} className="bg-slate-700 hover:bg-slate-800">
          📊 タグ集計
        </LinkButton>
        <LinkButton href={`/matches/${m.id}/report`} className="bg-emerald-600 hover:bg-emerald-700">
          🤖 AIレポート
        </LinkButton>
        <LinkButton href={`/matches/${m.id}/scoresheet`} className="bg-indigo-600 hover:bg-indigo-700">
          📈 スタッツ表
        </LinkButton>
        {can.recordStats(membership.role) && (
          <LinkButton href={`/matches/${m.id}/live`} className="bg-rose-600 hover:bg-rose-700">
            ⏱ リアルタイム入力
          </LinkButton>
        )}
      </div>

      {/* 試合動画: 後日共有されてからクオーター単位で添付する */}
      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">
          試合動画({videos.length}本)
        </h2>
        {videos.length === 0 && (
          <p className="text-sm text-slate-400">
            動画はまだありません。共有されたら、あとからここに追加できます
            (スタッツの記録は動画がなくても先にできます)。
          </p>
        )}
        <ul className="space-y-1.5">
          {videos.map((v) => {
            const url = safeHttpUrl(v.url);
            return (
              <li key={v.id} className="flex items-center gap-2">
                <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold">
                  {matchVideoLabel(v)}
                </span>
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate text-sm text-brand-600 underline"
                  >
                    🎥 動画を開く
                  </a>
                ) : (
                  <span className="flex-1 text-sm text-slate-400">URL不正</span>
                )}
                {isStaff && (
                  <form action={deleteMatchVideo}>
                    <input type="hidden" name="match_id" value={m.id} />
                    <input type="hidden" name="video_id" value={v.id} />
                    <button
                      className="shrink-0 px-2 text-xs text-slate-400 hover:text-red-600"
                      aria-label={`${matchVideoLabel(v)}を削除`}
                    >
                      削除
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
        {isStaff && (
          <form
            action={addMatchVideo}
            className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3"
          >
            <input type="hidden" name="match_id" value={m.id} />
            <Select name="quarter" defaultValue="" className="w-24 shrink-0 text-sm">
              <option value="">フル</option>
              <option value="1">Q1</option>
              <option value="2">Q2</option>
              <option value="3">Q3</option>
              <option value="4">Q4</option>
              <option value="5">PSO</option>
            </Select>
            <Input
              name="url"
              type="url"
              required
              placeholder="https://www.youtube.com/watch?v=..."
              className="min-w-0 flex-1 text-sm"
            />
            <Button type="submit" variant="secondary" className="shrink-0">
              追加
            </Button>
          </form>
        )}
      </Card>

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
                    {clip.quarter === 5 ? "PSO " : clip.quarter ? `Q${clip.quarter} ` : ""}
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
