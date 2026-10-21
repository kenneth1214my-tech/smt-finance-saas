import "server-only";
import { db } from "@/lib/db";
import { localizedName } from "@/lib/localize";
import { fyWhere } from "@/lib/financial-year";
import type { Locale } from "@/lib/i18n/dictionaries";

export interface ConsolidatedEntityRow {
  id: string;
  name: string;
  revenue: number;
  netProfit: number;
  netMarginPct: number;
}

export interface ConsolidatedIncomeStatement {
  companyName: string;
  year: number; // financial year (FY ending in this year)
  fyeMonth: number;
  revenue: number;
  costOfSales: number;
  grossProfit: number;
  grossMarginPct: number;
  sellExp: number;
  adminExp: number;
  rndExp: number;
  financeExp: number;
  totalExpenses: number;
  operatingProfit: number;
  netProfit: number;
  netMarginPct: number;
  byEntity: ConsolidatedEntityRow[];
  generatedAt: Date;
}

// Real consolidated Income Statement across every subsidiary AND the group/HQ bucket for a given
// year — the same org-wide aggregation Overview/Profit Analysis use (see their HQ_PSEUDO_SUB
// fix), just packaged as a formal report instead of dashboard KPI tiles.
export async function computeConsolidatedIncomeStatement(organizationId: string, year: number, locale: Locale): Promise<ConsolidatedIncomeStatement> {
  // `year` is the FINANCIAL year: twelve months ending in the organization's year-end month (calendar year when it is December).
  const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const [subsidiaries, monthly] = await Promise.all([
    db.subsidiary.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" } }),
    db.monthlyFinancial.findMany({ where: { organizationId, ...fyWhere(year, organization.fyeMonth) } }),
  ]);

  const revenue = monthly.reduce((a, r) => a + Number(r.revenue), 0);
  const costOfSales = monthly.reduce((a, r) => a + Number(r.opCost), 0);
  const grossProfit = revenue - costOfSales;
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const sellExp = monthly.reduce((a, r) => a + Number(r.sellExp), 0);
  const adminExp = monthly.reduce((a, r) => a + Number(r.adminExp), 0);
  const rndExp = monthly.reduce((a, r) => a + Number(r.rndExp), 0);
  const financeExp = monthly.reduce((a, r) => a + Number(r.financeExp), 0);
  const totalExpenses = sellExp + adminExp + rndExp + financeExp;
  const operatingProfit = grossProfit - totalExpenses;
  const netProfit = monthly.reduce((a, r) => a + Number(r.netProfit), 0);
  const netMarginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  const byEntity: ConsolidatedEntityRow[] = [];
  for (const s of subsidiaries) {
    const rows = monthly.filter((m) => m.subsidiaryId === s.id);
    if (rows.length === 0) continue;
    const rev = rows.reduce((a, r) => a + Number(r.revenue), 0);
    const np = rows.reduce((a, r) => a + Number(r.netProfit), 0);
    byEntity.push({ id: s.id, name: localizedName(s, locale), revenue: rev, netProfit: np, netMarginPct: rev > 0 ? (np / rev) * 100 : 0 });
  }
  const hqRows = monthly.filter((m) => !m.subsidiaryId);
  if (hqRows.length > 0) {
    const rev = hqRows.reduce((a, r) => a + Number(r.revenue), 0);
    const np = hqRows.reduce((a, r) => a + Number(r.netProfit), 0);
    byEntity.push({ id: "__hq__", name: locale === "en" ? "Group HQ" : "集团总部", revenue: rev, netProfit: np, netMarginPct: rev > 0 ? (np / rev) * 100 : 0 });
  }
  byEntity.sort((a, b) => b.revenue - a.revenue);

  return {
    companyName: organization.name,
    year,
    fyeMonth: organization.fyeMonth,
    revenue,
    costOfSales,
    grossProfit,
    grossMarginPct,
    sellExp,
    adminExp,
    rndExp,
    financeExp,
    totalExpenses,
    operatingProfit,
    netProfit,
    netMarginPct,
    byEntity,
    generatedAt: new Date(),
  };
}

export interface ConsolidatedBalanceSheetEntityRow {
  id: string;
  name: string;
  equity: number;
  debtRatio: number;
  totalAssets: number;
  totalLiabilities: number;
}

