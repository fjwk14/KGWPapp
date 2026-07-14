import type { Role } from "./types";

// RLSポリシーと同一のロール構成。UI表示制御に使うが、
// 実際のアクセス制御はSupabase RLSが担保する。
//
// 併用役職(secondary_role)は全ロールで有効(0016)。RLS側の
// has_team_role が primary/secondary の和集合で判定するのに合わせ、
// can.* は Role 単体か membership({role, secondary_role})を受け取り、
// どちらかの役職が条件を満たせば許可する。
export type RoleInput = Role | { role: Role; secondary_role?: Role | null };

function rolesOf(input: RoleInput): Role[] {
  if (typeof input === "string") return [input];
  return input.secondary_role
    ? [input.role, input.secondary_role]
    : [input.role];
}

const anyRole = (input: RoleInput, allowed: readonly Role[]) =>
  rolesOf(input).some((r) => allowed.includes(r));

// 試合の作成・編集を担うスタッフ(分析チームは含まない)
export const STAFF_ROLES: Role[] = [
  "manager",
  "tactical_staff",
  "executive",
  "captain",
  "admin",
];

// クリップ・タグ・レポートなど分析の道具を扱えるスタッフ
export const ANALYSIS_STAFF_ROLES: Role[] = [...STAFF_ROLES, "analysis_team"];

export const LEADER_ROLES: Role[] = ["executive", "captain", "admin"];

export const can = {
  viewMatches: (_role: RoleInput) => true,
  viewClips: (_role: RoleInput) => true,
  comment: (_role: RoleInput) => true,
  viewTagStats: (_role: RoleInput) => true,

  createMatch: (r: RoleInput) => anyRole(r, STAFF_ROLES),
  editMatch: (r: RoleInput) => anyRole(r, STAFF_ROLES),
  // 試合削除は取り返しがつかないため管理者・マネージャーのみ
  deleteMatch: (r: RoleInput) => anyRole(r, ["admin", "manager"]),
  createClip: (r: RoleInput) => anyRole(r, ANALYSIS_STAFF_ROLES),
  tagClip: (r: RoleInput) => anyRole(r, ANALYSIS_STAFF_ROLES),
  generateReport: (r: RoleInput) => anyRole(r, ANALYSIS_STAFF_ROLES),

  editReport: (r: RoleInput) => anyRole(r, LEADER_ROLES),

  // 試合記録(マネージャーモード=記録シート項目)。RLS側も同じ制限
  recordStats: (r: RoleInput) => anyRole(r, ["manager", "admin"]),
  // 試合記録(分析モード=レーダー軸に反映する項目)。RLS側も同じ制限
  recordAnalysis: (r: RoleInput) =>
    anyRole(r, ["manager", "analysis_team", "admin"]),
  // フィジカル測定値の記録(RLS側も同じ制限)
  recordPhysical: (r: RoleInput) => anyRole(r, ["manager", "admin"]),
  // 練習記録・出欠の記録(RLS側も同じ制限)
  recordPractice: (r: RoleInput) => anyRole(r, ["manager", "admin"]),

  manageTeam: (r: RoleInput) => anyRole(r, ["admin"]),
  manageMembers: (r: RoleInput) => anyRole(r, ["admin"]),
  manageTagTemplates: (r: RoleInput) => anyRole(r, ["admin"]),
} as const;

export const ROLE_LABELS: Record<Role, string> = {
  player: "選手",
  manager: "マネージャー",
  tactical_staff: "戦術チーム",
  analysis_team: "分析チーム",
  executive: "幹部",
  captain: "主将",
  admin: "管理者",
};
