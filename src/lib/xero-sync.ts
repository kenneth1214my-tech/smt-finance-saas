import "server-only";
import { db } from "@/lib/db";
import {
  fetchXeroProfitAndLoss,
  fetchXeroContactsPage,
  fetchXeroAgedReceivablesByContact,
  fetchXeroAgedPayablesByContact,
  fetchXeroBudgetSummary,
  fetchXeroBankSummary,
  fetchXeroBalanceSheet,
  type XeroContact,
} from "@/lib/xero";
import { getValidXeroAccessToken } from "@/lib/xero-token";
import { parseXeroPnl } from "@/lib/xero-pnl-parser";
import { oldestDueAgingDays, statusFromAgingDays } from "@/lib/xero-aging-parser";
import { parseXeroBudgetSummary, parseXeroBankSummary } from "@/lib/xero-budget-bank-parser";
import { parseXeroBalanceSheet } from "@/lib/xero-balance-sheet-parser";
import { getBaseCurrency } from "@/lib/currency";
import { computeSyncedRiskRating, worse, type RiskSeverity } from "@/lib/risk-rating";
import { applyCategoryMapping, type ExpenseCategory } from "@/lib/expense-categories";
import type { XeroConnection } from "@prisma/client";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function monthDateRange(year: number, month: number) {
  const from = `${year}-${pad(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${pad(month)}-${pad(lastDay)}`;
  return { from, to };
}

// Trailing N months, most-recent-completed-month first (excludes the current, still-open month).
function trailingMonths(count: number): { year: number; month: number }[] {
  const now = new Date();
  const list: { year: number; month: number }[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    list.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return list;
}

async function mapInBatches<T, R>(items: T[], batchSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    results.push(...(await Promise.all(batch.map(fn))));
  }
  return results;
}

