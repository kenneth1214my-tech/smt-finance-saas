const RANK_COLORS = ["#D4A24C", "#9AA6A0", "#B07A52", "var(--ink-400)", "var(--ink-400)"];

export default function RankList({
  items,
  unit,
  valueFmt,
}: {
  items: { id: string; label: string; value: number; color?: string }[];
  unit?: string;
  valueFmt?: (v: number) => string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item, i) => {
        const pct = (item.value / max) * 100;
        return (
          <div key={item.id} className="flex items-center gap-2.5">
            <div
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-extrabold text-white"
              style={{ background: RANK_COLORS[i] || "var(--ink-400)" }}
            >
              {i + 1}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center justify-between gap-2 text-[12.5px]">
                <span className="truncate font-semibold" style={{ color: "var(--ink-900)" }}>
                  {item.label}
                </span>
                <span className="tabular-nums whitespace-nowrap font-bold" style={{ color: "var(--ink-900)" }}>
                  {valueFmt ? valueFmt(item.value) : item.value.toFixed(1)}
                  {unit ? ` ${unit}` : ""}
                </span>
              </div>
              <div className="h-[7px] overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 2)}%`, background: item.color || "var(--cat-1)" }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
