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
import { getValidXeroAccessToken, getValidXeroGroupAccessToken } from "@/lib/xero-token";
import { parseXeroPnl } from "@/lib/xero-pnl-parser";
import { oldestDueAgingDays, statusFromAgingDays } from "@/lib/xero-aging-parser";
import { parseXeroBudgetSummary, parseXeroBankSummary } from "@/lib/xero-budget-bank-parser";
import { parseXeroBalanceSheet } from "@/lib/xero-balance-sheet-parser";
import { getBaseCurrency } from "@/lib/currency";
import { computeSyncedRiskRating, worse, type RiskSeverity } from "@/lib/risk-rating";
import { applyCategoryMapping, type ExpenseCategory } from "@/lib/expense-categories";
import type { XeroConnection, XeroGroupConnection } from "@prisma/client";

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

// Each contact needs its own Xero API call to fetch its aged-balance detail (Xero's Reports API
// has no bulk "aged receivables for every contact" endpoint), and Xero rate-limits an app to 60
// calls/minute per organisation — so beyond a few hundred contacts, fetching them live can no
// longer finish inside one serverless invocation no matter how the batching/timeout is tuned
// (confirmed in production: Kingston HQ's 2,475 contacts timed out repeatedly at the platform's
// 300s hard limit, every single run, without ever completing the rest of the sync or recording
// why). Past this many eligible contacts, skip the live fetch so the rest of the sync (P&L,
// budget, bank, balance sheet) can still complete and the connection can still record a real
// lastSyncAt/lastSyncError — existing AR/AP data is left untouched rather than wiped, and the
// admin is pointed at the "Smart AR Aging import" bulk-file upload instead, which already handles
// this volume.
const MAX_LIVE_AGING_CONTACTS = 200;

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

    if (arContacts.length + apContacts.length > MAX_LIVE_AGING_CONTACTS) {
      throw new Error(
        `skipped — ${arContacts.length + apContacts.length} contacts is too many to fetch live within one sync; use the "Smart AR Aging import" upload instead`
      );
    }

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

async function markGroupSyncResult(connection: XeroGroupConnection, error: string | null) {
  await db.xeroGroupConnection.update({ where: { id: connection.id }, data: { lastSyncAt: new Date(), lastSyncError: error } });
}

