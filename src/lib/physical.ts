// フィジカル測定のカタログと純関数。
// 測定項目は今後増減しうるため EAV(physical_measurements: 1行=1項目)で
// 保存し、カタログ(単位・向き・レーダー軸)はこのファイル側で定義する。
import { positionLabel } from "./constants";

export interface MetricDef {
  key: string;
  label: string;
  unit: string;
  /** true = 値が大きいほど良い(例: 垂直到達) */
  higherIsBetter: boolean;
  /** レーダーチャートの軸として使う場合のラベル(使わない項目はnull) */
  radarLabel: string | null;
}

// 7軸(レーダーチャート用)の並び。個人ページのレーダーはこの順で描画する。
export const PHYSICAL_METRICS: MetricDef[] = [
  { key: "vertical", label: "垂直到達", unit: "cm", higherIsBetter: true, radarLabel: "到達高" },
  { key: "eggbeater_hold", label: "巻き足キープ", unit: "秒", higherIsBetter: true, radarLabel: "キープ" },
  { key: "side5m", label: "巻き足横移動5m", unit: "秒", higherIsBetter: false, radarLabel: null },
  { key: "sprint10", label: "10mスプリント", unit: "秒", higherIsBetter: false, radarLabel: "10m" },
  { key: "sprint25", label: "25mスプリント", unit: "秒", higherIsBetter: false, radarLabel: null },
  { key: "endurance200", label: "200m持久", unit: "秒", higherIsBetter: false, radarLabel: "持久" },
  { key: "throw_max", label: "最大スロー速度", unit: "km/h", higherIsBetter: true, radarLabel: "スロー" },
  { key: "throw_pass", label: "パス後スロー速度", unit: "km/h", higherIsBetter: true, radarLabel: null },
  { key: "shoot_accuracy", label: "シュート精度", unit: "/10", higherIsBetter: true, radarLabel: "精度" },
  { key: "pullups", label: "引く力(懸垂)", unit: "回", higherIsBetter: true, radarLabel: "引く力" },
  { key: "adductor", label: "内転筋(コペンハーゲン)", unit: "秒", higherIsBetter: true, radarLabel: null },
  { key: "plank", label: "体幹保持(加重プランク)", unit: "秒", higherIsBetter: true, radarLabel: null },
];

export const PHYSICAL_METRIC_MAP: Record<string, MetricDef> = Object.fromEntries(
  PHYSICAL_METRICS.map((m) => [m.key, m])
);

// レーダー7軸(radarLabelが設定されている項目のみ、カタログ記載順)
export const RADAR_METRICS: MetricDef[] = PHYSICAL_METRICS.filter(
  (m) => m.radarLabel != null
);

export interface PhysicalMeasurementRow {
  user_id: string;
  metric: string;
  value: number;
  measured_on: string; // "YYYY-MM-DD"
}

export interface PhysicalRosterEntry {
  user_id: string;
  name: string;
  cap_number: number;
  is_gk: boolean;
  field_position: number | null;
}

// ---------- 偏差値(T得点) ----------

// T = 50 + 10 * (x - mean) / sd。sd=0または1件ならT=50。
// higherIsBetterがfalseなら符号を反転(低いほど良い項目はTも高いほど良い扱いにする)。
// 0〜100にclamp。
export function deviationScore(
  values: number[],
  target: number,
  higherIsBetter: boolean
): number {
  if (values.length <= 1) return 50;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const sd = Math.sqrt(variance);
  if (sd === 0) return 50;
  const sign = higherIsBetter ? 1 : -1;
  const t = 50 + (sign * 10 * (target - mean)) / sd;
  return Math.min(100, Math.max(0, t));
}

function latestValuesByUser(
  rows: PhysicalMeasurementRow[],
  metric: string
): Map<string, { value: number; measured_on: string }> {
  const latest = new Map<string, { value: number; measured_on: string }>();
  for (const r of rows) {
    if (r.metric !== metric) continue;
    const cur = latest.get(r.user_id);
    if (!cur || r.measured_on >= cur.measured_on) {
      latest.set(r.user_id, { value: r.value, measured_on: r.measured_on });
    }
  }
  return latest;
}

export interface RadarAxisScore {
  key: string;
  label: string;
  /** 本人の生値(未測定はnull) */
  value: number | null;
  /** チーム全体基準のT得点(未測定は50) */
  teamT: number;
  /** 同ポジション平均(生値)をチーム全体基準でT化した値。
   *  同ポジションの測定済み人数が2人未満ならnull(本人1人だけでは「平均」にならない)。 */
  positionT: number | null;
}

export interface PhysicalProfile {
  user_id: string;
  name: string;
  cap_number: number;
  position: string; // "gk" | "1".."6" | ""
  axes: RadarAxisScore[];
  /** 7軸のチームT得点平均(0〜100に丸め) */
  overallPhysicalScore: number;
}

function positionOf(r: PhysicalRosterEntry): string {
  return r.is_gk ? "gk" : String(r.field_position || "");
}

