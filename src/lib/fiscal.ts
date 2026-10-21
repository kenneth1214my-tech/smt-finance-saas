import { monthLabels } from "@/lib/localize";
import type { Locale } from "@/lib/i18n/dictionaries";

// Fiscal calendar for the dashboards. The stored monthly rows are keyed by CALENDAR (year, month); a company whose
// financial year ends in month F ≠ 12 (say March) wants "FY2026, month 1" to mean April 2025. Rather than teach every
// page about two calendars, the rows are TRANSLATED as they are loaded: calendar (2025, 4) becomes fiscal (2026, 1), so
// all the existing page logic — filters on year and month, trends, prior-year comparisons, TTM windows — keeps working
// unchanged on fiscal (year, month). For F = 12 every function here is the identity, so a December year-end behaves
// exactly as before.
//
// fiscal year  = the year in which the financial year ENDS  (FY2026 with a March year-end = Apr 2025 – Mar 2026)
// fiscal month = 1..12, where 1 is the first month of the financial year
//
// Pure — the loaders take a Prisma delegate as an argument and import nothing server-only.

export interface YM {
  year: number;
  month: number;
}

/** Calendar (year, month) → fiscal (year, month) for a financial year ending in `fye`. */
export function fiscalOf(year: number, month: number, fye: number): YM {
  if (fye === 12) return { year, month };
  return { year: month <= fye ? year : year + 1, month: ((month - fye - 1 + 12) % 12) + 1 };
}

/** Fiscal (year, month) → calendar (year, month). */
export function calendarOf(fyYear: number, fyMonth: number, fye: number): YM {
  if (fye === 12) return { year: fyYear, month: fyMonth };
  return { year: fye + fyMonth > 12 ? fyYear : fyYear - 1, month: ((fye + fyMonth - 1) % 12) + 1 };
}

/** The fiscal year / month we are in right now. */
export function currentFiscal(fye: number, now: Date = new Date()): YM {
  return fiscalOf(now.getFullYear(), now.getMonth() + 1, fye);
}

/** Month names in FISCAL order: element 0 is the first month of the financial year. */
export function fiscalMonthLabels(locale: Locale, fye: number): string[] {
  const names = monthLabels(locale, 12);
  return Array.from({ length: 12 }, (_, i) => names[(fye + i) % 12]);
}

type NumFilter = number | { in?: number[]; gte?: number; lte?: number; gt?: number; lt?: number } | undefined;

const matches = (n: number, f: NumFilter): boolean => {
  if (f === undefined) return true;
  if (typeof f === "number") return n === f;
  if (f.in && !f.in.includes(n)) return false;
  if (f.gte !== undefined && n < f.gte) return false;
  if (f.lte !== undefined && n > f.lte) return false;
  if (f.gt !== undefined && n <= f.gt) return false;
  if (f.lt !== undefined && n >= f.lt) return false;
  return true;
};

function fiscalYearsOf(f: NumFilter): number[] {
  if (typeof f === "number") return [f];
  if (f?.in) return f.in;
  if (f && f.gte !== undefined && f.lte !== undefined) return Array.from({ length: f.lte - f.gte + 1 }, (_, i) => (f.gte as number) + i);
  throw new Error("A fiscal query needs a year filter (a number, { in } or { gte, lte }).");
}

/**
 * Prisma `where` fragment selecting the calendar rows that fall in the given FISCAL year(s) and fiscal month(s).
 * `year` / `month` are fiscal. For a December year-end this is exactly `{ year, month }`.
 */
export function fiscalWhere(year: NumFilter, month: NumFilter, fye: number): Record<string, unknown> {
  if (fye === 12) return { ...(year !== undefined ? { year } : {}), ...(month !== undefined ? { month } : {}) };
  const byCalendarYear = new Map<number, Set<number>>();
  for (const fy of fiscalYearsOf(year)) {
    for (let idx = 1; idx <= 12; idx++) {
      if (!matches(idx, month)) continue;
      const c = calendarOf(fy, idx, fye);
      byCalendarYear.set(c.year, (byCalendarYear.get(c.year) ?? new Set<number>()).add(c.month));
    }
  }
  return { OR: [...byCalendarYear.entries()].map(([y, ms]) => ({ year: y, month: { in: [...ms] } })) };
}

/**
 * `delegate.findMany(args)` where `args.where.year` / `args.where.month` are FISCAL, returning rows whose `year` and
 * `month` are FISCAL as well. (A `select` gets `year` and `month` added so the translation can happen; results are
 * sorted by fiscal (year, month) since a calendar `orderBy: { month }` would no longer be chronological.)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fiscalFindMany(delegate: { findMany: (args: any) => Promise<any[]> }, fye: number, args: any): Promise<any[]> {
  if (fye === 12) return delegate.findMany(args);
  const { where = {}, select, orderBy: _orderBy, ...rest } = args;
  void _orderBy;
  const { year, month, ...otherWhere } = where;
  const rows = await delegate.findMany({
    ...rest,
    ...(select ? { select: { ...select, year: true, month: true } } : {}),
    where: { ...otherWhere, ...fiscalWhere(year, month, fye) },
  });
  return rows
    .map((r) => ({ ...r, ...fiscalOf(r.year, r.month, fye) }))
    .sort((a, b) => a.year - b.year || a.month - b.month);
}
