import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import type { Profile } from "@/lib/types";

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m}分${s}秒` : `${m}分`;
  const h = Math.floor(m / 60);
  return `${h}時間${m % 60}分`;
}

// メンバーごとの動画クリップ閲覧状況(アクセス回数・閲覧時間)。
// スタッフ(クリップ管理権限を持つロール)のみ閲覧できる。
export default async function EngagementPage() {
  const { team, membership } = await requireMembership();
  if (!can.createClip(membership)) redirect("/dashboard");
  const supabase = await createClient();

  const [{ data: viewsData }, { data: membersData }] = await Promise.all([
    supabase
      .from("clip_views")
      .select("user_id, dwell_seconds, opened_video")
      .eq("team_id", team.id),
    supabase
      .from("memberships")
      .select("user_id, role, users(name)")
      .eq("team_id", team.id)
      .eq("status", "active"),
  ]);

  const views = (viewsData ?? []) as {
    user_id: string;
    dwell_seconds: number;
    opened_video: boolean;
  }[];

  type Row = {
    user_id: string;
    name: string;
    accesses: number;
    seconds: number;
    videoOpens: number;
  };
  const rows = new Map<string, Row>();
  for (const m of (membersData ?? []) as unknown as {
    user_id: string;
    users: Pick<Profile, "name"> | null;
  }[]) {
    rows.set(m.user_id, {
      user_id: m.user_id,
      name: m.users?.name ?? "不明",
      accesses: 0,
      seconds: 0,
      videoOpens: 0,
    });
  }
  for (const v of views) {
    const r = rows.get(v.user_id);
    if (!r) continue; // 退部済みなどは除外
    r.accesses += 1;
    r.seconds += v.dwell_seconds;
    if (v.opened_video) r.videoOpens += 1;
  }

  const ranked = [...rows.values()].sort(
    (a, b) => b.seconds - a.seconds || b.accesses - a.accesses
  );
  const totalAccesses = ranked.reduce((s, r) => s + r.accesses, 0);

  return (
    <>
      <h1 className="text-lg font-bold">メンバーの視聴状況</h1>
      <p className="text-sm text-slate-500">
        クリップ画面を開いた回数と滞在時間、動画リンクを開いた回数を集計しています。
      </p>

      {totalAccesses === 0 ? (
        <Card className="text-sm text-slate-500">
          まだ閲覧記録がありません。メンバーがクリップを開くと、ここに集計されます。
        </Card>
      ) : (
        <Card className="space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-1.5">メンバー</th>
                  <th className="px-2 py-1.5 text-right">アクセス回数</th>
                  <th className="px-2 py-1.5 text-right">閲覧時間</th>
                  <th className="px-2 py-1.5 text-right">動画を開いた</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r) => (
                  <tr key={r.user_id} className="border-b border-slate-100">
                    <td className="py-1.5 font-medium">{r.name}</td>
                    <td className="px-2 py-1.5 text-right">{r.accesses}回</td>
                    <td className="px-2 py-1.5 text-right font-semibold">
                      {formatDuration(r.seconds)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-slate-500">
                      {r.videoOpens}回
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-400">
            ※ 閲覧時間はクリップ画面の滞在時間です(外部動画の再生時間は計測できません)。
          </p>
        </Card>
      )}
    </>
  );
}
