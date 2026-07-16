import { NextResponse } from "next/server";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import {
  PHYSICAL_METRICS,
  buildPhysicalProfiles,
  type PhysicalMeasurementRow,
  type PhysicalRosterEntry,
} from "@/lib/physical";
import { buildCsv, withBom } from "@/lib/csv";
import { isManager } from "@/lib/permissions";
import type { Profile, Role } from "@/lib/types";

// フィジカル測定値(最新値+総合スコア)をCSVでダウンロードするAPI
export async function GET() {
  const { team } = await requireMembership();
  const supabase = await createClient();

  const [{ data: membersData }, { data: rowsData }] = await Promise.all([
    supabase
      .from("memberships")
      .select("user_id, cap_number, is_gk, field_position, role, secondary_role, users(name)")
      .eq("team_id", team.id)
      .eq("status", "active")
      .order("cap_number"),
    supabase
      .from("physical_measurements")
      .select("user_id, metric, value, measured_on")
      .eq("team_id", team.id),
  ]);

  // マネージャーは競技者ではないためフィジカルCSVの対象外
  const roster: PhysicalRosterEntry[] = (
    (membersData ?? []) as unknown as {
      user_id: string;
      cap_number: number | null;
      is_gk: boolean;
      field_position: number | null;
      role: Role;
      secondary_role: Role | null;
      users: Pick<Profile, "name"> | null;
    }[]
  )
    .filter((m) => !isManager(m))
    .map((m) => ({
      user_id: m.user_id,
      name: m.users?.name ?? "不明",
      cap_number: m.cap_number ?? 99,
      is_gk: m.is_gk,
      field_position: m.field_position,
    }));

  const rows: PhysicalMeasurementRow[] = ((rowsData ?? []) as PhysicalMeasurementRow[]).map(
    (r) => ({ ...r, value: Number(r.value) })
  );

  const profiles = buildPhysicalProfiles(rows, roster);

  const csvRows: (string | number | null)[][] = [];
  csvRows.push([
    "背番号",
    "選手",
    "総合フィジカルスコア",
    ...PHYSICAL_METRICS.map((m) => `${m.label}(${m.unit})`),
  ]);
  for (const p of profiles) {
    const byKey = new Map(p.metrics.map((m) => [m.key, m.value]));
    csvRows.push([
      p.cap_number,
      p.name,
      p.overallPhysicalScore,
      ...PHYSICAL_METRICS.map((m) => byKey.get(m.key) ?? ""),
    ]);
  }

  const csv = withBom(buildCsv(csvRows));
  const filename = `フィジカル測定_${team.name}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="physical.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
