"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function PeriodSelector({
  year,
  month,
  basis,
  years,
  isZh,
}: {
  year: number;
  month: number | null;
  basis: "year" | "month" | "ytd";
  years: number[];
  isZh: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(next: { year?: number; month?: number | null; basis?: "month" | "ytd" }) {
    const params = new URLSearchParams(searchParams.toString());
    const y = next.year ?? year;
    const m = next.month === undefined ? month : next.month;
    params.set("year", String(y));
    if (m === null) {
      params.delete("month");
      params.delete("basis");
    } else {
      params.set("month", String(m));
      const b = next.basis ?? (basis === "ytd" ? "ytd" : "month");
      if (b === "ytd") params.set("basis", "ytd");
      else params.delete("basis");
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const selectCls = "rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold";
  const selectStyle = { borderColor: "var(--border-strong)", background: "var(--surface)", color: "var(--ink-900)" } as const;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12px] font-semibold" style={{ color: "var(--ink-400)" }}>
        {isZh ? "报告期间" : "Period"}
      </span>
      <select className={selectCls} style={selectStyle} value={year} onChange={(e) => update({ year: Number(e.target.value) })} aria-label={isZh ? "年度" : "Year"}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <select className={selectCls} style={selectStyle} value={month ?? ""} onChange={(e) => update({ month: e.target.value === "" ? null : Number(e.target.value) })} aria-label={isZh ? "月份" : "Month"}>
        <option value="">{isZh ? "全年" : "Full year"}</option>
        {MONTH_EN.map((m, i) => (
          <option key={m} value={i + 1}>
            {isZh ? `${i + 1} 月` : m}
          </option>
        ))}
      </select>
      {month !== null && (
        <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: "var(--border)" }}>
          {(["month", "ytd"] as const).map((b) => (
            <button
              key={b}
              onClick={() => update({ basis: b })}
              className="rounded-md px-2.5 py-1 text-[12px] font-semibold"
              style={{ background: (basis === "ytd" ? "ytd" : "month") === b ? "var(--cat-1)" : "transparent", color: (basis === "ytd" ? "ytd" : "month") === b ? "#fff" : "var(--ink-600)" }}
            >
              {b === "month" ? (isZh ? "当月" : "Month") : isZh ? "累计 YTD" : "YTD"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
