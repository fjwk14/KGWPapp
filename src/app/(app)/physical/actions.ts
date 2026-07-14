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
  if (!can.recordPhysical(membership.role)) {
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
