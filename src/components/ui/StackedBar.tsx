export default function StackedBar({
  segments,
  valueFmt,
}: {
  segments: { label: string; value: number; color: string }[];
  valueFmt?: (v: number) => string;
}) {
  const total = segments.reduce((a, b) => a + b.value, 0) || 1;
  return (
    <div>
      <div className="flex h-[34px] overflow-hidden rounded-lg" style={{ gap: 2 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ width: `${(s.value / total) * 100}%`, background: s.color, borderRadius: 4 }} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3.5">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--ink-600)" }}>
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
            <b style={{ color: "var(--ink-900)" }}>{valueFmt ? valueFmt(s.value) : s.value.toFixed(1)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