export function buildPhysicalProfiles(
  rows: PhysicalMeasurementRow[],
  roster: PhysicalRosterEntry[]
): PhysicalProfile[] {
  const positionByUser = new Map(roster.map((r) => [r.user_id, positionOf(r)]));

  return roster.map((r) => {
    const axes: RadarAxisScore[] = RADAR_METRICS.map((metric) => {
      const latest = latestValuesByUser(rows, metric.key);
      const value = latest.get(r.user_id)?.value ?? null;

      const teamValues = [...latest.values()].map((v) => v.value);
      const teamT =
        value == null
          ? 50
          : deviationScore(teamValues, value, metric.higherIsBetter);

      const samePosition = roster.filter(
        (o) => positionByUser.get(o.user_id) === positionOf(r)
      );
      const positionValues = samePosition
        .map((o) => latest.get(o.user_id)?.value)
        .filter((v): v is number => v != null);
      const positionAvg =
        positionValues.length > 0
          ? positionValues.reduce((s, v) => s + v, 0) / positionValues.length
          : null;
      const positionT =
        positionAvg == null || positionValues.length < 2
          ? null
          : deviationScore(teamValues, positionAvg, metric.higherIsBetter);

      return {
        key: metric.key,
        label: metric.radarLabel ?? metric.label,
        value,
        teamT,
        positionT,
      };
    });

    const overallPhysicalScore = Math.round(
      axes.reduce((s, a) => s + a.teamT, 0) / axes.length
    );

    return {
      user_id: r.user_id,
      name: r.name,
      cap_number: r.cap_number,
      position: positionOf(r),
      axes,
      overallPhysicalScore: Math.min(100, Math.max(0, overallPhysicalScore)),
    };
  });
}

export interface MetricRankingEntry {
  user_id: string;
  name: string;
  cap_number: number;
  value: number;
  measured_on: string;
}

// 指定項目の最新値でランキング(向き考慮: 低いほど良い項目は昇順)
export function buildMetricRanking(
  rows: PhysicalMeasurementRow[],
  roster: PhysicalRosterEntry[],
  metric: string
): MetricRankingEntry[] {
  const def = PHYSICAL_METRIC_MAP[metric];
  const latest = latestValuesByUser(rows, metric);
  const nameOf = new Map(roster.map((r) => [r.user_id, r]));

  const entries: MetricRankingEntry[] = [...latest.entries()]
    .map(([user_id, v]) => {
      const r = nameOf.get(user_id);
      return {
        user_id,
        name: r?.name ?? "不明",
        cap_number: r?.cap_number ?? 99,
        value: v.value,
        measured_on: v.measured_on,
      };
    })
    .filter((e) => nameOf.has(e.user_id));

  const higherIsBetter = def?.higherIsBetter ?? true;
  entries.sort((a, b) => (higherIsBetter ? b.value - a.value : a.value - b.value));
  return entries;
}

// ---------- 総合フィジカルスコアのランキング ----------

export interface OverallRankingEntry {
  user_id: string;
  name: string;
  cap_number: number;
  score: number;
}

export function buildOverallRanking(
  profiles: PhysicalProfile[]
): OverallRankingEntry[] {
  return profiles
    .map((p) => ({
      user_id: p.user_id,
      name: p.name,
      cap_number: p.cap_number,
      score: p.overallPhysicalScore,
    }))
    .sort((a, b) => b.score - a.score);
}

// ---------- コメント生成(ルールベース。LLMは使わない) ----------

export function generatePhysicalComment(profile: PhysicalProfile): string {
  const measured = profile.axes.filter((a) => a.value != null);
  if (measured.length === 0) {
    return "まだ測定記録がありません。フィジカル測定を記録すると強み・伸びしろが表示されます。";
  }

  const sorted = [...measured].sort((a, b) => b.teamT - a.teamT);
  const strengths = sorted.slice(0, 2).filter((a) => a.teamT >= 55);
  const weaknesses = [...sorted]
    .reverse()
    .slice(0, 2)
    .filter((a) => a.teamT < 50);

  const sentences: string[] = [];
  if (strengths.length > 0) {
    const labels = strengths.map((a) => a.label).join("と");
    sentences.push(
      strengths.length > 1
        ? `${labels}がチーム上位で得点源になれる。`
        : `${labels}がチーム上位で強みと言える。`
    );
  }
  if (weaknesses.length > 0) {
    const labels = weaknesses.map((a) => a.label).join("と");
    sentences.push(
      strengths.length > 0
        ? `一方${labels}が平均以下で、伸びしろ。`
        : `${labels}が平均以下で、伸びしろ。`
    );
  }
  if (sentences.length === 0) {
    return "全項目がチーム平均前後。突出した強み・弱みは見られない。";
  }
  return sentences.join("");
}

export function positionLabelOf(position: string): string {
  return positionLabel(position === "gk", position && position !== "gk" ? Number(position) : null);
}
