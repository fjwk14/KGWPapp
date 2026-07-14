"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/session";
import { can } from "@/lib/permissions";

const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;

function backTo(path: string, error?: string): never {
  redirect(error ? `${path}?error=${encodeURIComponent(error)}` : path);
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

function cleanText(v: FormDataEntryValue | null, max = 4000): string | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  return s.slice(0, max);
}

// 練習を新規作成し、在籍メンバー全員の出欠を「出席」で初期化する。
// マネージャーは詳細画面で欠席者だけを切り替えれば済む。
export async function createPractice(formData: FormData) {
  const { team, userId, membership } = await requireMembership();
  if (!can.recordPractice(membership)) {
    backTo("/practices", "練習の記録には権限が必要です(マネージャー以上)");
  }

  const rawDate = String(formData.get("practice_date") ?? "").trim();
  const practiceDate = dateRe.test(rawDate)
    ? rawDate
    : new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  const { data: practice, error } = await supabase
    .from("practices")
    .insert({
      team_id: team.id,
      practice_date: practiceDate,
      start_time: cleanText(formData.get("start_time"), 20),
      end_time: cleanText(formData.get("end_time"), 20),
      location: cleanText(formData.get("location"), 200),
      menu: cleanText(formData.get("menu")),
      note: cleanText(formData.get("note")),
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !practice) {
    backTo("/practices", `練習の記録に失敗しました: ${error?.message ?? ""}`);
  }

  // 在籍メンバーを既定「出席」で登録(欠席者は詳細画面で切り替える)
  const { data: members } = await supabase
    .from("memberships")
    .select("user_id")
    .eq("team_id", team.id)
    .eq("status", "active");
  const rows = (members ?? []).map((m) => ({
    practice_id: practice.id,
    team_id: team.id,
    user_id: m.user_id,
    status: "present" as const,
  }));
  if (rows.length > 0) {
    await supabase.from("practice_attendances").insert(rows);
  }

  revalidatePath("/practices");
  redirect(`/practices/${practice.id}`);
}

export async function updatePractice(formData: FormData) {
  const { membership } = await requireMembership();
  if (!can.recordPractice(membership)) {
    backTo("/practices", "練習の編集には権限が必要です(マネージャー以上)");
  }

  const practiceId = z.string().uuid().safeParse(formData.get("practice_id"));
  if (!practiceId.success) backTo("/practices", "不正な練習IDです");

  const rawDate = String(formData.get("practice_date") ?? "").trim();
  const practiceDate = dateRe.test(rawDate)
    ? rawDate
    : new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("practices")
    .update({
      practice_date: practiceDate,
      start_time: cleanText(formData.get("start_time"), 20),
      end_time: cleanText(formData.get("end_time"), 20),
      location: cleanText(formData.get("location"), 200),
      menu: cleanText(formData.get("menu")),
      note: cleanText(formData.get("note")),
    })
    .eq("id", practiceId.data)
    .select("id");
  if (error || !data?.length) {
    backTo(
      `/practices/${practiceId.data}`,
      "更新できませんでした(権限がない可能性があります)"
    );
  }

  revalidatePath("/practices");
  revalidatePath(`/practices/${practiceId.data}`);
  backTo(`/practices/${practiceId.data}?ok=1`);
}

// 出欠を一括保存(status_<userId> を各メンバー分まとめて upsert する)
export async function saveAttendance(formData: FormData) {
  const { team, membership } = await requireMembership();
  if (!can.recordPractice(membership)) {
    backTo("/practices", "出欠の記録には権限が必要です(マネージャー以上)");
  }

  const practiceId = z.string().uuid().safeParse(formData.get("practice_id"));
  if (!practiceId.success) backTo("/practices", "不正な練習IDです");

  const memberIds = String(formData.get("member_ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const rows = memberIds.map((userId) => {
    const raw = String(formData.get(`status_${userId}`) ?? "present");
    const status = (ATTENDANCE_STATUSES as readonly string[]).includes(raw)
      ? raw
      : "present";
    return {
      practice_id: practiceId.data,
      team_id: team.id,
      user_id: userId,
      status,
    };
  });

  const supabase = await createClient();
  if (rows.length > 0) {
    const { error } = await supabase
      .from("practice_attendances")
      .upsert(rows, { onConflict: "practice_id,user_id" });
    if (error) {
      backTo(`/practices/${practiceId.data}`, `保存に失敗しました: ${error.message}`);
    }
  }

  revalidatePath(`/practices/${practiceId.data}`);
  revalidatePath("/practices");
  backTo(`/practices/${practiceId.data}?ok=1`);
}

export async function deletePractice(formData: FormData) {
  const { membership } = await requireMembership();
  if (!can.recordPractice(membership)) {
    backTo("/practices", "練習の削除には権限が必要です(マネージャー以上)");
  }
  const practiceId = z.string().uuid().safeParse(formData.get("practice_id"));
  if (!practiceId.success) backTo("/practices", "不正な練習IDです");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("practices")
    .delete()
    .eq("id", practiceId.data)
    .select("id");
  if (error || !data?.length) {
    backTo(
      `/practices/${practiceId.data}`,
      "削除できませんでした(権限がない可能性があります)"
    );
  }
  revalidatePath("/practices");
  redirect("/practices");
}
