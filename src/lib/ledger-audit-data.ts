import "server-only";
import { db } from "@/lib/db";
import { localizedName } from "@/lib/localize";
import type { Locale } from "@/lib/i18n/dictionaries";
import { runLedgerChecks, type LedgerAccountSeries, type LedgerEntityInput, type LedgerEntityResult, type LedgerGroup } from "@/lib/ledger-audit";

const key = (y: number, m: number) => `${y}-${m}`;

/**
 * Runs the deferred revenue / prepayment / accrual checks for the company itself and every subsidiary, from the account balances the
 * Xero sync stores (AccountBalanceMonthly) and the P&L / balance-sheet totals already on file. Returns [] if the table is not there yet
 * (database not migrated) so the audit page still opens.
 */
export async function loadLedgerAudit(organizationId: string, locale: Locale): Promise<LedgerEntityResult[]> {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const sinceYear = new Date().getFullYear() - 2;
  try {
    const [subsidiaries, accounts, monthly, sheets] = await Promise.all([
      db.subsidiary.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" } }),
      db.accountBalanceMonthly.findMany({ where: { organizationId, year: { gte: sinceYear } } }),
      db.monthlyFinancial.findMany({ where: { organizationId, year: { gte: sinceYear } } }),
      db.balanceSheetMonthly.findMany({ where: { organizationId, year: { gte: sinceYear } }, select: { subsidiaryId: true, year: true, month: true, opAssets: true, opLiabilities: true } }),
    ]);

    const entities: LedgerEntityInput[] = [
      { id: null, label: isZh ? "集团总部" : "Group HQ" },
      ...subsidiaries.map((s) => ({ id: s.id as string | null, label: localizedName(s, locale) })),
    ].map((e) => {
      const mine = <T extends { subsidiaryId: string | null }>(rows: T[]) => rows.filter((r) => r.subsidiaryId === e.id);
      const byAccount = new Map<string, LedgerAccountSeries>();
      for (const a of mine(accounts)) {
        const id = `${a.group}|${a.section}|${a.accountName}`;
        const s = byAccount.get(id) ?? { group: a.group as LedgerGroup, name: a.accountName, section: a.section as "asset" | "liability", balances: {} };
        s.balances[key(a.year, a.month)] = Number(a.balance);
        byAccount.set(id, s);
      }
      const revenue: Record<string, number> = {};
      const opex: Record<string, number> = {};
      for (const m of mine(monthly)) {
        revenue[key(m.year, m.month)] = Number(m.revenue);
        opex[key(m.year, m.month)] = Number(m.opCost) + Number(m.sellExp) + Number(m.adminExp) + Number(m.rndExp) + Number(m.financeExp);
      }
      const opAssets: Record<string, number> = {};
      const opLiabilities: Record<string, number> = {};
      for (const b of mine(sheets)) {
        opAssets[key(b.year, b.month)] = Number(b.opAssets);
        opLiabilities[key(b.year, b.month)] = Number(b.opLiabilities);
      }
      return { id: e.id, label: e.label, accounts: [...byAccount.values()], revenue, opex, opAssets, opLiabilities };
    });
    return runLedgerChecks(entities, isZh);
  } catch {
    return [];
  }
}
