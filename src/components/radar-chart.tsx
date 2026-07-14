// レーダーチャート(SVGを自前で組み立てる。専用ライブラリは使わない)。
// 値は0〜maxValueのスケール(本アプリではT得点=0〜100)を想定。
export interface RadarAxisInput {
  label: string;
  /** 主系列(例: 本人)。0〜maxValue */
  value: number;
  /** 副系列(例: 同ポジ平均)。nullなら描画しない */
  secondaryValue?: number | null;
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (Math.PI / 180) * angleDeg;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function RadarChart({
  axes,
  size = 240,
  maxValue = 100,
  primaryLabel = "本人",
  secondaryLabel = "同ポジ平均",
}: {
  axes: RadarAxisInput[];
  size?: number;
  maxValue?: number;
  primaryLabel?: string;
  secondaryLabel?: string;
}) {
  const n = axes.length;
  if (n === 0) return null;
  const cx = size / 2;
  const cy = size / 2;
  const labelPad = 26;
  const R = size / 2 - labelPad;
  const step = 360 / n;
  const startAngle = -90;

  const ringLevels = [0.25, 0.5, 0.75, 1];
  const ringPoints = (level: number) =>
    axes
      .map((_, i) => {
        const { x, y } = polar(cx, cy, R * level, startAngle + step * i);
        return `${x},${y}`;
      })
      .join(" ");

  const valuePoints = (pick: (a: RadarAxisInput) => number) =>
    axes
      .map((a, i) => {
        const r = (Math.min(maxValue, Math.max(0, pick(a))) / maxValue) * R;
        const { x, y } = polar(cx, cy, r, startAngle + step * i);
        return `${x},${y}`;
      })
      .join(" ");

  const hasSecondary = axes.some((a) => a.secondaryValue != null);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        {ringLevels.map((level) => (
          <polygon
            key={level}
            points={ringPoints(level)}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={1}
          />
        ))}
        {axes.map((_, i) => {
          const { x, y } = polar(cx, cy, R, startAngle + step * i);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
          );
        })}

        {hasSecondary && (
          <polygon
            points={valuePoints((a) => a.secondaryValue ?? 0)}
            fill="none"
            stroke="#94a3b8"
            strokeWidth={2}
            strokeDasharray="4 3"
          />
        )}
        <polygon
          points={valuePoints((a) => a.value)}
          fill="rgba(37,99,235,0.18)"
          stroke="#2563eb"
          strokeWidth={2}
        />
        {axes.map((a, i) => {
          const r = (Math.min(maxValue, Math.max(0, a.value)) / maxValue) * R;
          const { x, y } = polar(cx, cy, r, startAngle + step * i);
          return <circle key={i} cx={x} cy={y} r={2.5} fill="#2563eb" />;
        })}

        {axes.map((a, i) => {
          const { x, y } = polar(cx, cy, R + labelPad - 8, startAngle + step * i);
          return (
            <text
              key={i}
              x={x}
              y={y}
              fontSize={11}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#475569"
            >
              {a.label}
            </text>
          );
        })}
      </svg>
      <div className="flex items-center gap-3 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-brand-600" />
          {primaryLabel}
        </span>
        {hasSecondary && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full border border-slate-400" />
            {secondaryLabel}
          </span>
        )}
      </div>
    </div>
  );
}
