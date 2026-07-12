import type { Role } from "./types";

// RLSポリシーと同一のロール構成。UI表示制御に使うが、
// 実際のアクセス制御はSupabase RLSが担保する。
export const STAFF_ROLES: Role[] = [
  "manager",
  "tactical_staff",
  "executive",
  "captain",
  "admin",
];

export const LEADER_ROLES: Role[] = ["executive", "captain", "admin"];

export const can = {
  viewMatches: (_role: Role) => true,
  viewClips: (_role: Role) => true,
  comment: (_role: Role) => true,
  viewTagStats: (_role: Role) => true,

  createMatch: (role: Role) => STAFF_ROLES.includes(role),
  editMatch: (role: Role) => STAFF_ROLES.includes(role),
  createClip: (role: Role) => STAFF_ROLES.includes(role),
  tagClip: (role: Role) => STAFF_ROLES.includes(role),
  generateReport: (role: Role) => STAFF_ROLES.includes(role),

  editReport: (role: Role) => LEADER_ROLES.includes(role),

  // リアルタイムスタッツの記録・編集(RLS側も同じ制限)
  recordStats: (role: Role) => role === "manager" || role === "admin",

  manageTeam: (role: Role) => role === "admin",
  manageMembers: (role: Role) => role === "admin",
  manageTagTemplates: (role: Role) => role === "admin",
} as const;

export const ROLE_LABELS: Record<Role, string> = {
  player: "選手",
  manager: "マネージャー",
  tactical_staff: "戦術班",
  executive: "幹部",
  captain: "主将",
  admin: "管理者",
};
