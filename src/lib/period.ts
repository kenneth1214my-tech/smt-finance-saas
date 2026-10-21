// Reporting period for the Overview / Business Analysis / Profit / Treasury pages, carried in the URL so the PDF export
// (which reloads the same URL) and shared links reproduce exactly what is on screen.
//
//   ?year=2026                 -> that year, all months              (basis "year", the original behaviour)
//   ?year=2026&from=1&to=3     -> months 1–3 of the year (any From–To range, e.g. a quarter or Jan–Aug)
//   ?year=2026&month=9         -> month 9 only                       (older links, still understood)
//   ?year=2026&month=9&basis=ytd -> months 1..9                      (older links, still understood)
//
// "year" and the month numbers are in the company's FISCAL calendar: for a financial year ending in `fye` (default 12 =
// calendar year), fiscal year 2026 is the twelve months ending in month `fye` of 2026 and fiscal month 1 is its first
// month (see lib/fiscal.ts). With a December year-end fiscal = calendar, so nothing changes for it.
//
// Stored MonthlyFinancial / CashFlowMonthly rows are one per entity per month, taken from Xero's own monthly P&L (and
// derived cash flow), so a single-month period matches the Xero report for that month and any range is the sum of its months.

import { calendarOf, currentFiscal } from "@/lib/fiscal";

export type PeriodBasis = "year" | "month" | "ytd" | "range";

export interface ReportPeriod {
  year: number;
  /** Months included in headline figures, inclusive (1-12, fiscal). */
  fromMonth: number;
  toMonth: number;
  /** Trend charts always run from month 1 to toMonth so a short range still has context. */
  basis: PeriodBasis;
  /** The last month of the period (1-12), or null for the full year. */
  month: number | null;
}

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const validMonth = (n: number) => Number.isInteger(n) && n >= 1 && n <= 12;

export function parsePeriod(searchParams: Params, now: Date = new Date(), fye = 12): ReportPeriod {
  const y = Number(first(searchParams.year));
  const year = Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : currentFiscal(fye, now).year;

  // A From–To range wins over the older single-month params.
  const f = Number(first(searchParams.from));
  const t = Number(first(searchParams.to));
  if (validMonth(f) && validMonth(t) && f <= t) {
    if (f === 1 && t === 12) return { year, fromMonth: 1, toMonth: 12, basis: "year", month: null };
    if (f === t) return { year, fromMonth: f, toMonth: t, basis: "month", month: t };
    if (f === 1) return { year, fromMonth: 1, toMonth: t, basis: "ytd", month: t };
    return { year, fromMonth: f, toMonth: t, basis: "range", month: t };
  }

  const m = Number(first(searchParams.month));
  const month = validMonth(m) ? m : null;
  if (month === null) return { year, fromMonth: 1, toMonth: 12, basis: "year", month: null };
  const basis: PeriodBasis = first(searchParams.basis) === "ytd" ? "ytd" : "month";
  return { year, fromMonth: basis === "ytd" ? 1 : month, toMonth: month, basis, month };
}

const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** The named preset a range corresponds to, if any (Q1–Q4, H1, H2). */
export function presetOf(fromMonth: number, toMonth: number): "Q1" | "Q2" | "Q3" | "Q4" | "H1" | "H2" | null {
  if (fromMonth === 1 && toMonth === 3) return "Q1";
  if (fromMonth === 4 && toMonth === 6) return "Q2";
  if (fromMonth === 7 && toMonth === 9) return "Q3";
  if (fromMonth === 10 && toMonth === 12) return "Q4";
  if (fromMonth === 1 && toMonth === 6) return "H1";
  if (fromMonth === 7 && toMonth === 12) return "H2";
  return null;
}

export function periodLabel(p: ReportPeriod, isZh: boolean, fye = 12): string {
  if (fye !== 12) {
    // A fiscal period can straddle two calendar years, so name the real months and years.
    const a = calendarOf(p.year, p.fromMonth, fye);
    const b = calendarOf(p.year, p.toMonth, fye);
    const span = isZh ? `${a.year} 年 ${a.month} 月 – ${b.year} 年 ${b.month} 月` : `${MONTH_EN[a.month - 1]} ${a.year} – ${MONTH_EN[b.month - 1]} ${b.year}`;
    if (p.basis === "year") return isZh ? `${p.year} 财政年度（${span}）` : `FY${p.year} (${span})`;
    const preset = presetOf(p.fromMonth, p.toMonth);
    const name = preset ? (preset.startsWith("Q") ? (isZh ? `第${preset[1]}季度` : preset) : isZh ? (preset === "H1" ? "上半年" : "下半年") : preset) : null;
    if (name) return isZh ? `${p.year} 财政年度${name}（${span}）` : `${name} FY${p.year} (${span})`;
    return isZh ? `${p.year} 财政年度 ${span}` : `${span} (FY${p.year})`;
  }
  if (p.basis === "year") return isZh ? `${p.year} 年度（全年）` : `FY ${p.year} (full year)`;
  const span = isZh ? `${p.fromMonth}–${p.toMonth} 月` : `${MONTH_EN[p.fromMonth - 1]}–${MONTH_EN[p.toMonth - 1]}`;
  const preset = presetOf(p.fromMonth, p.toMonth);
  if (preset) {
    const name = preset.startsWith("Q") ? (isZh ? `第${preset[1]}季度` : preset) : isZh ? (preset === "H1" ? "上半年" : "下半年") : preset;
    return isZh ? `${p.year} 年${name}（${span}）` : `${name} ${p.year} (${span})`;
  }
  if (p.basis === "month") return isZh ? `${p.year} 年 ${p.toMonth} 月（当月）` : `${MONTH_EN[p.toMonth - 1]} ${p.year} (single month)`;
  if (p.basis === "ytd") return isZh ? `${p.year} 年 1–${p.toMonth} 月（累计）` : `Jan–${MONTH_EN[p.toMonth - 1]} ${p.year} (year to date)`;
  return isZh ? `${p.year} 年 ${span}` : `${span} ${p.year}`;
}

/** Month-end date of the period (yyyy-mm-dd) — handy for "as of" notes. (Calendar date, also for a fiscal period.) */
export function periodEndDate(p: ReportPeriod, fye = 12): string {
  const c = calendarOf(p.year, p.toMonth, fye);
  const d = new Date(Date.UTC(c.year, c.month, 0));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** True when headline figures cover only part of the (fiscal) year, or a year other than this one. */
export function isHistoricalPeriod(p: ReportPeriod, now: Date = new Date(), fye = 12): boolean {
  const cur = currentFiscal(fye, now);
  return p.year !== cur.year || (p.basis !== "year" && p.toMonth < cur.month);
}
