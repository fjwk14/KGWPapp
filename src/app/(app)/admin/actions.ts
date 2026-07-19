"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/session";
import { can } from "@/lib/permissions";
import { tagTemplateSchema } from "@/lib/validation";
import { z } from "zod";

const ROLES = ["player", "manager", "tactical_staff", "analysis_team", "gakuren", "executive", "captain", "admin"] as const;
const STATUSES = ["active", "inactive", "graduated", "removed"] as const;

function backTo(path: string, error?: string): never {
  redirect(error ? `${path}?error=${encodeURIComponent(error)}` : path);
}

async function requireAdmin() {
  const ctx = await requireMembership();
  if (!can.manageTeam(ctx.membership)) {
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

// チームロゴ(teams.logo_url)の設定。他大学・他チームへの展開を見据え、
// 色はいじらずロゴ画像URLのみを設定できるようにする(0001から未使用だった列の活用)。
export async function updateTeamBranding(formData: FormData) {
  const { team } = await requireAdmin();

  const raw = String(formData.get("logo_url") ?? "").trim();
  let logoUrl: string | null = null;
  if (raw !== "") {
    const parsed = z.string().url().max(2000).safeParse(raw);
    if (!parsed.success) backTo("/admin", "ロゴ画像のURLが正しくありません");
    logoUrl = parsed.data;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("teams")
    .update({ logo_url: logoUrl })
    .eq("id", team.id);
  if (error) backTo("/admin", "ロゴの更新に失敗しました");

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  backTo("/admin?ok=1");
}

export async function regenerateInviteCode() {
  const { team } = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("regenerate_invite_code", {
    p_team_id: team.id,
  });
  if (error) backTo("/admin", "招待コードの再発行に失敗しました");
  revalidatePath("/admin");
  backTo("/admin");
}

interface ParsedMemberUpdate {
  membershipId: string;
  role: (typeof ROLES)[number];
  status: (typeof STATUSES)[number];
  secondaryRole: string | null;
  capNumber: number | null;
  isGk: boolean;
  fieldPosition: number | null;
  secondaryFieldPosition: number | null;
  enrollmentYear: number | null;
}

export async function bulkUpdateMembers(formData: FormData) {
  const { team } = await requireAdmin();

  const memberIds = String(formData.get("member_ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (memberIds.length === 0) backTo("/admin", "更新対象がありません");

  const updates: ParsedMemberUpdate[] = [];
  for (const membershipId of memberIds) {
    const role = z.enum(ROLES).safeParse(formData.get(`role_${membershipId}`));
    const status = z.enum(STATUSES).safeParse(formData.get(`status_${membershipId}`));
    if (!role.success || !status.success) backTo("/admin", "不正な入力です");

    // 役職の併用は全ロール可(0016)。primaryと同じ役職・adminの併用のみ弾く
    const rawSecondary = String(formData.get(`secondary_role_${membershipId}`) ?? "");
    const secondaryParsed = z.enum(ROLES).safeParse(rawSecondary);
    const secondaryRole: string | null =
      secondaryParsed.success &&
      secondaryParsed.data !== role.data &&
      secondaryParsed.data !== "admin"
        ? secondaryParsed.data
        : null;

    // 既定の帽子番号(1〜99 / 空欄はnull)とポジション
    const rawCap = String(formData.get(`cap_number_${membershipId}`) ?? "").trim();
    let capNumber: number | null = null;
    if (rawCap !== "") {
      const n = Number(rawCap);
      if (!Number.isInteger(n) || n < 1 || n > 99) {
        backTo("/admin", "帽子番号は1〜99で入力してください");
      }
      capNumber = n;
    }
    // ポジション: "gk" | "1".."6" | ""(未設定)
    const rawPos = String(formData.get(`position_${membershipId}`) ?? "").trim();
    const isGk = rawPos === "gk";
    let fieldPosition: number | null = null;
    if (!isGk && rawPos !== "") {
      const p = Number(rawPos);
      if (Number.isInteger(p) && p >= 1 && p <= 6) fieldPosition = p;
    }
    // 併用ポジション(任意)。GK・primaryと同じ値は弾く(secondary_roleと同じ考え方)
    const rawSecPos = String(formData.get(`secondary_position_${membershipId}`) ?? "").trim();
    let secondaryFieldPosition: number | null = null;
    if (!isGk && rawSecPos !== "") {
      const sp = Number(rawSecPos);
      if (Number.isInteger(sp) && sp >= 1 && sp <= 6 && sp !== fieldPosition) {
        secondaryFieldPosition = sp;
      }
    }

    // 入部年度(学年の算出に使う)。空欄はnull。妥当な西暦のみ受け付ける
    const rawYear = String(formData.get(`enrollment_year_${membershipId}`) ?? "").trim();
    let enrollmentYear: number | null = null;
    if (rawYear !== "") {
      const y = Number(rawYear);
      if (Number.isInteger(y) && y >= 2000 && y <= 2100) enrollmentYear = y;
    }

    updates.push({
      membershipId,
      role: role.data,
      status: status.data,
      secondaryRole,
      capNumber,
      isGk,
      fieldPosition,
      secondaryFieldPosition,
      enrollmentYear,
    });
  }

  const supabase = await createClient();

  // 最後のadminを降格・非アクティブ化するとチーム管理が不可能になるため防ぐ。
  // バッチ適用後の状態(既存の全メンバー + このフォームでの変更)で判定する。
  const { data: allMembers } = await supabase
    .from("memberships")
    .select("id, role, status")
    .eq("team_id", team.id);
  const updatesById = new Map(updates.map((u) => [u.membershipId, u]));
  const remainingActiveAdmins = (allMembers ?? []).filter((m) => {
    const u = updatesById.get(m.id);
    const role = u ? u.role : m.role;
    const status = u ? u.status : m.status;
    return role === "admin" && status === "active";
  });
  if (remainingActiveAdmins.length === 0) {
    backTo("/admin", "最後の管理者は降格・除籍できません。先に別の管理者を任命してください。");
  }

  // 帽子番号の重複をDB制約より前に検出する(入力ミスを分かりやすく弾く)
  const caps = updates
    .map((u) => u.capNumber)
    .filter((n): n is number => n != null);
  if (new Set(caps).size !== caps.length) {
    backTo("/admin", "帽子番号が重複しています。重複しない番号にしてください。");
  }

  // 帽子番号の入れ替え(例: 7↔8)で一意制約に一時的に衝突するのを防ぐため、
  // まず対象メンバーの帽子番号を一旦nullにしてから本更新する(2パス方式)。
  const { error: clearError } = await supabase
    .from("memberships")
    .update({ cap_number: null })
    .in("id", memberIds);
  if (clearError) {
    backTo("/admin", "更新の前処理に失敗しました(通信環境を確認してください)");
  }

  for (const u of updates) {
    const { data, error } = await supabase
      .from("memberships")
      .update({
        role: u.role,
        status: u.status,
        secondary_role: u.secondaryRole,
        cap_number: u.capNumber,
        is_gk: u.isGk,
        field_position: u.fieldPosition,
        secondary_field_position: u.secondaryFieldPosition,
        enrollment_year: u.enrollmentYear,
      })
      .eq("id", u.membershipId)
      .select("id");
    if (error || !data?.length) {
      const message =
        error?.code === "23505"
          ? "その帽子番号は他のメンバーが使用中です"
          : "更新できませんでした(権限がない可能性があります)";
      backTo("/admin", message);
    }
  }

  revalidatePath("/admin");
  backTo("/admin?ok=1");
}

// メンバーをチームから削除する(登録削除)。
// 主用途は「間違って2つのメールアドレスで登録してしまった」ような
// 重複アカウントの整理。引退・卒業は在籍状況(卒業/削除)の変更で行い、
// この操作は本当にチームから外すときだけ使う。
// 削除されるのは所属(membership)のみ: 本人のアカウントや、過去の
// 記録(スタッツ・コメント等)は消えない。
export async function removeMember(rawMembershipId: string, _formData: FormData) {
  const { team, userId } = await requireAdmin();

  const membershipId = z.string().uuid().safeParse(rawMembershipId);
  if (!membershipId.success) backTo("/admin", "不正なリクエストです");

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("memberships")
    .select("id, user_id, role, status")
    .eq("id", membershipId.data)
    .eq("team_id", team.id)
    .maybeSingle();
  if (!target) backTo("/admin", "対象のメンバーが見つかりません");

  // 自分自身の削除は防ぐ(誤操作で管理者が誰もいなくなる事故の防止)
  if ((target as { user_id: string }).user_id === userId) {
    backTo("/admin", "自分自身は削除できません。先に別の管理者を任命し、その人に削除してもらってください。");
  }

  const { data, error } = await supabase
    .from("memberships")
    .delete()
    .eq("id", membershipId.data)
    .select("id");
  if (error || !data?.length) {
    backTo("/admin", "削除できませんでした(権限がない可能性があります)");
  }

  revalidatePath("/admin");
  backTo("/admin?ok=1");
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
