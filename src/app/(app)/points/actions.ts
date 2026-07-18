"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/session";
import { can } from "@/lib/permissions";

function backTo(path: string, error?: string): never {
  redirect(error ? `${path}?error=${encodeURIComponent(error)}` : path);
}

// アプリ外の貢献(大会運営の手伝い・後輩指導など)を理由付きで手動評価する。
// 幹部・主将・管理者のみ。誰が見ても理由が分かるようチーム内に公開する。
export async function grantPoints(formData: FormData) {
  const { team, userId, membership } = await requireMembership();
  if (!can.grantPoints(membership)) {
    backTo("/points", "ポイント付与には権限が必要です(幹部・主将・管理者)");
  }

  const targetUserId = z.string().uuid().safeParse(formData.get("user_id"));
  const points = z.coerce.number().int().min(1).max(50).safeParse(formData.get("points"));
  const reason = String(formData.get("reason") ?? "").trim();

  if (!targetUserId.success) backTo("/points", "対象メンバーを選んでください");
  if (!points.success) backTo("/points", "ポイントは1〜50で入力してください");
  if (!reason) backTo("/points", "理由を入力してください");

  const supabase = await createClient();
  const { error } = await supabase.from("point_grants").insert({
    team_id: team.id,
    user_id: targetUserId.data,
    granted_by: userId,
    points: points.data,
    reason: reason.slice(0, 300),
  });
  if (error) backTo("/points", `付与に失敗しました: ${error.message}`);

  revalidatePath("/points");
  backTo("/points?ok=1");
}

// 誤付与の取り消し(付与者本人 or 管理者。RLS側も同じ制限)
export async function revokePointGrant(formData: FormData) {
  await requireMembership();
  const id = z.string().uuid().safeParse(formData.get("grant_id"));
  if (!id.success) backTo("/points", "不正なリクエストです");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("point_grants")
    .delete()
    .eq("id", id.data)
    .select("id");
  if (error || !data?.length) {
    backTo("/points", "取り消せませんでした(権限がない可能性があります)");
  }

  revalidatePath("/points");
  backTo("/points?ok=1");
}
