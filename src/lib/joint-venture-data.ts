import "server-only";
import { db } from "@/lib/db";
import { computeJvRollForward, type JvYearResult } from "@/lib/joint-venture";

export interface JointVentureView {
  id: string;
  name: string;
  country: string;
  ownershipPct: number;
  currency: string;
  acquiredOn: string | null;
  investmentAccountName: string | null;
  years: JvYearResult[];
  /** Where each year's HQ ledger carrying amount came from. */
  ledgerSource: Record<number, "input" | "xero" | "xero-nil" | "cost">;
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/** Every joint venture with its equity-method schedule worked out year by year. [] when none, or the tables are not there yet (not migrated). */
export async function loadJointVentures(organizationId: string): Promise<JointVentureView[]> {
  try {
    const [jvs, org, ledgerRows, syncedMonths] = await Promise.all([
      db.jointVenture.findMany({ where: { organizationId }, include: { periods: true }, orderBy: { createdAt: "asc" } }),
      db.organization.findUnique({ where: { id: organizationId }, select: { fyeMonth: true } }),
      // HQ's own Xero balance sheet, year-end month, the investment-in-joint-venture account(s) — stored at each sync.
      db.accountBalanceMonthly.findMany({ where: { organizationId, subsidiaryId: null, group: "JV_INVESTMENT" } }),
      // Which HQ month-ends have been read from Xero at all (any named ledger account stored for that month).
      db.accountBalanceMonthly.findMany({ where: { organizationId, subsidiaryId: null }, select: { year: true, month: true }, distinct: ["year", "month"] }),
    ]);
    const synced = new Set(syncedMonths.map((m) => `${m.year}-${m.month}`));
    const fye = org?.fyeMonth ?? 12;
    const xeroBalance = (jvName: string | null, year: number): { balance: number; nil: boolean } | null => {
      const rows = ledgerRows.filter((r) => r.month === fye && (r.year === year));
      const named = jvName ? rows.filter((r) => r.accountName.toLowerCase().includes(jvName.toLowerCase().replace(/^\d+\s*[-–]?\s*/, ""))) : [];
      const use = named.length > 0 ? named : rows;
      if (use.length > 0) return { balance: use.reduce((s, r) => s + Number(r.balance), 0), nil: false };
      // The year-end was read from Xero but the account is not on the balance sheet: Xero leaves out an account with no balance, so it is nil.
      return synced.has(`${year}-${fye}`) ? { balance: 0, nil: true } : null;
    };
    return jvs.map((jv) => {
      const ledgerSource: Record<number, "input" | "xero" | "xero-nil" | "cost"> = {};
      const inputs = jv.periods.map((p) => {
        const typed = p.hqLedgerCarrying === null ? null : num(p.hqLedgerCarrying);
        const fromXero = typed === null ? xeroBalance(jv.investmentAccountName, p.year) : null;
        ledgerSource[p.year] = typed !== null ? "input" : fromXero !== null ? (fromXero.nil ? "xero-nil" : "xero") : "cost";
        return {
          year: p.year,
          capitalAdded: num(p.capitalAdded),
          jvNetResult: num(p.jvNetResult),
          jvNetAssets: p.jvNetAssets === null ? null : num(p.jvNetAssets),
          dividendsReceived: num(p.dividendsReceived),
          translation: num(p.translation),
          impairment: num(p.impairment),
          hqLedgerCarrying: typed ?? (fromXero ? fromXero.balance : null),
          hqLedgerExpense: num(p.hqLedgerExpense),
        };
      });
      return {
      id: jv.id,
      name: jv.name,
      country: jv.country,
      ownershipPct: num(jv.ownershipPct),
      currency: jv.currency,
      acquiredOn: jv.acquiredOn ? jv.acquiredOn.toISOString().slice(0, 10) : null,
      investmentAccountName: jv.investmentAccountName,
      years: computeJvRollForward(num(jv.ownershipPct), inputs),
      ledgerSource,
      };
    });
  } catch {
    return [];
  }
}

export interface JvPosition {
  hasJointVenture: boolean;
  /** Group share of joint-venture results recognised in the year (after the loss cap, less impairment) — the P&L line. */
  groupResult: number;
  /** What to add to the profit the entities' own books give, so the Group profit carries the equity-method result and not HQ's ledger entries. */
  profitAdjustment: number;
  /** Investment in joint ventures under the equity method at the year-end — the balance sheet line. */
  investmentCarrying: number;
  /** What to add to the Group balance sheet to move from HQ's ledger carrying amount to the equity-method amount. */
  balanceAdjustment: number;
  /** Share of joint-venture losses not recognised (carrying amount reached nil), carried forward. */
  unrecognisedLosses: number;
}

const EMPTY: JvPosition = { hasJointVenture: false, groupResult: 0, profitAdjustment: 0, investmentCarrying: 0, balanceAdjustment: 0, unrecognisedLosses: 0 };

/**
 * The Group's joint-venture position for a financial year. A year with no schedule row carries the last earlier row's balances forward and
 * contributes no result for the year; a joint venture whose first schedule row is a later year contributes nothing yet.
 */
export function positionForYear(jvs: JointVentureView[], year: number): JvPosition {
  const out = { ...EMPTY };
  for (const jv of jvs) {
    const upTo = jv.years.filter((y) => y.year <= year);
    const last = upTo[upTo.length - 1];
    if (!last) continue;
    out.hasJointVenture = true;
    out.investmentCarrying += last.closing;
    out.balanceAdjustment += last.balanceAdjustment;
    out.unrecognisedLosses += last.unrecognisedCarriedForward;
    if (last.year === year) {
      out.groupResult += last.groupResult;
      out.profitAdjustment += last.profitAdjustment;
    }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100 + 0;
  return { ...out, groupResult: r2(out.groupResult), profitAdjustment: r2(out.profitAdjustment), investmentCarrying: r2(out.investmentCarrying), balanceAdjustment: r2(out.balanceAdjustment), unrecognisedLosses: r2(out.unrecognisedLosses) };
}

export async function loadJvPosition(organizationId: string, year: number): Promise<JvPosition> {
  return positionForYear(await loadJointVentures(organizationId), year);
}
