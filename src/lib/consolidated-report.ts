import "server-only";
import { db } from "@/lib/db";
import { localizedName } from "@/lib/localize";
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
  year: number;
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
  const [organization, subsidiaries, monthly] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    db.subsidiary.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" } }),
    db.monthlyFinancial.findMany({ where: { organizationId, year } }),
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
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  debtRatioPct: number;
  byEntity: ConsolidatedBalanceSheetEntityRow[];
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
  const [organization, subsidiaries] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    db.subsidiary.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" } }),
  ]);

  const byEntity: ConsolidatedBalanceSheetEntityRow[] = [];
  for (const s of subsidiaries) {
    const equity = Number(s.equity);
    const debtRatio = Number(s.debtRatio);
    if (equity === 0 && debtRatio === 0) continue; // no balance sheet data on file for this entity yet
    const { totalAssets, totalLiabilities } = deriveAssetsAndLiabilities(equity, debtRatio);
    byEntity.push({ id: s.id, name: localizedName(s, locale), equity, debtRatio, totalAssets, totalLiabilities });
  }
  const hqEquity = Number(organization.equity);
  const hqDebtRatio = Number(organization.debtRatio);
  if (hqEquity !== 0 || hqDebtRatio !== 0) {
    const { totalAssets, totalLiabilities } = deriveAssetsAndLiabilities(hqEquity, hqDebtRatio);
    byEntity.push({ id: "__hq__", name: locale === "en" ? "Group HQ" : "集团总部", equity: hqEquity, debtRatio: hqDebtRatio, totalAssets, totalLiabilities });
  }
  byEntity.sort((a, b) => b.totalAssets - a.totalAssets);

  const totalAssets = byEntity.reduce((a, r) => a + r.totalAssets, 0);
  const totalLiabilities = byEntity.reduce((a, r) => a + r.totalLiabilities, 0);
  const totalEquity = byEntity.reduce((a, r) => a + r.equity, 0);
  const debtRatioPct = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;

  return { companyName: organization.name, year, totalAssets, totalLiabilities, totalEquity, debtRatioPct, byEntity, generatedAt: new Date() };
}

export interface ConsolidatedCashFlow {
  companyName: string;
  year: number;
  ocf: number;
  icf: number;
  fcf: number;
  netChange: number;
  generatedAt: Date;
}

// CashFlowMonthly has no subsidiaryId — it's tracked at the group level only, so unlike the
// Income Statement / Balance Sheet there's no per-entity breakdown available here.
export async function computeConsolidatedCashFlow(organizationId: string, year: number): Promise<ConsolidatedCashFlow> {
  const [organization, cashflow] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    db.cashFlowMonthly.findMany({ where: { organizationId, year } }),
  ]);
  const ocf = cashflow.reduce((a, c) => a + Number(c.ocf), 0);
  const icf = cashflow.reduce((a, c) => a + Number(c.icf), 0);
  const fcf = cashflow.reduce((a, c) => a + Number(c.fcf), 0);
  return { companyName: organization.name, year, ocf, icf, fcf, netChange: ocf + icf + fcf, generatedAt: new Date() };
}
