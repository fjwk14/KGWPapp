// フィジカル測定のカタログと純関数。
// 測定項目は今後増減しうるため EAV(physical_measurements: 1行=1項目)で
// 保存し、カタログ(単位・向き・所属軸)はこのファイル側で定義する。
//
// レーダーは6軸(筋力・体幹・持久力・スプリント力・投力・精度)。
// 各測定項目はいずれかの軸に属し、軸の値=その軸に属する測定済み項目の
// チーム内偏差値(T得点)の平均。複数項目で1軸を構成するため、
// 1種目の得意不得意に引っ張られにくい。
import { positionLabel } from "./constants";

// ---------- レーダー6軸 ----------

export type AxisKey =
  | "strength"
  | "core"
  | "endurance"
  | "sprint"
  | "throw"
  | "accuracy";

export const RADAR_AXES: { key: AxisKey; label: string }[] = [
  { key: "strength", label: "筋力" },
  { key: "core", label: "体幹" },
  { key: "endurance", label: "持久力" },
  { key: "sprint", label: "スプリント力" },
  { key: "throw", label: "投力" },
  { key: "accuracy", label: "精度" },
];

// ---------- 測定項目カタログ(水球の重要メニューを6軸に対応付け) ----------

export interface MetricDef {
  key: string;
  label: string;
  unit: string;
  /** true = 値が大きいほど良い(例: 垂直到達) */
  higherIsBetter: boolean;
  /** 所属するレーダー軸 */
  axis: AxisKey;
}

export const PHYSICAL_METRICS: MetricDef[] = [
  // 筋力: 水中で相手に競り勝つ・浮き上がる力
  { key: "pullups", label: "引く力(懸垂)", unit: "回", higherIsBetter: true, axis: "strength" },
  { key: "vertical", label: "垂直到達(ジャンプ)", unit: "cm", higherIsBetter: true, axis: "strength" },
  // 体幹: シュート・ディフェンス時の姿勢維持
  { key: "plank", label: "体幹保持(加重プランク)", unit: "秒", higherIsBetter: true, axis: "core" },
  { key: "adductor", label: "内転筋(コペンハーゲン)", unit: "秒", higherIsBetter: true, axis: "core" },
  // 持久力: 4Q泳ぎ切る力・巻き足の持続
  { key: "endurance200", label: "200m持久", unit: "秒", higherIsBetter: false, axis: "endurance" },
  { key: "eggbeater_hold", label: "巻き足キープ", unit: "秒", higherIsBetter: true, axis: "endurance" },
  // スプリント力: カウンターの初速・戻りの速さ・横の機動力
  { key: "sprint10", label: "10mスプリント", unit: "秒", higherIsBetter: false, axis: "sprint" },
  { key: "sprint25", label: "25mスプリント", unit: "秒", higherIsBetter: false, axis: "sprint" },
  { key: "side5m", label: "巻き足横移動5m", unit: "秒", higherIsBetter: false, axis: "sprint" },
  // 投力: シュート・ロングパスの球速
  { key: "throw_max", label: "最大スロー速度", unit: "km/h", higherIsBetter: true, axis: "throw" },
  { key: "throw_pass", label: "パス後スロー速度", unit: "km/h", higherIsBetter: true, axis: "throw" },
  // 精度: 狙ったところに投げる力
  { key: "shoot_accuracy", label: "シュート精度", unit: "/10", higherIsBetter: true, axis: "accuracy" },
  { key: "pass_accuracy", label: "パス精度", unit: "/10", higherIsBetter: true, axis: "accuracy" },
];

export const PHYSICAL_METRIC_MAP: Record<string, MetricDef> = Object.fromEntries(
  PHYSICAL_METRICS.map((m) => [m.key, m])
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

// 項目単位のスコア(個人ページの明細テーブル用)
export interface MetricScore {
  key: string;
  label: string;
  unit: string;
  axis: AxisKey;
  /** 本人の生値(未測定はnull) */
  value: number | null;
  /** チーム全体基準のT得点(未測定はnull) */
  teamT: number | null;
  /** 同ポジション平均(生値)をチーム全体基準でT化した値。
   *  同ポジションの測定済み人数が2人未満ならnull。 */
  positionT: number | null;
}

// 軸単位のスコア(レーダー用)。軸T=軸内の測定済み項目Tの平均
export interface RadarAxisScore {
  key: AxisKey;
  label: string;
  /** 未測定の軸は50(チーム平均扱い) */
  teamT: number;
  positionT: number | null;
  /** この軸で測定済みの項目数(0=未測定) */
  measuredCount: number;
}

export interface PhysicalProfile {
  user_id: string;
  name: string;
  cap_number: number;
  position: string; // "gk" | "1".."6" | ""
  axes: RadarAxisScore[];
  metrics: MetricScore[];
  /** 6軸Tの平均(0〜100に丸め) */
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
  // 項目ごとの最新値マップは全員分共通なので先に作る
  const latestByMetric = new Map(
    PHYSICAL_METRICS.map((m) => [m.key, latestValuesByUser(rows, m.key)])
  );

  return roster.map((r) => {
    const metrics: MetricScore[] = PHYSICAL_METRICS.map((metric) => {
      const latest = latestByMetric.get(metric.key)!;
      const value = latest.get(r.user_id)?.value ?? null;

      const teamValues = [...latest.values()].map((v) => v.value);
      const teamT =
        value == null
          ? null
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
        label: metric.label,
        unit: metric.unit,
        axis: metric.axis,
        value,
        teamT,
        positionT,
      };
    });

    // 軸T = 軸内の測定済み項目Tの平均(未測定の軸は50)
    const axes: RadarAxisScore[] = RADAR_AXES.map((axis) => {
      const inAxis = metrics.filter((m) => m.axis === axis.key);
      const measured = inAxis.filter((m) => m.teamT != null);
      const teamT =
        measured.length > 0
          ? measured.reduce((s, m) => s + (m.teamT as number), 0) / measured.length
          : 50;
      const positionMeasured = inAxis.filter((m) => m.positionT != null);
      const positionT =
        positionMeasured.length > 0
          ? positionMeasured.reduce((s, m) => s + (m.positionT as number), 0) /
            positionMeasured.length
          : null;
      return {
        key: axis.key,
        label: axis.label,
        teamT,
        positionT,
        measuredCount: measured.length,
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
      metrics,
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
  const measured = profile.axes.filter((a) => a.measuredCount > 0);
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
    return "全軸がチーム平均前後。突出した強み・弱みは見られない。";
  }
  return sentences.join("");
}

export function positionLabelOf(position: string): string {
  return positionLabel(position === "gk", position && position !== "gk" ? Number(position) : null);
}
