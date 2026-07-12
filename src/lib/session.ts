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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("id, email, name, avatar_url")
    .eq("id", user.id)
    .single();

  // 複数チーム所属時は最初に参加したチームを一貫して使う
  // (MVPはシングルチーム前提。チーム切替UIは将来対応)
  const { data: membership } = await supabase
    .from("memberships")
    .select("id, team_id, user_id, role, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

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
