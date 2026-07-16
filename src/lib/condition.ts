// コンディション記録(個人カルテ)の集計・助言(純関数)。
//
// condition_logs は1人1日1行。閲覧は本人+マネージャー・管理者のみ
// (RLSで制限)。ここでは週次・月次の推移集計と、直近の記録から
// ルールベースで「対策・アドバイス」を組み立てる。

export interface ConditionLogEntry {
  log_date: string; // "YYYY-MM-DD"
  condition: number; // 1-5(調子)
  motivation: number; // 1-5(やる気)
  sleep_hours: number | null;
  pain_level: number; // 0-3(痛み)
  pain_note?: string | null;
}

export const CONDITION_LABELS: Record<number, string> = {
  1: "絶不調",
  2: "不調",
  3: "ふつう",
  4: "好調",
  5: "絶好調",
};

export const MOTIVATION_LABELS: Record<number, string> = {
  1: "かなり低い",
  2: "低め",
  3: "ふつう",
  4: "高め",
  5: "MAX",
};

export const PAIN_LABELS: Record<number, string> = {
  0: "なし",
  1: "少し気になる",
  2: "痛い",
  3: "かなり痛い",
};

// 日本時間での今日("YYYY-MM-DD")。toISOString()はUTCのため朝方に日付が
// ずれる問題があり、コンディションは「その日」の記録なのでJSTで揃える。
export function todayJST(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export interface PeriodSummary {
  period: string; // 週: 週初め(月曜)の "YYYY-MM-DD" / 月: "YYYY-MM"
  count: number;
  avgCondition: number | null; // 小数1桁
  avgMotivation: number | null;
  avgSleep: number | null;
  maxPain: number;
}

// "YYYY-MM-DD" の属する週の月曜日を返す
export function weekStartOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7; // 月曜=0
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function summarize(
  groups: Map<string, ConditionLogEntry[]>,
  limit: number
): PeriodSummary[] {
  return [...groups.entries()]
    .map(([period, logs]) => {
      const sleeps = logs
        .map((l) => l.sleep_hours)
        .filter((s): s is number => s != null);
      return {
        period,
        count: logs.length,
        avgCondition: round1(
          logs.reduce((s, l) => s + l.condition, 0) / logs.length
        ),
        avgMotivation: round1(
          logs.reduce((s, l) => s + l.motivation, 0) / logs.length
        ),
        avgSleep:
          sleeps.length > 0
            ? round1(sleeps.reduce((s, v) => s + v, 0) / sleeps.length)
            : null,
        maxPain: Math.max(...logs.map((l) => l.pain_level)),
      };
    })
    .sort((a, b) => b.period.localeCompare(a.period))
    .slice(0, limit);
}

// 週ごとの推移(新しい週が先頭)
export function summarizeByWeek(
  logs: ConditionLogEntry[],
  limit = 8
): PeriodSummary[] {
  const groups = new Map<string, ConditionLogEntry[]>();
  for (const l of logs) {
    const key = weekStartOf(l.log_date);
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  return summarize(groups, limit);
}

// 月ごとの推移(新しい月が先頭)
export function summarizeByMonth(
  logs: ConditionLogEntry[],
  limit = 6
): PeriodSummary[] {
  const groups = new Map<string, ConditionLogEntry[]>();
  for (const l of logs) {
    const key = l.log_date.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  return summarize(groups, limit);
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) /
      86400000
  );
}

function avg(nums: number[]): number | null {
  return nums.length > 0 ? nums.reduce((s, v) => s + v, 0) / nums.length : null;
}

// 直近の記録からルールベースの対策・アドバイスを組み立てる。
// 判定基準は「最新の記録日」を起点にする(数日サボっていても直近の
// 傾向で判定できるように)。
export function buildConditionAdvice(logs: ConditionLogEntry[]): string[] {
  if (logs.length === 0) {
    return ["まずは毎日の記録から。続けるほど自分の傾向が見えてきます。"];
  }
  const sorted = [...logs].sort((a, b) => b.log_date.localeCompare(a.log_date));
  const latestDate = sorted[0].log_date;
  const recent7 = sorted.filter((l) => daysBetween(latestDate, l.log_date) < 7);
  const prev7 = sorted.filter((l) => {
    const d = daysBetween(latestDate, l.log_date);
    return d >= 7 && d < 14;
  });

  const advice: string[] = [];

  // 痛み: 直近3件連続で「痛い」以上 → 最優先で警告
  const last3 = sorted.slice(0, 3);
  if (last3.length >= 2 && last3.every((l) => l.pain_level >= 2)) {
    const notes = [...new Set(last3.map((l) => l.pain_note).filter(Boolean))];
    advice.push(
      `⚠️ 痛みが続いています${notes.length > 0 ? `(${notes.join("・")})` : ""}。悪化する前に練習強度を落とし、スタッフ・トレーナーに相談してください。`
    );
  } else if (sorted[0].pain_level >= 2) {
    advice.push(
      `痛みの記録があります${sorted[0].pain_note ? `(${sorted[0].pain_note})` : ""}。無理をせず、続くようならスタッフに伝えましょう。`
    );
  }

  // 睡眠: 直近7日の平均が6時間未満
  const recentSleep = avg(
    recent7.map((l) => l.sleep_hours).filter((s): s is number => s != null)
  );
  if (recentSleep != null && recentSleep < 6) {
    advice.push(
      `直近の平均睡眠が${round1(recentSleep)}時間と不足気味です。回復も練習のうち。まずは就寝時間を30分早めることから。`
    );
  }

  // 調子: 直近7日が前の7日より大きく低下 → 疲労蓄積のサイン
  const recentCond = avg(recent7.map((l) => l.condition));
  const prevCond = avg(prev7.map((l) => l.condition));
  if (recentCond != null && prevCond != null && recentCond - prevCond <= -0.8) {
    advice.push(
      "調子が先週より下がっています。疲労が溜まっているサインかもしれません。強度・休養のバランスを見直しましょう。"
    );
  }

  // やる気: 直近7日の平均が低い
  const recentMot = avg(recent7.map((l) => l.motivation));
  if (recentMot != null && recentMot <= 2.5) {
    advice.push(
      "やる気が下がり気味です。小さな目標(今日の練習で1つだけ意識すること)を決めると戻りやすいです。誰かに話すのも◎。"
    );
  }

  if (advice.length === 0) {
    advice.push("コンディションは良好です。この調子で記録を続けましょう。");
  }
  return advice;
}
