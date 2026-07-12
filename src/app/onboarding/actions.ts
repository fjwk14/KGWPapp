"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { teamSchema } from "@/lib/validation";

// 招待コードでチームに参加する(選手として)
export async function joinTeam(formData: FormData) {
  const code = String(formData.get("invite_code") ?? "").trim();
  if (!code) {
    redirect(`/onboarding?error=${encodeURIComponent("招待コードを入力してください")}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("join_team_by_code", { p_code: code });
  if (error) {
    redirect(
      `/onboarding?error=${encodeURIComponent("招待コードが正しくありません。部の管理者にコードを確認してください。")}`
    );
  }
  redirect("/dashboard");
}

export async function createTeam(formData: FormData) {
  const parsed = teamSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  });
  if (!parsed.success) {
    redirect(
      `/onboarding?error=${encodeURIComponent(parsed.error.issues[0].message)}`
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // トリガー on_team_created が作成者を admin として登録し、初期タグをシードする
  const { error } = await supabase.from("teams").insert(parsed.data);
  if (error) {
    const message = error.code === "23505"
      ? "そのslugは既に使われています"
      : `チーム作成に失敗しました: ${error.message}`;
    redirect(`/onboarding?error=${encodeURIComponent(message)}`);
  }

  redirect("/dashboard");
}