// Group/HQ-level counterpart of syncSubsidiaryFromXero above — same four sync steps, but reads
// from XeroGroupConnection and writes to the subsidiaryId: null ("HQ") rows of the shared tables
// instead of a specific subsidiary. HQ upserts are done by hand (findFirst + create/update)
// rather than via a generated compound-unique upsert, matching the established pattern in
// /api/admin/import — the DB only has a partial unique index for "subsidiaryId IS NULL", which
// Prisma's compound-unique input can't target directly. There's no group-level risk rating field
// on Organization (unlike Subsidiary.riskRating), so that step is simply skipped.
export async function syncGroupFromXero(organizationId: string, months = 3): Promise<XeroSyncResult> {
  const errors: string[] = [];
  const connection = await db.xeroGroupConnection.findUnique({ where: { organizationId } });
  if (!connection || !connection.connectedAt || !connection.tenantId) {
    return { ok: false, monthsSynced: 0, monthsFailed: 0, customersSynced: 0, payablesSynced: 0, bankAccountsSynced: 0, equity: null, debtRatio: null, riskRating: null, errors: ["not_connected"] };
  }

  let accessToken: string;
  try {
    accessToken = await getValidXeroGroupAccessToken(connection);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markGroupSyncResult(connection, message);
    return { ok: false, monthsSynced: 0, monthsFailed: 0, customersSynced: 0, payablesSynced: 0, bankAccountsSynced: 0, equity: null, debtRatio: null, riskRating: null, errors: [message] };
  }
  const tenantId = connection.tenantId;
  // Timing instrumentation — Vercel streams console output as it's emitted, so even if the
  // function is hard-killed at the platform timeout, these markers show up in `vercel logs` and
  // reveal which step was in flight; the timeout error alone names no step. Earned its keep
  // diagnosing a real incident (a 429 retry silently sleeping for the full 300s with zero other
  // output — see xero.ts's MAX_RETRY_WAIT_SEC), kept permanently for the next one.
  const t0 = Date.now();
  const mark = (label: string) => console.log(`[syncGroupFromXero] ${label} at +${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const result = {
    monthsSynced: 0,
    monthsFailed: 0,
    customersSynced: 0,
    payablesSynced: 0,
    bankAccountsSynced: 0,
    equity: null as number | null,
    debtRatio: null as number | null,
  };

  // 1. P&L — trailing N months, HQ row per (organizationId, year, month) with subsidiaryId: null.
  mark("start");
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
          const { sellExp, adminExp, rndExp, financeExp } = applyCategoryMapping(expenseLineItems, categoryMapping);
          const data = { revenue, netProfit, grossMarginPct, opCost: costOfSales, sellExp, adminExp, rndExp, financeExp };
          const existing = await db.monthlyFinancial.findFirst({ where: { organizationId, subsidiaryId: null, year, month } });
          if (existing) await db.monthlyFinancial.update({ where: { id: existing.id }, data });
          else await db.monthlyFinancial.create({ data: { ...data, organizationId, subsidiaryId: null, year, month } });
          result.monthsSynced++;
        } catch (err) {
          result.monthsFailed++;
          errors.push(`P&L ${year}-${month}: ${err instanceof Error ? err.message : String(err)}`);
        }
      })
    );
  }

  mark("P&L done");

  // 2. AR/AP — HQ rows (subsidiaryId: null)
  try {
    mark("contacts fetch start");
    const contacts = await fetchAllContacts(accessToken, tenantId);
    mark(`contacts fetch done (${contacts.length} contacts)`);
    const arContacts = contacts.filter((c) => c.IsCustomer && Number(c.Balances?.AccountsReceivable?.Outstanding ?? 0) > 0);
    const apContacts = contacts.filter((c) => c.IsSupplier && Number(c.Balances?.AccountsPayable?.Outstanding ?? 0) > 0);

    if (arContacts.length + apContacts.length > MAX_LIVE_AGING_CONTACTS) {
      throw new Error(
        `skipped — ${arContacts.length + apContacts.length} contacts is too many to fetch live within one sync; use the "Smart AR Aging import" upload instead`
      );
    }

    const arRows = await mapInBatches(arContacts, 2, async (c) => {
      const report = await fetchXeroAgedReceivablesByContact(accessToken, tenantId, c.ContactID);
      const agingDays = oldestDueAgingDays(report);
      return { organizationId, nameZh: c.Name, nameEn: c.Name, subsidiaryId: null, balance: Number(c.Balances?.AccountsReceivable?.Outstanding ?? 0), agingDays, status: statusFromAgingDays(agingDays) };
    });
    const apRows = await mapInBatches(apContacts, 2, async (c) => {
      const report = await fetchXeroAgedPayablesByContact(accessToken, tenantId, c.ContactID);
      const agingDays = oldestDueAgingDays(report);
      return { organizationId, nameZh: c.Name, nameEn: c.Name, subsidiaryId: null, balance: Number(c.Balances?.AccountsPayable?.Outstanding ?? 0), agingDays, status: statusFromAgingDays(agingDays) };
    });

    await db.$transaction([
      db.aRCustomer.deleteMany({ where: { organizationId, subsidiaryId: null } }),
      db.payable.deleteMany({ where: { organizationId, subsidiaryId: null } }),
      ...(arRows.length ? [db.aRCustomer.createMany({ data: arRows })] : []),
      ...(apRows.length ? [db.payable.createMany({ data: apRows })] : []),
    ]);
    result.customersSynced = arRows.length;
    result.payablesSynced = apRows.length;
  } catch (err) {
    errors.push(`AR/AP: ${err instanceof Error ? err.message : String(err)}`);
  }
  mark("AR/AP step done");

  // 3a. Budget — HQ row (subsidiaryId: null)
  const year = new Date().getFullYear();
  try {
    const budgetReport = await fetchXeroBudgetSummary(accessToken, tenantId, `${year}-01-01`, 12);
    const { revenueBudget, costBudgetRate, expenseBudgetRate } = parseXeroBudgetSummary(budgetReport);
    const data = { revenueBudget, costBudgetRate, expenseBudgetRate };
    const existing = await db.budget.findFirst({ where: { organizationId, subsidiaryId: null, year } });
    if (existing) await db.budget.update({ where: { id: existing.id }, data });
    else await db.budget.create({ data: { ...data, organizationId, subsidiaryId: null, year } });
  } catch (err) {
    errors.push(`Budget: ${err instanceof Error ? err.message : String(err)}`);
  }
  mark("Budget step done");

  // 3b. Bank Accounts — HQ rows (subsidiaryId: null)
  try {
    const now = new Date();
    const bankReport = await fetchXeroBankSummary(accessToken, tenantId, `${year}-01-01`, now.toISOString().slice(0, 10));
    const bankAccounts = parseXeroBankSummary(bankReport);
    const currency = await getBaseCurrency(organizationId);
    for (const acct of bankAccounts) {
      const existing = await db.bankAccount.findFirst({ where: { organizationId, subsidiaryId: null, bankEn: acct.name } });
      if (existing) await db.bankAccount.update({ where: { id: existing.id }, data: { balance: acct.balance } });
      else await db.bankAccount.create({ data: { organizationId, subsidiaryId: null, bankZh: acct.name, bankEn: acct.name, acctType: "general", balance: acct.balance, currency } });
    }
    result.bankAccountsSynced = bankAccounts.length;
  } catch (err) {
    errors.push(`Bank: ${err instanceof Error ? err.message : String(err)}`);
  }
  mark("Bank step done");

  // 4. Balance Sheet -> Organization.equity/debtRatio (the group's own holdco figures), plus the
  // investmentInSubsidiaries/dueToSubsidiaries consolidation-elimination lines this sync can
  // detect directly from HQ's own Xero balance sheet (see xero-balance-sheet-parser.ts).
  try {
    const today = new Date().toISOString().slice(0, 10);
    const report = await fetchXeroBalanceSheet(accessToken, tenantId, today);
    const { totalAssets, totalLiabilities, totalEquity, investmentInSubsidiaries, dueToSubsidiaries } = parseXeroBalanceSheet(report);
    const debtRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;
    await db.organization.update({ where: { id: organizationId }, data: { equity: totalEquity, debtRatio, investmentInSubsidiaries, dueToSubsidiaries } });
    result.equity = totalEquity;
    result.debtRatio = debtRatio;
  } catch (err) {
    errors.push(`Balance Sheet: ${err instanceof Error ? err.message : String(err)}`);
  }
  mark("Balance Sheet step done");

  await markGroupSyncResult(connection, errors.length ? errors.join("; ") : null);
  mark("done, result recorded");

  return {
    ok: errors.length === 0,
    monthsSynced: result.monthsSynced,
    monthsFailed: result.monthsFailed,
    customersSynced: result.customersSynced,
    payablesSynced: result.payablesSynced,
    bankAccountsSynced: result.bankAccountsSynced,
    equity: result.equity,
    debtRatio: result.debtRatio,
    riskRating: null,
    errors,
  };
}

export interface ArApBatchResult {
  ok: boolean;
  processed: number;
  pendingBefore: number;
  cycleComplete: boolean;
  errors: string[];
}

// Resumable AR/AP sync — the real fix for entities with too many contacts to fetch live within
// one request (see MAX_LIVE_AGING_CONTACTS above and syncSubsidiaryFromXero/syncGroupFromXero's
// AR/AP step, which just skips entirely past that cap). Xero has no bulk "aged balances for
// every contact" endpoint, so refreshing N contacts always costs N API calls no matter how the
// code is written — the fix isn't to make each call cheaper, it's to spread them across many
// small, safe batches (one per cron tick) instead of requiring them all inside one HTTP request.
//
// Unlike the other sync steps, this does NOT delete-then-recreate every row on each run — that
// would wipe out every contact not yet reached in the current pass. Instead it upserts one
// contact's row at a time and stamps it with `syncedAt`, using `arApCycleStartedAt` (on the
// connection) as the dividing line between "already refreshed this cycle" and "still pending".
// Once nothing is left pending, the cycle closes: any row not touched this cycle is pruned (Xero
// no longer reports a balance for that contact) and the cursor resets to start the next cycle
// immediately — so, ticking every few minutes, this asymptotically approaches full, real,
// per-contact freshness for every entity regardless of contact count, with no manual import step
// and no permanent gap for older/smaller-balance contacts the way a "recent months only" or
// "top N by balance" shortcut would leave behind.
async function runArApBatch(
  accessToken: string,
  tenantId: string,
  organizationId: string,
  subsidiaryId: string | null,
  cycleStartedAt: Date | null,
  batchSize: number
): Promise<ArApBatchResult & { newCycleStartedAt: Date | null }> {
  const errors: string[] = [];
  const batchStartedAt = new Date();
  const effectiveCycleStart = cycleStartedAt ?? batchStartedAt;

  const contacts = await fetchAllContacts(accessToken, tenantId);
  const arContacts = contacts.filter((c) => c.IsCustomer && Number(c.Balances?.AccountsReceivable?.Outstanding ?? 0) > 0);
  const apContacts = contacts.filter((c) => c.IsSupplier && Number(c.Balances?.AccountsPayable?.Outstanding ?? 0) > 0);

  const [existingAr, existingAp] = await Promise.all([
    db.aRCustomer.findMany({ where: { organizationId, subsidiaryId } }),
    db.payable.findMany({ where: { organizationId, subsidiaryId } }),
  ]);
  const arByContactId = new Map(existingAr.filter((r) => r.contactId).map((r) => [r.contactId as string, r]));
  const apByContactId = new Map(existingAp.filter((r) => r.contactId).map((r) => [r.contactId as string, r]));
  // Manually-imported rows (e.g. the "Smart AR Aging import" upload) have no contactId yet — fall
  // back to matching by name so the first live-synced pass merges into that existing row instead
  // of creating a duplicate, same natural key the manual import path itself uses.
  const arByName = new Map(existingAr.filter((r) => !r.contactId).map((r) => [r.nameZh, r]));
  const apByName = new Map(existingAp.filter((r) => !r.contactId).map((r) => [r.nameZh, r]));

  const isDone = (row: { syncedAt: Date | null } | undefined) => Boolean(row?.syncedAt && row.syncedAt >= effectiveCycleStart);
  const pendingAr = arContacts.filter((c) => !isDone(arByContactId.get(c.ContactID)));
  const pendingAp = apContacts.filter((c) => !isDone(apByContactId.get(c.ContactID)));
  const pendingBefore = pendingAr.length + pendingAp.length;

  const arBatch = pendingAr.slice(0, batchSize);
  const apBatch = pendingAp.slice(0, Math.max(0, batchSize - arBatch.length));

  let processed = 0;
  for (const c of arBatch) {
    try {
      const report = await fetchXeroAgedReceivablesByContact(accessToken, tenantId, c.ContactID);
      const agingDays = oldestDueAgingDays(report);
      const data = {
        nameZh: c.Name,
        nameEn: c.Name,
        balance: Number(c.Balances?.AccountsReceivable?.Outstanding ?? 0),
        agingDays,
        status: statusFromAgingDays(agingDays),
        contactId: c.ContactID,
        syncedAt: batchStartedAt,
      };
      const existing = arByContactId.get(c.ContactID) ?? arByName.get(c.Name);
      if (existing) await db.aRCustomer.update({ where: { id: existing.id }, data });
      else await db.aRCustomer.create({ data: { ...data, organizationId, subsidiaryId } });
      processed++;
    } catch (err) {
      errors.push(`AR contact "${c.Name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  for (const c of apBatch) {
    try {
      const report = await fetchXeroAgedPayablesByContact(accessToken, tenantId, c.ContactID);
      const agingDays = oldestDueAgingDays(report);
      const data = {
        nameZh: c.Name,
        nameEn: c.Name,
        balance: Number(c.Balances?.AccountsPayable?.Outstanding ?? 0),
        agingDays,
        status: statusFromAgingDays(agingDays),
        contactId: c.ContactID,
        syncedAt: batchStartedAt,
      };
      const existing = apByContactId.get(c.ContactID) ?? apByName.get(c.Name);
      if (existing) await db.payable.update({ where: { id: existing.id }, data });
      else await db.payable.create({ data: { ...data, organizationId, subsidiaryId } });
      processed++;
    } catch (err) {
      errors.push(`AP contact "${c.Name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const cycleComplete = processed >= pendingBefore;
  if (cycleComplete) {
    // Prune rows this cycle should have refreshed but Xero no longer lists a balance for — only
    // ones the live sync has ever owned (contactId set); a manual-import row never picked up by
    // a live contact match stays untouched rather than being silently deleted.
    await db.aRCustomer.deleteMany({ where: { organizationId, subsidiaryId, contactId: { not: null }, OR: [{ syncedAt: null }, { syncedAt: { lt: effectiveCycleStart } }] } });
    await db.payable.deleteMany({ where: { organizationId, subsidiaryId, contactId: { not: null }, OR: [{ syncedAt: null }, { syncedAt: { lt: effectiveCycleStart } }] } });
  }

  return {
    ok: errors.length === 0,
    processed,
    pendingBefore,
    cycleComplete,
    errors,
    newCycleStartedAt: cycleComplete ? null : effectiveCycleStart,
  };
}

// One safe batch per call — sized so a single tick's worth of API calls (contact list pagination
// plus this many aged-report calls) stays comfortably under Xero's 60-calls/minute cap even
// alongside whatever else is sharing that budget.
const AR_AP_BATCH_SIZE = 40;

export async function syncArApBatchForSubsidiary(subsidiaryId: string, organizationId: string): Promise<ArApBatchResult> {
  const connection = await db.xeroConnection.findUnique({ where: { subsidiaryId } });
  if (!connection || !connection.connectedAt || !connection.tenantId) {
    return { ok: false, processed: 0, pendingBefore: 0, cycleComplete: false, errors: ["not_connected"] };
  }
  const accessToken = await getValidXeroAccessToken(connection);
  const result = await runArApBatch(accessToken, connection.tenantId, organizationId, subsidiaryId, connection.arApCycleStartedAt, AR_AP_BATCH_SIZE);
  await db.xeroConnection.update({ where: { id: connection.id }, data: { arApCycleStartedAt: result.newCycleStartedAt } });
  return result;
}

export async function syncArApBatchForGroup(organizationId: string): Promise<ArApBatchResult> {
  const connection = await db.xeroGroupConnection.findUnique({ where: { organizationId } });
  if (!connection || !connection.connectedAt || !connection.tenantId) {
    return { ok: false, processed: 0, pendingBefore: 0, cycleComplete: false, errors: ["not_connected"] };
  }
  const accessToken = await getValidXeroGroupAccessToken(connection);
  const result = await runArApBatch(accessToken, connection.tenantId, organizationId, null, connection.arApCycleStartedAt, AR_AP_BATCH_SIZE);
  await db.xeroGroupConnection.update({ where: { id: connection.id }, data: { arApCycleStartedAt: result.newCycleStartedAt } });
  return result;
}
