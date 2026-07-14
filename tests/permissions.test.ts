import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";
import type { Role } from "@/lib/types";

// RLSポリシーと同じ権限マトリクスをUI層でも検証する。
// (DB側の実際の担保はsupabase/migrations/0001_init.sqlのRLSポリシー)

const ALL_ROLES: Role[] = ["player", "manager", "tactical_staff", "analysis_team", "executive", "captain", "admin"];

describe("manager権限(戦術班と同等)", () => {
  it("試合登録・クリップ作成・タグ付け・レポート生成ができる", () => {
    expect(can.createMatch("manager")).toBe(true);
    expect(can.editMatch("manager")).toBe(true);
    expect(can.createClip("manager")).toBe(true);
    expect(can.tagClip("manager")).toBe(true);
    expect(can.generateReport("manager")).toBe(true);
  });

  it("レポート確定・チーム管理はできない", () => {
    expect(can.editReport("manager")).toBe(false);
    expect(can.manageTeam("manager")).toBe(false);
    expect(can.manageTagTemplates("manager")).toBe(false);
  });
});

describe("player権限", () => {
  it("閲覧とコメントはできる", () => {
    expect(can.viewMatches("player")).toBe(true);
    expect(can.viewClips("player")).toBe(true);
    expect(can.comment("player")).toBe(true);
    expect(can.viewTagStats("player")).toBe(true);
  });

  it("試合登録・クリップ作成・タグ付け・レポート生成はできない", () => {
    expect(can.createMatch("player")).toBe(false);
    expect(can.createClip("player")).toBe(false);
    expect(can.tagClip("player")).toBe(false);
    expect(can.generateReport("player")).toBe(false);
  });

  it("管理系は一切できない", () => {
    expect(can.editReport("player")).toBe(false);
    expect(can.manageTeam("player")).toBe(false);
    expect(can.manageTagTemplates("player")).toBe(false);
  });
});

describe("tactical_staff権限", () => {
  it("試合登録・クリップ作成・タグ付け・レポート生成ができる", () => {
    expect(can.createMatch("tactical_staff")).toBe(true);
    expect(can.editMatch("tactical_staff")).toBe(true);
    expect(can.createClip("tactical_staff")).toBe(true);
    expect(can.tagClip("tactical_staff")).toBe(true);
    expect(can.generateReport("tactical_staff")).toBe(true);
  });

  it("レポート編集・チーム管理はできない", () => {
    expect(can.editReport("tactical_staff")).toBe(false);
    expect(can.manageTeam("tactical_staff")).toBe(false);
    expect(can.manageTagTemplates("tactical_staff")).toBe(false);
  });
});

describe("executive / captain権限", () => {
  for (const role of ["executive", "captain"] as Role[]) {
    it(`${role}: tactical_staff権限 + レポート編集・確定ができる`, () => {
      expect(can.createMatch(role)).toBe(true);
      expect(can.createClip(role)).toBe(true);
      expect(can.generateReport(role)).toBe(true);
      expect(can.editReport(role)).toBe(true);
    });

    it(`${role}: チーム管理・タグテンプレート管理はできない`, () => {
      expect(can.manageTeam(role)).toBe(false);
      expect(can.manageTagTemplates(role)).toBe(false);
    });
  }
});

describe("admin権限", () => {
  it("すべての操作ができる", () => {
    expect(can.createMatch("admin")).toBe(true);
    expect(can.createClip("admin")).toBe(true);
    expect(can.generateReport("admin")).toBe(true);
    expect(can.editReport("admin")).toBe(true);
    expect(can.manageTeam("admin")).toBe(true);
    expect(can.manageMembers("admin")).toBe(true);
    expect(can.manageTagTemplates("admin")).toBe(true);
  });
});

describe("権限マトリクスの整合性", () => {
  it("全ロールが閲覧・コメント可能(チームメンバー前提)", () => {
    for (const role of ALL_ROLES) {
      expect(can.viewMatches(role)).toBe(true);
      expect(can.comment(role)).toBe(true);
    }
  });

  it("管理権限を持つのはadminのみ", () => {
    const admins = ALL_ROLES.filter((r) => can.manageTeam(r));
    expect(admins).toEqual(["admin"]);
  });

  it("レポート編集はexecutive/captain/adminのみ", () => {
    const editors = ALL_ROLES.filter((r) => can.editReport(r));
    expect(editors).toEqual(["executive", "captain", "admin"]);
  });
});

describe("試合削除の権限", () => {
  it("削除できるのは管理者・マネージャーのみ", () => {
    const deleters = ALL_ROLES.filter((r) => can.deleteMatch(r));
    expect(deleters.sort()).toEqual(["admin", "manager"]);
  });
});

describe("analysis_team(分析チーム)権限", () => {
  it("分析記録・クリップ・タグ・レポート生成ができる", () => {
    expect(can.recordAnalysis("analysis_team")).toBe(true);
    expect(can.createClip("analysis_team")).toBe(true);
    expect(can.tagClip("analysis_team")).toBe(true);
    expect(can.generateReport("analysis_team")).toBe(true);
  });

  it("試合の作成・編集、マネージャー記録、チーム管理はできない", () => {
    expect(can.createMatch("analysis_team")).toBe(false);
    expect(can.editMatch("analysis_team")).toBe(false);
    expect(can.recordStats("analysis_team")).toBe(false);
    expect(can.manageTeam("analysis_team")).toBe(false);
  });

  it("マネージャー・管理者も分析記録ができる", () => {
    expect(can.recordAnalysis("manager")).toBe(true);
    expect(can.recordAnalysis("admin")).toBe(true);
    expect(can.recordAnalysis("player")).toBe(false);
  });
});

describe("併用役職(secondary_role)の反映", () => {
  it("選手 兼 分析チームは分析記録ができる", () => {
    const m = { role: "player" as Role, secondary_role: "analysis_team" as Role };
    expect(can.recordAnalysis(m)).toBe(true);
    expect(can.createClip(m)).toBe(true);
    expect(can.recordStats(m)).toBe(false); // マネージャー記録は不可のまま
  });

  it("選手 兼 マネージャーは試合記録・練習記録ができる", () => {
    const m = { role: "player" as Role, secondary_role: "manager" as Role };
    expect(can.recordStats(m)).toBe(true);
    expect(can.recordPractice(m)).toBe(true);
    expect(can.manageTeam(m)).toBe(false);
  });

  it("併用なし(null)は primary のみで判定", () => {
    const m = { role: "player" as Role, secondary_role: null };
    expect(can.recordAnalysis(m)).toBe(false);
  });
});