export interface ConsolidatedBalanceSheet {
  companyName: string;
  year: number;
  fyeMonth: number;
  /** True when every figure is the month-end balance sheet archived at the financial year-end (not today's balance). */
  fromSnapshot: boolean;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  debtRatioPct: number;
  byEntity: ConsolidatedBalanceSheetEntityRow[];
  // Consolidation adjustments applied to get from Σ(byEntity) to the totals above — surfaced so
  // the report can disclose them rather than leaving a silent gap between the entity breakdown
  // and the group total. Both are 0 when HQ has no investment in / balance due to its
  // subsidiaries on file.
  investmentInSubsidiariesEliminated: number;
  intercompanyEliminated: number;
  generatedAt: Date;
}

// assets = equity ÷ (1 − debtRatio%), derived from debtRatio% = liabilities ÷ assets and
// assets = equity + liabilities — the same derivation Overview's Total Assets KPI uses. Balance
// sheet figures (equity/debtRatio) are a CURRENT snapshot per entity, not a historical series
// like MonthlyFinancial, so — unlike the Income Statement — there's no real "as at [past date]"
// figure to recompute for a prior year; every generation reflects whatever equity/debtRatio is
// on file right now (from the latest Xero sync or Balance Sheet import), regardless of which
// year it's filed under.
function deriveAssetsAndLiabilities(equity: number, debtRatio: number): { totalAssets: number; totalLiabilities: number } {
  const totalAssets = debtRatio < 100 ? equity / (1 - debtRatio / 100) : equity;
  return { totalAssets, totalLiabilities: totalAssets - equity };
}

export async function computeConsolidatedBalanceSheet(organizationId: string, year: number, locale: Locale): Promise<ConsolidatedBalanceSheet> {
  const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const [subsidiaries, snapshots] = await Promise.all([
    db.subsidiary.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" } }),
    // The balance sheet archived at the financial year-end (captured from Xero on each sync) — the real "as at" figures.
    db.balanceSheetMonthly.findMany({ where: { organizationId, year, month: organization.fyeMonth } }),
  ]);
  const snapshotOf = new Map(snapshots.map((r) => [r.subsidiaryId, r]));
  let fromSnapshotCount = 0;
  let fallbackCount = 0;
  const rowFromSnapshot = (id: string, name: string, r: (typeof snapshots)[number]): ConsolidatedBalanceSheetEntityRow => {
    const totalAssets = Number(r.totalAssets);
    const totalLiabilities = Number(r.totalLiabilities);
    return { id, name, equity: Number(r.totalEquity), debtRatio: totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0, totalAssets, totalLiabilities };
  };

  const byEntity: ConsolidatedBalanceSheetEntityRow[] = [];
  for (const s of subsidiaries) {
    const snap = snapshotOf.get(s.id);
    if (snap) {
      byEntity.push(rowFromSnapshot(s.id, localizedName(s, locale), snap));
      fromSnapshotCount++;
      continue;
    }
    const equity = Number(s.equity);
    const debtRatio = Number(s.debtRatio);
    if (equity === 0 && debtRatio === 0) continue; // no balance sheet data on file for this entity yet
    const { totalAssets, totalLiabilities } = deriveAssetsAndLiabilities(equity, debtRatio);
    byEntity.push({ id: s.id, name: localizedName(s, locale), equity, debtRatio, totalAssets, totalLiabilities });
    fallbackCount++;
  }
  const hqName = locale === "en" ? "Group HQ" : "集团总部";
  const hqSnap = snapshotOf.get(null);
  const hqEquity = Number(organization.equity);
  const hqDebtRatio = Number(organization.debtRatio);
  if (hqSnap) {
    byEntity.push(rowFromSnapshot("__hq__", hqName, hqSnap));
    fromSnapshotCount++;
  } else if (hqEquity !== 0 || hqDebtRatio !== 0) {
    const { totalAssets, totalLiabilities } = deriveAssetsAndLiabilities(hqEquity, hqDebtRatio);
    byEntity.push({ id: "__hq__", name: hqName, equity: hqEquity, debtRatio: hqDebtRatio, totalAssets, totalLiabilities });
    fallbackCount++;
  }
  byEntity.sort((a, b) => b.totalAssets - a.totalAssets);

  // byEntity holds each entity's own STANDALONE balance sheet — summing those naively double
  // counts the subsidiary's net assets (once as HQ's "Investment in Subsidiary" asset, once as
  // the subsidiary's own equity) and double counts any intercompany balance between them (a real
  // liability/asset on each entity's own books, but not a claim against anyone outside the
  // group). These two consolidation eliminations are applied here, against HQ's side only —
  // see the Organization.investmentInSubsidiaries/dueToSubsidiaries schema comment.
  const investmentInSubsidiariesEliminated = Number(organization.investmentInSubsidiaries);
  const dueToSubsidiaries = Number(organization.dueToSubsidiaries);
  // A positive dueToSubsidiaries is a liability on HQ's books (owes the subsidiary) to remove
  // from Group liabilities; negative means it was actually an asset (subsidiary owes HQ) to
  // remove from Group assets instead. Either way it's the same amount removed from both sides,
  // so it never affects equity — unlike the investment elimination, which does.
  const intercompanyEliminated = Math.abs(dueToSubsidiaries);

  const rawTotalAssets = byEntity.reduce((a, r) => a + r.totalAssets, 0);
  const rawTotalLiabilities = byEntity.reduce((a, r) => a + r.totalLiabilities, 0);
  const totalAssets = rawTotalAssets - investmentInSubsidiariesEliminated - Math.max(0, -dueToSubsidiaries);
  const totalLiabilities = rawTotalLiabilities - Math.max(0, dueToSubsidiaries);
  const totalEquity = totalAssets - totalLiabilities;
  const debtRatioPct = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;

  return {
    companyName: organization.name,
    year,
    fyeMonth: organization.fyeMonth,
    fromSnapshot: fromSnapshotCount > 0 && fallbackCount === 0,
    totalAssets,
    totalLiabilities,
    totalEquity,
    debtRatioPct,
    byEntity,
    investmentInSubsidiariesEliminated,
    intercompanyEliminated,
    generatedAt: new Date(),
  };
}

