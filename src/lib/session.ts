import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Membership, Profile, Team } from "@/lib/types";

export interface SessionContext {
  userId: string;
  profile: Profile;
  membership: Membership;
  team: Team;
}

// ログイン済み + アクティブなチーム所属を要求する。
// 未ログイン → /login、未所属 → /onboarding にリダイレクト。
// React cache()でリクエスト内の重複呼び出し(layout + page)を1回に集約。
export const requireMembership = cache(async (): Promise<SessionContext> => {
  const supabase = await createClient();
  // getUser()ではなくgetSession()を使う: このリクエストはミドルウェアの
  // updateSession()で既にgetUser()による認証サーバーへの検証を通過済みなので、
  // ここでの再検証(ネットワーク往復)は省略し、cookieのセッションをそのまま信頼する。
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  if (!user) redirect("/login");

  // プロフィールとメンバーシップは互いに依存しないため並列取得し、
  // 直列往復を1回分減らす(認証チェックは全ページ・全Server Actionで走るため効果が大きい)。
  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase
      .from("users")
      .select("id, email, name, family_name, given_name, avatar_url")
      .eq("id", user.id)
      .single(),
    // 複数チーム所属時は最初に参加したチームを一貫して使う
    // (MVPはシングルチーム前提。チーム切替UIは将来対応)
    supabase
      .from("memberships")
      .select("id, team_id, user_id, role, secondary_role, status, cap_number, is_gk")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!membership) redirect("/onboarding");

  const { data: team } = await supabase
    .from("teams")
    .select("id, name, slug, sport, logo_url, primary_color, invite_code")
    .eq("id", membership.team_id)
    .single();

  if (!team) redirect("/onboarding");

  return {
    userId: user.id,
    profile: profile as Profile,
    membership: membership as Membership,
    team: team as Team,
  };
});
