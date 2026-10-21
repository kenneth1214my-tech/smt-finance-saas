// Financial-year helpers. A company's financial year ("FY") ends in month `fyeMonth`; FY{y} is the twelve months
// ENDING in that month of year y — FY2026 with a March year-end is April 2025 – March 2026; with a December year-end it
// is simply January – December 2026. Statutory reports (statements, tax provisions) follow the financial year, while
// the dashboards keep working in calendar months with the period selector.
//
// Pure — no I/O.

export interface YearMonth {
  year: number;
  month: number;
}

/** The twelve (year, month) pairs of financial year `fyYear`, oldest first. */
export function fyMonths(fyYear: number, fyeMonth: number): YearMonth[] {
  const out: YearMonth[] = [];
  for (let i = 11; i >= 0; i--) {
    const idx = fyYear * 12 + (fyeMonth - 1) - i; // month index counted from year 0, month 0
    out.push({ year: Math.floor(idx / 12), month: (idx % 12) + 1 });
  }
  return out;
}

/** Prisma `where` fragment selecting the rows of financial year `fyYear` from a table that has `year` and `month`. */
export function fyWhere(fyYear: number, fyeMonth: number): { year: number } | { OR: { year: number; month: { gte?: number; lte?: number } }[] } {
  if (fyeMonth === 12) return { year: fyYear };
  return { OR: [{ year: fyYear - 1, month: { gte: fyeMonth + 1 } }, { year: fyYear, month: { lte: fyeMonth } }] };
}

/** Which financial year a calendar (year, month) falls in, for an entity whose year ends in `fyeMonth`. */
export function fyOf(year: number, month: number, fyeMonth: number): number {
  return month <= fyeMonth ? year : year + 1;
}

const MONTH_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "31 March 2026" / "2026 年 3 月 31 日" — the closing date of financial year `fyYear`. */
export function fyEndLabel(fyYear: number, fyeMonth: number, isZh: boolean): string {
  const day = daysInMonth(fyYear, fyeMonth);
  return isZh ? `${fyYear} 年 ${fyeMonth} 月 ${day} 日` : `${day} ${MONTH_EN[fyeMonth - 1]} ${fyYear}`;
}

/** "1 Apr 2025 – 31 Mar 2026" — the span of financial year `fyYear`. */
export function fyRangeLabel(fyYear: number, fyeMonth: number, isZh: boolean): string {
  const first = fyMonths(fyYear, fyeMonth)[0];
  const day = daysInMonth(fyYear, fyeMonth);
  return isZh
    ? `${first.year} 年 ${first.month} 月 1 日 – ${fyYear} 年 ${fyeMonth} 月 ${day} 日`
    : `1 ${MONTH_SHORT[first.month - 1]} ${first.year} – ${day} ${MONTH_SHORT[fyeMonth - 1]} ${fyYear}`;
}

/** The balance-sheet month-end that closes financial year `fyYear`: (year, month). */
export function fyClose(fyYear: number, fyeMonth: number): YearMonth {
  return { year: fyYear, month: fyeMonth };
}

/** The month-end that closes the financial year BEFORE `fyYear` (= the opening position of `fyYear`). */
export function fyOpen(fyYear: number, fyeMonth: number): YearMonth {
  return { year: fyYear - 1, month: fyeMonth };
}
