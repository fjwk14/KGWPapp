"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/session";
import { can } from "@/lib/permissions";
import { PHYSICAL_METRICS } from "@/lib/physical";

function backTo(path: string, error?: string): never {
  redirect(error ? `${path}?error=${encodeURIComponent(error)}` : path);
}

// スタッフ(マネージャー・管理者)が選手のフィジカル測定値をまとめて記録する。
// 空欄の項目はスキップし、入力された項目だけ physical_measurements に複数行insertする。
export async function recordPhysicalMeasurements(formData: FormData) {
  const { team, userId, membership } = await requireMembership();
  if (!can.recordPhysical(membership)) {
    backTo("/physical", "測定値の記録には権限が必要です(マネージャー以上)");
  }

  const targetUser = z.string().uuid().safeParse(formData.get("user_id"));
  if (!targetUser.success) backTo("/physical", "選手を選択してください");

  const rawDate = String(formData.get("measured_on") ?? "").trim();
  const measuredOn = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? rawDate
    : new Date().toISOString().slice(0, 10);

  const rows: {
    team_id: string;
    user_id: string;
    measured_on: string;
    metric: string;
    value: number;
    created_by: string;
  }[] = [];

  for (const metric of PHYSICAL_METRICS) {
    const raw = String(formData.get(metric.key) ?? "").trim();
    if (raw === "") continue;
    const parsed = z.coerce.number().finite().safeParse(raw);
    if (!parsed.success) {
      backTo("/physical", `${metric.label}は数値で入力してください`);
    }
    rows.push({
      team_id: team.id,
      user_id: targetUser.data,
      measured_on: measuredOn,
      metric: metric.key,
      value: parsed.data,
      created_by: userId,
    });
  }

  if (rows.length === 0) {
    backTo("/physical", "少なくとも1項目は入力してください");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("physical_measurements").insert(rows);
  if (error) {
    backTo("/physical", `記録に失敗しました: ${error.message}`);
  }

  revalidatePath("/physical");
  revalidatePath(`/physical/${targetUser.data}`);
  backTo("/physical");
}

// 記録済みの測定値を1件編集する(スタッフのみ)。
export async function updatePhysicalMeasurement(formData: FormData) {
  const { membership } = await requireMembership();
  if (!can.recordPhysical(membership)) {
    backTo("/physical", "測定値の編集には権限が必要です(マネージャー以上)");
  }

  const id = z.string().uuid().safeParse(formData.get("measurement_id"));
  const targetUser = z.string().uuid().safeParse(formData.get("user_id"));
  if (!id.success || !targetUser.success) {
    backTo("/physical", "不正な入力です");
  }

  const backPath = `/physical/${targetUser.data}`;
  const parsed = z.coerce
    .number()
    .finite()
    .safeParse(String(formData.get("value") ?? "").trim());
  if (!parsed.success) backTo(backPath, "数値で入力してください");

  const rawDate = String(formData.get("measured_on") ?? "").trim();
  const patch: { value: number; measured_on?: string } = { value: parsed.data };
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) patch.measured_on = rawDate;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("physical_measurements")
    .update(patch)
    .eq("id", id.data)
    .select("id");
  if (error || !data?.length) {
    backTo(backPath, "更新できませんでした(権限がない可能性があります)");
  }

  revalidatePath("/physical");
  revalidatePath(backPath);
  backTo(`${backPath}?ok=1`);
}

// 記録済みの測定値を1件削除する(スタッフのみ)。
export async function deletePhysicalMeasurement(formData: FormData) {
  const { membership } = await requireMembership();
  if (!can.recordPhysical(membership)) {
    backTo("/physical", "測定値の削除には権限が必要です(マネージャー以上)");
  }

  const id = z.string().uuid().safeParse(formData.get("measurement_id"));
  const targetUser = z.string().uuid().safeParse(formData.get("user_id"));
  if (!id.success || !targetUser.success) {
    backTo("/physical", "不正な入力です");
  }
  const backPath = `/physical/${targetUser.data}`;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("physical_measurements")
    .delete()
    .eq("id", id.data)
    .select("id");
  if (error || !data?.length) {
    backTo(backPath, "削除できませんでした(権限がない可能性があります)");
  }

  revalidatePath("/physical");
  revalidatePath(backPath);
  backTo(`${backPath}?ok=1`);
}