async function fetchAllContacts(accessToken: string, tenantId: string): Promise<XeroContact[]> {
  const all: XeroContact[] = [];
  for (let page = 1; ; page++) {
    const batch = await fetchXeroContactsPage(accessToken, tenantId, page);
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

export interface XeroSyncResult {
  ok: boolean;
  monthsSynced: number;
  monthsFailed: number;
  customersSynced: number;
  payablesSynced: number;
  bankAccountsSynced: number;
  equity: number | null;
  debtRatio: number | null;
  riskRating: RiskSeverity | null;
  errors: string[];
}

// Single source of truth for "sync everything Xero has for this subsidiary" — used by both the
// admin-triggered manual sync button and the scheduled cron job, so the two can never drift
// into doing different things. Each of the four sync steps is independently try/caught so one
// failing step (e.g. a report Xero doesn't have permission for) doesn't block the others.
export async function syncSubsidiaryFromXero(subsidiaryId: string, organizationId: string, months = 3): Promise<XeroSyncResult> {
  const errors: string[] = [];
  const connection = await db.xeroConnection.findUnique({ where: { subsidiaryId } });
  if (!connection || !connection.connectedAt || !connection.tenantId) {
    return { ok: false, monthsSynced: 0, monthsFailed: 0, customersSynced: 0, payablesSynced: 0, bankAccountsSynced: 0, equity: null, debtRatio: null, riskRating: null, errors: ["not_connected"] };
  }

  let accessToken: string;
  try {
    accessToken = await getValidXeroAccessToken(connection);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markSyncResult(connection, message);
    return { ok: false, monthsSynced: 0, monthsFailed: 0, customersSynced: 0, payablesSynced: 0, bankAccountsSynced: 0, equity: null, debtRatio: null, riskRating: null, errors: [message] };
  }
  const tenantId = connection.tenantId;

  const result = {
    monthsSynced: 0,
    monthsFailed: 0,
    customersSynced: 0,
    payablesSynced: 0,
    bankAccountsSynced: 0,
    equity: null as number | null,
    debtRatio: null as number | null,
    riskRating: null as RiskSeverity | null,
  };
  let worstArStatus: RiskSeverity = "GOOD";

  // 1. P&L — trailing N months. Cron runs a short window (recent months only); the manual
  // button still asks for a full 24-month backfill via the `months` param.
  const categoryMappingRows = await db.expenseCategoryMapping.findMany({ where: { organizationId } });
  const categoryMapping = Object.fromEntries(categoryMappingRows.map((m) => [m.accountLabel, m.category as ExpenseCategory]));
  const periods = trailingMonths(months);
  for (let i = 0; i < periods.length; i += 2) {
    const batch = periods.slice(i, i + 2);
    await Promise.all(
      batch.map(async ({ year, month }) => {
        try {
          const { from, to } = monthDateRange(year, month);
          const report = await fetchXeroProfitAndLoss(accessToken, tenantId, from, to);
          const { revenue, costOfSales, netProfit, expenseLineItems } = parseXeroPnl(report);
          const grossMarginPct = revenue > 0 ? ((revenue - costOfSales) / revenue) * 100 : 0;
          // Only mapped labels (plus the narrow finance-keyword auto-suggestion) contribute —
          // unmapped line items are simply not yet categorized, not silently dropped from the
          // group's real totals (revenue/opCost/netProfit above are unaffected either way).
          const { sellExp, adminExp, rndExp, financeExp } = applyCategoryMapping(expenseLineItems, categoryMapping);
          await db.monthlyFinancial.upsert({
            where: { subsidiaryId_year_month: { subsidiaryId, year, month } },
            create: { subsidiaryId, organizationId, year, month, revenue, netProfit, grossMarginPct, opCost: costOfSales, sellExp, adminExp, rndExp, financeExp },
            update: { revenue, netProfit, grossMarginPct, opCost: costOfSales, sellExp, adminExp, rndExp, financeExp },
          });
          result.monthsSynced++;
        } catch (err) {
          result.monthsFailed++;
          errors.push(`P&L ${year}-${month}: ${err instanceof Error ? err.message : String(err)}`);
        }
      })
    );
  }

  // 2. AR/AP
  try {
    const contacts = await fetchAllContacts(accessToken, tenantId);
    const arContacts = contacts.filter((c) => c.IsCustomer && Number(c.Balances?.AccountsReceivable?.Outstanding ?? 0) > 0);
    const apContacts = contacts.filter((c) => c.IsSupplier && Number(c.Balances?.AccountsPayable?.Outstanding ?? 0) > 0);

    const arRows = await mapInBatches(arContacts, 2, async (c) => {
      const report = await fetchXeroAgedReceivablesByContact(accessToken, tenantId, c.ContactID);
      const agingDays = oldestDueAgingDays(report);
      return { organizationId, nameZh: c.Name, nameEn: c.Name, subsidiaryId, balance: Number(c.Balances?.AccountsReceivable?.Outstanding ?? 0), agingDays, status: statusFromAgingDays(agingDays) };
    });
    const apRows = await mapInBatches(apContacts, 2, async (c) => {
      const report = await fetchXeroAgedPayablesByContact(accessToken, tenantId, c.ContactID);
      const agingDays = oldestDueAgingDays(report);
      return { organizationId, nameZh: c.Name, nameEn: c.Name, subsidiaryId, balance: Number(c.Balances?.AccountsPayable?.Outstanding ?? 0), agingDays, status: statusFromAgingDays(agingDays) };
    });

    await db.$transaction([
      db.aRCustomer.deleteMany({ where: { subsidiaryId } }),
      db.payable.deleteMany({ where: { subsidiaryId } }),
      ...(arRows.length ? [db.aRCustomer.createMany({ data: arRows })] : []),
      ...(apRows.length ? [db.payable.createMany({ data: apRows })] : []),
    ]);
    result.customersSynced = arRows.length;
    result.payablesSynced = apRows.length;
    worstArStatus = arRows.reduce((worstSoFar, r) => worse(worstSoFar, r.status), "GOOD" as RiskSeverity);
  } catch (err) {
    errors.push(`AR/AP: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3a. Budget — separate try/catch from Bank below: they used to share one, which meant a
  // Budget failure silently skipped Bank too (it's called second, after Budget) and the combined
  // "Budget/Bank: ..." error message couldn't say which of the two actually failed.
  const year = new Date().getFullYear();
  try {
    const budgetReport = await fetchXeroBudgetSummary(accessToken, tenantId, `${year}-01-01`, 12);
    const { revenueBudget, costBudgetRate, expenseBudgetRate } = parseXeroBudgetSummary(budgetReport);
    await db.budget.upsert({
      where: { subsidiaryId_year: { subsidiaryId, year } },
      create: { subsidiaryId, organizationId, year, revenueBudget, costBudgetRate, expenseBudgetRate },
      update: { revenueBudget, costBudgetRate, expenseBudgetRate },
    });
  } catch (err) {
    errors.push(`Budget: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3b. Bank Accounts
  try {
    const now = new Date();
    const bankReport = await fetchXeroBankSummary(accessToken, tenantId, `${year}-01-01`, now.toISOString().slice(0, 10));
    const bankAccounts = parseXeroBankSummary(bankReport);
    const currency = await getBaseCurrency(organizationId);
    for (const acct of bankAccounts) {
      const existing = await db.bankAccount.findFirst({ where: { organizationId, subsidiaryId, bankEn: acct.name } });
      if (existing) await db.bankAccount.update({ where: { id: existing.id }, data: { balance: acct.balance } });
      else await db.bankAccount.create({ data: { organizationId, subsidiaryId, bankZh: acct.name, bankEn: acct.name, acctType: "general", balance: acct.balance, currency } });
    }
    result.bankAccountsSynced = bankAccounts.length;
  } catch (err) {
    errors.push(`Bank: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 4. Balance Sheet -> Subsidiary.equity/debtRatio
  let syncedDebtRatio: number | null = null;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const report = await fetchXeroBalanceSheet(accessToken, tenantId, today);
    const { totalAssets, totalLiabilities, totalEquity } = parseXeroBalanceSheet(report);
    const debtRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;
    await db.subsidiary.update({ where: { id: subsidiaryId }, data: { equity: totalEquity, debtRatio } });
    result.equity = totalEquity;
    result.debtRatio = debtRatio;
    syncedDebtRatio = debtRatio;
  } catch (err) {
    errors.push(`Balance Sheet: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 5. Risk rating — a subsidiary's riskRating was pure manual entry and, left untouched,
  // stayed "GOOD" forever regardless of what the sync above just found. Escalate it (never
  // downgrade — see computeSyncedRiskRating) using the real debt ratio and AR aging severity
  // this run just synced, so "组织架构管理" reflects reality instead of a stale default. Falls
  // back to the subsidiary's last-known debt ratio if the Balance Sheet step above failed, so a
  // one-off report error doesn't reset the computation to an optimistic "no debt" assumption.
  try {
    const current = await db.subsidiary.findUniqueOrThrow({ where: { id: subsidiaryId } });
    const debtRatioForRisk = syncedDebtRatio ?? Number(current.debtRatio);
    const computed = computeSyncedRiskRating(current.riskRating, debtRatioForRisk, worstArStatus);
    if (computed !== current.riskRating) {
      await db.subsidiary.update({ where: { id: subsidiaryId }, data: { riskRating: computed } });
    }
    result.riskRating = computed;
  } catch (err) {
    errors.push(`Risk rating: ${err instanceof Error ? err.message : String(err)}`);
  }

  await markSyncResult(connection, errors.length ? errors.join("; ") : null);

  return {
    ok: errors.length === 0,
    monthsSynced: result.monthsSynced,
    monthsFailed: result.monthsFailed,
    customersSynced: result.customersSynced,
    payablesSynced: result.payablesSynced,
    bankAccountsSynced: result.bankAccountsSynced,
    equity: result.equity,
    debtRatio: result.debtRatio,
    riskRating: result.riskRating,
    errors,
  };
}

async function markSyncResult(connection: XeroConnection, error: string | null) {
  await db.xeroConnection.update({ where: { id: connection.id }, data: { lastSyncAt: new Date(), lastSyncError: error } });
}
