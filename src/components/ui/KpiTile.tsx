import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export default function KpiTile({
  icon: Icon,
  color,
  label,
  value,
  unit,
  yoy,
  yoyLabel = "同比",
  note,
}: {
  icon: LucideIcon;
  color: string;
  label: string;
  value: string;
  unit?: string;
  yoy?: number;
  yoyLabel?: string;
  note?: string;
}) {
  const up = (yoy ?? 0) >= 0;
  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] border p-4 shadow-sm" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px]"
          style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
        >
          <Icon size={16} />
        </div>
        <div className="text-[12.5px] font-semibold" style={{ color: "var(--ink-600)" }}>
          {label}
        </div>
      </div>
      <div className="tabular-nums text-[23px] font-extrabold tracking-tight" style={{ color: value.trim().startsWith("-") ? "var(--status-critical)" : "var(--ink-900)" }}>
        {value}
        {unit && (
          <span className="ml-1 text-[12.5px] font-semibold" style={{ color: "var(--ink-400)" }}>
            {unit}
          </span>
        )}
      </div>
      {yoy !== undefined ? (
        <div className="flex items-center gap-1 text-xs font-bold" style={{ color: up ? "var(--delta-up)" : "var(--delta-down)" }}>
          {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
          <span>
            {yoyLabel} {up ? "+" : ""}
            {yoy.toFixed(1)}%
          </span>
        </div>
      ) : note ? (
        <div className="text-xs" style={{ color: "var(--ink-400)" }}>
          {note}
        </div>
      ) : null}
    </div>
  );
}
