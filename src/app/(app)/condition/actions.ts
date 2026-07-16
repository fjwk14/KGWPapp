"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/session";
import { todayJST } from "@/lib/condition";

function backTo(path: string, error?: string): never {
  redirect(error ? `${path}?error=${encodeURIComponent(error)}` : path);
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

// リダイレクト先はアプリ内パスのみ許可(オープンリダイレクト防止)
function safeRedirectTo(raw: FormDataEntryValue | null): string {
  const s = String(raw ?? "");
  return s.startsWith("/") && !s.startsWith("//") ? s : "/me";
}

// その日のコンディションを記録する(1人1日1行・upsertで上書き修正可)。
// 書けるのは常に「自分の分」だけ(RLSでも強制)。
export async function submitConditionLog(formData: FormData) {
  const { team, userId } = await requireMembership();
  const back = safeRedirectTo(formData.get("redirect_to"));

  const rawDate = String(formData.get("log_date") ?? "").trim();
  const logDate = dateRe.test(rawDate) ? rawDate : todayJST();

  const scale5 = z.coerce.number().int().min(1).max(5);
  const condition = scale5.safeParse(formData.get("condition"));
  const motivation = scale5.safeParse(formData.get("motivation"));
  if (!condition.success || !motivation.success) {
    backTo(back, "調子とやる気を選んでください");
  }

  const rawSleep = String(formData.get("sleep_hours") ?? "").trim();
  let sleepHours: number | null = null;
  if (rawSleep !== "") {
    const n = Number(rawSleep);
    if (!Number.isFinite(n) || n < 0 || n > 24) {
      backTo(back, "睡眠時間は0〜24時間で入力してください");
    }
    sleepHours = Math.round(n * 10) / 10;
  }

  const painParsed = z.coerce.number().int().min(0).max(3).safeParse(
    formData.get("pain_level")
  );
  const painLevel = painParsed.success ? painParsed.data : 0;
  const painNote =
    painLevel > 0
      ? String(formData.get("pain_note") ?? "").trim().slice(0, 200) || null
      : null;

  const supabase = await createClient();
  const { error } = await supabase.from("condition_logs").upsert(
    {
      team_id: team.id,
      user_id: userId,
      log_date: logDate,
      condition: condition.data,
      motivation: motivation.data,
      sleep_hours: sleepHours,
      pain_level: painLevel,
      pain_note: painNote,
    },
    { onConflict: "user_id,log_date" }
  );
  if (error) {
    backTo(back, `記録に失敗しました: ${error.message}`);
  }

  revalidatePath(back);
  revalidatePath(`/condition/${userId}`);
  backTo(`${back}${back.includes("?") ? "&" : "?"}ok=1`);
}
