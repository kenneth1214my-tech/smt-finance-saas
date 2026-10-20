"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const PRESETS: { key: string; from: number; to: number; zh: string; en: string }[] = [
  { key: "year", from: 1, to: 12, zh: "全年", en: "Full year" },
  { key: "Q1", from: 1, to: 3, zh: "Q1", en: "Q1" },
  { key: "Q2", from: 4, to: 6, zh: "Q2", en: "Q2" },
  { key: "Q3", from: 7, to: 9, zh: "Q3", en: "Q3" },
  { key: "Q4", from: 10, to: 12, zh: "Q4", en: "Q4" },
  { key: "H1", from: 1, to: 6, zh: "上半年", en: "H1" },
  { key: "H2", from: 7, to: 12, zh: "下半年", en: "H2" },
];

// Period picker shared by the Overview, Business Analysis, Profit Analysis and Treasury pages: a year,
// quick presets (full year / quarters / halves) and a free From–To month range (so "Jan–Aug", a single
// month, or year-to-date are all just From/To choices). The selection lives in the URL (?year&from&to).
export default function PeriodSelector({
  year,
  fromMonth,
  toMonth,
  years,
  isZh,
}: {
  year: number;
  fromMonth: number;
  toMonth: number;
  years: number[];
  isZh: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function go(next: { year?: number; from?: number; to?: number }) {
    const params = new URLSearchParams(searchParams.toString());
    // Older single-month params are replaced by the range ones.
    params.delete("month");
    params.delete("basis");
    params.set("year", String(next.year ?? year));
    const f = next.from ?? fromMonth;
    const t = next.to ?? toMonth;
    if (f === 1 && t === 12) {
      params.delete("from");
      params.delete("to");
    } else {
      params.set("from", String(f));
      params.set("to", String(t));
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const selectCls = "rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold";
  const selectStyle = { borderColor: "var(--border-strong)", background: "var(--surface)", color: "var(--ink-900)" } as const;
  const monthName = (i: number) => (isZh ? `${i + 1} 月` : MONTH_EN[i]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12px] font-semibold" style={{ color: "var(--ink-400)" }}>
        {isZh ? "报告期间" : "Period"}
      </span>
      <select className={selectCls} style={selectStyle} value={year} onChange={(e) => go({ year: Number(e.target.value) })} aria-label={isZh ? "年度" : "Year"}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: "var(--border)" }}>
        {PRESETS.map((p) => {
          const active = p.from === fromMonth && p.to === toMonth;
          return (
            <button
              key={p.key}
              onClick={() => go({ from: p.from, to: p.to })}
              className="rounded-md px-2.5 py-1 text-[12px] font-semibold"
              style={{ background: active ? "var(--cat-1)" : "transparent", color: active ? "#fff" : "var(--ink-600)" }}
            >
              {isZh ? p.zh : p.en}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[12px] font-semibold" style={{ color: "var(--ink-400)" }}>
          {isZh ? "从" : "From"}
        </span>
        <select
          className={selectCls}
          style={selectStyle}
          value={fromMonth}
          // moving From past To drags To along, so the range is never inverted
          onChange={(e) => go({ from: Number(e.target.value), to: Math.max(toMonth, Number(e.target.value)) })}
          aria-label={isZh ? "起始月份" : "From month"}
        >
          {MONTH_EN.map((_, i) => (
            <option key={i} value={i + 1}>
              {monthName(i)}
            </option>
          ))}
        </select>
        <span className="text-[12px] font-semibold" style={{ color: "var(--ink-400)" }}>
          {isZh ? "至" : "to"}
        </span>
        <select
          className={selectCls}
          style={selectStyle}
          value={toMonth}
          onChange={(e) => go({ to: Number(e.target.value), from: Math.min(fromMonth, Number(e.target.value)) })}
          aria-label={isZh ? "结束月份" : "To month"}
        >
          {MONTH_EN.map((_, i) => (
            <option key={i} value={i + 1}>
              {monthName(i)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