export interface ConsolidatedCashFlowEntityRow {
  id: string;
  name: string;
  ocf: number;
  icf: number;
  fcf: number;
  netChange: number;
}

export interface ConsolidatedCashFlow {
  companyName: string;
  year: number;
  fyeMonth: number;
  ocf: number;
  icf: number;
  fcf: number;
  netChange: number;
  byEntity: ConsolidatedCashFlowEntityRow[];
  generatedAt: Date;
}

// CashFlowMonthly rows are per-entity (subsidiaryId: null = HQ), same as MonthlyFinancial — the
// Group total sums across every entity's rows, exactly like the Income Statement/Balance Sheet.
export async function computeConsolidatedCashFlow(organizationId: string, year: number, locale: Locale): Promise<ConsolidatedCashFlow> {
  const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const [subsidiaries, cashflow] = await Promise.all([
    db.subsidiary.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" } }),
    db.cashFlowMonthly.findMany({ where: { organizationId, ...fyWhere(year, organization.fyeMonth) } }),
  ]);

  const rowFor = (rows: typeof cashflow): { ocf: number; icf: number; fcf: number } => ({
    ocf: rows.reduce((a, c) => a + Number(c.ocf), 0),
    icf: rows.reduce((a, c) => a + Number(c.icf), 0),
    fcf: rows.reduce((a, c) => a + Number(c.fcf), 0),
  });

  const byEntity: ConsolidatedCashFlowEntityRow[] = [];
  for (const s of subsidiaries) {
    const rows = cashflow.filter((c) => c.subsidiaryId === s.id);
    if (rows.length === 0) continue;
    const { ocf, icf, fcf } = rowFor(rows);
    byEntity.push({ id: s.id, name: localizedName(s, locale), ocf, icf, fcf, netChange: ocf + icf + fcf });
  }
  const hqRows = cashflow.filter((c) => !c.subsidiaryId);
  if (hqRows.length > 0) {
    const { ocf, icf, fcf } = rowFor(hqRows);
    byEntity.push({ id: "__hq__", name: locale === "en" ? "Group HQ" : "集团总部", ocf, icf, fcf, netChange: ocf + icf + fcf });
  }
  byEntity.sort((a, b) => b.netChange - a.netChange);

  const { ocf, icf, fcf } = rowFor(cashflow);
  return { companyName: organization.name, year, fyeMonth: organization.fyeMonth, ocf, icf, fcf, netChange: ocf + icf + fcf, byEntity, generatedAt: new Date() };
}

