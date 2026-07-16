import { Button, Input } from "@/components/ui";
import {
  CONDITION_LABELS,
  MOTIVATION_LABELS,
  PAIN_LABELS,
  type ConditionLogEntry,
} from "@/lib/condition";
import { submitConditionLog } from "./actions";

// 1〜5などの段階をラジオボタンのチップで選ばせる(Server Componentのまま
// 動くよう peer-checked のCSSだけで選択状態を表現する)
function ScaleChips({
  name,
  labels,
  defaultValue,
}: {
  name: string;
  labels: Record<number, string>;
  defaultValue: number | null;
}) {
  const keys = Object.keys(labels).map(Number);
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${keys.length}, minmax(0, 1fr))` }}
    >
      {keys.map((v) => (
        <label key={v} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={v}
            defaultChecked={defaultValue === v}
            required
            className="peer sr-only"
          />
          <span className="flex min-h-11 flex-col items-center justify-center rounded-lg border border-slate-200 bg-white px-1 py-1.5 text-center peer-checked:border-brand-600 peer-checked:bg-brand-50">
            <span className="text-sm font-bold">{v}</span>
            <span className="text-[9px] leading-tight text-slate-500">
              {labels[v]}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

// コンディション記録フォーム。/me・練習詳細・個人カルテで共用する。
// existing があれば「修正」として初期値を埋める(1日1行のupsert)。
export default function ConditionForm({
  logDate,
  redirectTo,
  existing,
}: {
  logDate: string;
  redirectTo: string;
  existing: ConditionLogEntry | null;
}) {
  return (
    <form action={submitConditionLog} className="space-y-3">
      <input type="hidden" name="log_date" value={logDate} />
      <input type="hidden" name="redirect_to" value={redirectTo} />
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-500">調子</p>
        <ScaleChips
          name="condition"
          labels={CONDITION_LABELS}
          defaultValue={existing?.condition ?? null}
        />
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-500">やる気</p>
        <ScaleChips
          name="motivation"
          labels={MOTIVATION_LABELS}
          defaultValue={existing?.motivation ?? null}
        />
      </div>
      <div className="flex gap-2">
        <div className="w-28 shrink-0">
          <p className="mb-1 text-xs font-semibold text-slate-500">睡眠(時間)</p>
          <Input
            type="number"
            name="sleep_hours"
            step="0.5"
            min="0"
            max="24"
            inputMode="decimal"
            placeholder="7.5"
            defaultValue={existing?.sleep_hours ?? ""}
            className="text-sm tabular-nums"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-semibold text-slate-500">体の痛み</p>
          <ScaleChips
            name="pain_level"
            labels={PAIN_LABELS}
            defaultValue={existing?.pain_level ?? 0}
          />
        </div>
      </div>
      <div>
        <Input
          type="text"
          name="pain_note"
          maxLength={200}
          placeholder="痛みがある場合: 部位・様子(例: 右肩、投げると痛い)"
          defaultValue={existing?.pain_note ?? ""}
          className="text-sm"
        />
      </div>
      <Button type="submit" className="w-full">
        {existing ? "コンディションを修正する" : "コンディションを記録する"}
      </Button>
      <p className="text-[10px] text-slate-400">
        🔒 この記録が見えるのは本人とマネージャー・管理者だけです。他の部員には見えません。
      </p>
    </form>
  );
}
