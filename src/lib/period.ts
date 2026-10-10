// Reporting period for the Overview / Business Analysis / Profit pages, carried in the URL so the
// PDF export (which reloads the same URL) and shared links reproduce exactly what is on screen.
//
//   ?year=2026            -> that year, all months         (basis "year", the original behaviour)
//   ?year=2026&month=9    -> September 2026 only           (basis "month" — Xero's monthly P&L)
//   ?year=2026&month=9&basis=ytd -> Jan..Sep 2026          (basis "ytd"   — Xero's year-to-date P&L)
//
// Stored MonthlyFinancial / CashFlowMonthly rows are one per entity per month, taken from Xero's
// own monthly P&L (and derived cash flow), so a single-month period matches the Xero report for that
// month and YTD is the sum of months 1..N.

export type PeriodBasis = "year" | "month" | "ytd";

export interface ReportPeriod {
  year: number;
  /** Months included in headline figures, inclusive (1-12). */
  fromMonth: number;
  toMonth: number;
  /** Trend charts always run Jan..toMonth so a single month still has context. */
  basis: PeriodBasis;
  /** The month the user picked (1-12), or null for the full year. */
  month: number | null;
}

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parsePeriod(searchParams: Params, now: Date = new Date()): ReportPeriod {
  const y = Number(first(searchParams.year));
  const year = Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : now.getFullYear();
  const m = Number(first(searchParams.month));
  const month = Number.isInteger(m) && m >= 1 && m <= 12 ? m : null;
  if (month === null) return { year, fromMonth: 1, toMonth: 12, basis: "year", month: null };
  const basis: PeriodBasis = first(searchParams.basis) === "ytd" ? "ytd" : "month";
  return { year, fromMonth: basis === "ytd" ? 1 : month, toMonth: month, basis, month };
}

const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

export function periodLabel(p: ReportPeriod, isZh: boolean): string {
  if (p.basis === "year") return isZh ? `${p.year} 年度（全年）` : `FY ${p.year} (full year)`;
  if (p.basis === "month") return isZh ? `${p.year} 年 ${p.month} 月（当月）` : `${MONTH_EN[p.month! - 1]} ${p.year} (single month)`;
  return isZh ? `${p.year} 年 1–${p.month} 月（累计）` : `Jan–${MONTH_EN[p.month! - 1]} ${p.year} (year to date)`;
}

/** Month-end date of the period (yyyy-mm-dd) — handy for "as of" notes. */
export function periodEndDate(p: ReportPeriod): string {
  const d = new Date(Date.UTC(p.year, p.toMonth, 0));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** True when headline figures cover only part of the year, or a year other than this one. */
export function isHistoricalPeriod(p: ReportPeriod, now: Date = new Date()): boolean {
  return p.year !== now.getFullYear() || (p.basis !== "year" && p.toMonth < now.getMonth() + 1);
}