// A single report packaging the same 4 statements a real Singapore statutory audited report
// contains (Statement of Financial Position, Consolidated Statement of Comprehensive Income,
// Statement of Changes in Equity, Consolidated Statement of Cash Flows), in the same Group/
// Company side-by-side layout — built by studying a real audited report's structure. Reuses the
// existing compute functions rather than re-deriving anything; the only genuinely new logic here
// is the prior-year comparison (income statement/cash flow) and the Group/Company split for
// Changes in Equity. Deliberately does NOT include an "Independent Auditor's Report" — that's a
// licensed public accountant's professional opinion and signature, which nothing in this system
// can produce; the report page renders a clearly-labelled placeholder for it instead, matching
// how audit-jurisdiction.ts already treats the Internal Audit Report as distinct from a
// statutory external audit opinion.
export interface AuditedFinancialStatements {
  companyName: string;
  year: number;
  priorYear: number;
  fyeMonth: number;
  generatedAt: Date;
  incomeStatement: ConsolidatedIncomeStatement;
  priorIncomeStatement: ConsolidatedIncomeStatement;
  balanceSheet: ConsolidatedBalanceSheet;
  companyBalanceSheet: ConsolidatedBalanceSheetEntityRow | null; // the HQ/"Company"-only row, split out of balanceSheet.byEntity
  cashFlow: ConsolidatedCashFlow;
  priorCashFlow: ConsolidatedCashFlow;
  equityRollForward: {
    scope: "group" | "company";
    openingEquity: number;
    netProfit: number;
    otherMovements: number; // share capital, dividends and other equity movements (only known when the opening balance is archived)
    openingFromSnapshot: boolean; // opening = the archived balance sheet at the prior year-end, not derived
    closingEquity: number;
  }[];
}

export async function computeAuditedFinancialStatements(organizationId: string, year: number, locale: Locale): Promise<AuditedFinancialStatements> {
  const priorYear = year - 1;
  const [incomeStatement, priorIncomeStatement, balanceSheet, priorBalanceSheet, cashFlow, priorCashFlow] = await Promise.all([
    computeConsolidatedIncomeStatement(organizationId, year, locale),
    computeConsolidatedIncomeStatement(organizationId, priorYear, locale),
    computeConsolidatedBalanceSheet(organizationId, year, locale),
    computeConsolidatedBalanceSheet(organizationId, priorYear, locale),
    computeConsolidatedCashFlow(organizationId, year, locale),
    computeConsolidatedCashFlow(organizationId, priorYear, locale),
  ]);

  const companyBalanceSheet = balanceSheet.byEntity.find((e) => e.id === "__hq__") ?? null;

  // Changes in Equity roll-forward: opening equity is derived as (current equity − this year's
  // net profit) — the closest real approximation available, since equity/debtRatio are a CURRENT
  // snapshot only (no stored prior-year balance to roll forward from; same limitation already
  // noted on deriveAssetsAndLiabilities above). Valid as long as there were no share
  // capital/reserve movements during the year — a reasonable default, not a stored historical
  // fact, so the report page must label this as computed rather than presenting it as an exact
  // audited opening balance.
  // When BOTH year-ends have an archived balance sheet, the opening equity is the real prior year-end figure and whatever
  // is left after net profit is shown as "other movements" (share capital, dividends…). Otherwise it is derived as before.
  const archived = balanceSheet.fromSnapshot && priorBalanceSheet.fromSnapshot;
  const groupOpening = archived ? priorBalanceSheet.totalEquity : balanceSheet.totalEquity - incomeStatement.netProfit;
  const priorCompanyEquity = priorBalanceSheet.byEntity.find((e) => e.id === "__hq__")?.equity ?? null;
  const companyNetProfit = incomeStatement.byEntity.find((e) => e.id === "__hq__")?.netProfit ?? 0;
  const equityRollForward: AuditedFinancialStatements["equityRollForward"] = [
    {
      scope: "group" as const,
      openingEquity: groupOpening,
      netProfit: incomeStatement.netProfit,
      otherMovements: archived ? balanceSheet.totalEquity - groupOpening - incomeStatement.netProfit : 0,
      openingFromSnapshot: archived,
      closingEquity: balanceSheet.totalEquity,
    },
    ...(companyBalanceSheet
      ? (() => {
          const companyArchived = archived && priorCompanyEquity !== null;
          const opening = companyArchived ? (priorCompanyEquity as number) : companyBalanceSheet.equity - companyNetProfit;
          return [
            {
              scope: "company" as const,
              openingEquity: opening,
              netProfit: companyNetProfit,
              otherMovements: companyArchived ? companyBalanceSheet.equity - opening - companyNetProfit : 0,
              openingFromSnapshot: companyArchived,
              closingEquity: companyBalanceSheet.equity,
            },
          ];
        })()
      : []),
  ];

  return {
    companyName: incomeStatement.companyName,
    year,
    priorYear,
    fyeMonth: incomeStatement.fyeMonth,
    generatedAt: new Date(),
    incomeStatement,
    priorIncomeStatement,
    balanceSheet,
    companyBalanceSheet,
    cashFlow,
    priorCashFlow,
    equityRollForward,
  };
}
