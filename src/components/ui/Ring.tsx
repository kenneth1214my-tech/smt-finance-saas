export default function Ring({ pct, color, size = 92 }: { pct: number; color: string; size?: number }) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const c = 2 * Math.PI * r;
  const len = (Math.min(Math.max(pct, 0), 100) / 100) * c;
  return (
    <div className="relative flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${len} ${c}`}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
      <div className="tabular-nums absolute text-[15px] font-extrabold" style={{ color: "var(--ink-900)" }}>
        {pct.toFixed(pct >= 100 ? 0 : 1)}%
      </div>
    </div>
  );
}
