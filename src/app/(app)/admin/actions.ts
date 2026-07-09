"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/session";
import { can } from "@/lib/permissions";
import { tagTemplateSchema } from "@/lib/validation";
import { z } from "zod";

const ROLES = ["player", "manager", "tactical_staff", "executive", "captain", "admin"] as const;
const STATUSES = ["active", "inactive", "graduated", "removed"] as const;

function backTo(path: string, error?: string): never {
  redirect(error ? `${path}?error=${encodeURIComponent(error)}` : path);
}

async function requireAdmin() {
  const ctx = await requireMembership();
  if (!can.manageTeam(ctx.membership.role)) {
    backTo("/dashboard", "管理者権限が必要です");
  }
  return ctx;
}

export async function addMember(formData: FormData) {
  const { team } = await requireAdmin();

  const email = z.string().email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  const role = z.enum(ROLES).safeParse(formData.get("role"));
  if (!email.success) backTo("/admin", "メールアドレスの形式が正しくありません");
  if (!role.success) backTo("/admin", "不正なロールです");

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_member_by_email", {
    p_team_id: team.id,
    p_email: email.data,
    p_role: role.data,
  });
  if (error) {
    const message = error.message.includes("user not found")
      ? "そのメールアドレスのユーザーが見つかりません。先に本人がサインアップする必要があります。"
      : `追加に失敗しました: ${error.message}`;
    backTo("/admin", message);
  }
  revalidatePath("/admin");
  backTo("/admin");
}

export async function updateMember(formData: FormData) {
  const { team } = await requireAdmin();
  const membershipId = String(formData.get("membership_id"));
  const role = z.enum(ROLES).safeParse(formData.get("role"));
  const status = z.enum(STATUSES).safeParse(formData.get("status"));
  if (!role.success || !status.success) backTo("/admin", "不正な入力です");

  const supabase = await createClient();

  // 最後のadminを降格・非アクティブ化するとチーム管理が不可能になるため防ぐ
  const losesAdmin = role.data !== "admin" || status.data !== "active";
  if (losesAdmin) {
    const { data: admins } = await supabase
      .from("memberships")
      .select("id")
      .eq("team_id", team.id)
      .eq("role", "admin")
      .eq("status", "active");
    const remaining = (admins ?? []).filter((m) => m.id !== membershipId);
    const wasAdmin = (admins ?? []).some((m) => m.id === membershipId);
    if (wasAdmin && remaining.length === 0) {
      backTo("/admin", "最後の管理者は降格できません。先に別の管理者を任命してください。");
    }
  }

  const { data, error } = await supabase
    .from("memberships")
    .update({ role: role.data, status: status.data })
    .eq("id", membershipId)
    .select("id");
  if (error || !data?.length) {
    backTo("/admin", "更新できませんでした(権限がない可能性があります)");
  }
  revalidatePath("/admin");
  backTo("/admin");
}

export async function addTagTemplate(formData: FormData) {
  const { team } = await requireAdmin();

  const parsed = tagTemplateSchema.safeParse({
    tag_type: formData.get("tag_type"),
    tag_value: formData.get("tag_value"),
    description: formData.get("description") ?? undefined,
  });
  if (!parsed.success) {
    backTo("/admin/tags", parsed.error.issues[0].message);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tag_templates").insert({
    ...parsed.data,
    team_id: team.id,
  });
  if (error) {
    const message =
      error.code === "23505"
        ? "同じタグが既に存在します"
        : `追加に失敗しました: ${error.message}`;
    backTo("/admin/tags", message);
  }
  revalidatePath("/admin/tags");
  backTo("/admin/tags");
}

export async function renameTagTemplate(formData: FormData) {
  await requireAdmin();
  const templateId = String(formData.get("template_id"));
  const value = z
    .string()
    .trim()
    .min(1, "タグ名を入力してください")
    .max(60, "タグ名は60文字以内です")
    .safeParse(formData.get("tag_value"));
  if (!value.success) backTo("/admin/tags", value.error.issues[0].message);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tag_templates")
    .update({ tag_value: value.data })
    .eq("id", templateId)
    .select("id");
  if (error) {
    backTo(
      "/admin/tags",
      error.code === "23505"
        ? "同じ種別に同名のタグが既にあります"
        : "変更できませんでした(権限がない可能性があります)"
    );
  }
  if (!data?.length) {
    backTo("/admin/tags", "変更できませんでした(権限がない可能性があります)");
  }
  revalidatePath("/admin/tags");
  backTo("/admin/tags");
}

export async function deleteTagTemplate(formData: FormData) {
  await requireAdmin();
  const templateId = String(formData.get("template_id"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tag_templates")
    .delete()
    .eq("id", templateId)
    .select("id");
  if (error || !data?.length) {
    backTo("/admin/tags", "削除できませんでした(権限がない可能性があります)");
  }
  revalidatePath("/admin/tags");
  backTo("/admin/tags");
}
