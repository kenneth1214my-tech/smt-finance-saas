// Reporting period for the Overview / Business Analysis / Profit pages, carried in the URL so the
// PDF export (which reloads the same URL) and shared links reproduce exactly what is on screen.
//
//   ?year=2026                 -> that year, all months              (basis "year", the original behaviour)
//   ?year=2026&from=1&to=3     -> Jan–Mar 2026 (any From–To range, e.g. a quarter or Jan–Aug)
//   ?year=2026&month=9         -> September 2026 only                (older links, still understood)
//   ?year=2026&month=9&basis=ytd -> Jan..Sep 2026                    (older links, still understood)
//
// Stored MonthlyFinancial / CashFlowMonthly rows are one per entity per month, taken from Xero's
// own monthly P&L (and derived cash flow), so a single-month period matches the Xero report for that
// month and any range is the sum of its months.

export type PeriodBasis = "year" | "month" | "ytd" | "range";

export interface ReportPeriod {
  year: number;
  /** Months included in headline figures, inclusive (1-12). */
  fromMonth: number;
  toMonth: number;
  /** Trend charts always run Jan..toMonth so a short range still has context. */
  basis: PeriodBasis;
  /** The last month of the period (1-12), or null for the full year. */
  month: number | null;
}

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const validMonth = (n: number) => Number.isInteger(n) && n >= 1 && n <= 12;

export function parsePeriod(searchParams: Params, now: Date = new Date()): ReportPeriod {
  const y = Number(first(searchParams.year));
  const year = Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : now.getFullYear();

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

export function periodLabel(p: ReportPeriod, isZh: boolean): string {
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

/** Month-end date of the period (yyyy-mm-dd) — handy for "as of" notes. */
export function periodEndDate(p: ReportPeriod): string {
  const d = new Date(Date.UTC(p.year, p.toMonth, 0));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** True when headline figures cover only part of the year, or a year other than this one. */
export function isHistoricalPeriod(p: ReportPeriod, now: Date = new Date()): boolean {
  return p.year !== now.getFullYear() || (p.basis !== "year" && p.toMonth < now.getMonth() + 1);
}
