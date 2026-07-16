"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/session";
import { composeName, nameSchema } from "@/lib/validation";

// 自分の氏名(漢字フルネーム)をいつでも変更できる
export async function updateProfileName(formData: FormData) {
  const { userId } = await requireMembership();

  const parsed = nameSchema.safeParse({
    family_name: formData.get("family_name"),
    given_name: formData.get("given_name"),
  });
  if (!parsed.success) {
    redirect(`/profile?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }
  const { family_name, given_name } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .update({
      family_name,
      given_name,
      name: composeName(family_name, given_name),
    })
    .eq("id", userId)
    .select("id");
  if (error || !data?.length) {
    redirect(`/profile?error=${encodeURIComponent("更新できませんでした。もう一度お試しください。")}`);
  }
  revalidatePath("/profile");
  redirect("/profile?ok=1");
}

// 自分のメールアドレスを変更する。
// auth(ログイン)側のメールを正規の手順で変更し、確定後にDBトリガー
// (0025)が public.users.email へ同期する。Supabaseの設定により
// 新旧アドレスへ確認メールが届き、リンクを開くと変更が確定する。
export async function updateEmail(formData: FormData) {
  await requireMembership();

  const email = z
    .string()
    .email("メールアドレスの形式が正しくありません")
    .safeParse(String(formData.get("new_email") ?? "").trim().toLowerCase());
  if (!email.success) {
    redirect(`/profile?error=${encodeURIComponent(email.error.issues[0].message)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email: email.data });
  if (error) {
    redirect(
      `/profile?error=${encodeURIComponent(`メール変更に失敗しました: ${error.message}`)}`
    );
  }
  redirect("/profile?ok=email");
}
