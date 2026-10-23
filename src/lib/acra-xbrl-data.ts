import "server-only";
import { db } from "@/lib/db";
import { fyWhere } from "@/lib/financial-year";
import { buildAcraPack, type AcraPack, type AcraScope, type AcraTemplate, type BalanceInput, type CashFlowInput, type PeriodInput, type PnlInput } from "@/lib/acra-xbrl";

type Num = { toString(): string } | number | null | undefined;
const n = (v: Num) => Number(v ?? 0);

// Company level = the legal entity itself (the group/HQ rows); group = every entity added together (no eliminations).
const scopeWhere = (scope: AcraScope) => (scope === "company" ? { subsidiaryId: null } : {});

async function periodOf(organizationId: string, year: number, fyeMonth: number, scope: AcraScope): Promise<PeriodInput> {
  const [monthly, cash, balances] = await Promise.all([
    db.monthlyFinancial.findMany({ where: { organizationId, ...fyWhere(year, fyeMonth), ...scopeWhere(scope) } }),
    db.cashFlowMonthly.findMany({ where: { organizationId, ...fyWhere(year, fyeMonth), ...scopeWhere(scope) } }),
    db.balanceSheetMonthly.findMany({ where: { organizationId, year, month: fyeMonth, ...scopeWhere(scope) } }),
  ]);

  const sum = <T,>(rows: T[], pick: (r: T) => Num) => rows.reduce((a, r) => a + n(pick(r)), 0);
  const pnl: PnlInput | null =
    monthly.length === 0
      ? null
      : {
          revenue: sum(monthly, (r) => r.revenue),
          costOfSales: sum(monthly, (r) => r.opCost),
          sellExp: sum(monthly, (r) => r.sellExp),
          adminExp: sum(monthly, (r) => r.adminExp),
          rndExp: sum(monthly, (r) => r.rndExp),
          financeExp: sum(monthly, (r) => r.financeExp),
          employmentCost: sum(monthly, (r) => r.employmentCost),
          netProfit: sum(monthly, (r) => r.netProfit),
        };
  const cf: CashFlowInput | null = cash.length === 0 ? null : { ocf: sum(cash, (r) => r.ocf), icf: sum(cash, (r) => r.icf), fcf: sum(cash, (r) => r.fcf) };
  const bs: BalanceInput | null =
    balances.length === 0
      ? null
      : {
          totalAssets: sum(balances, (r) => r.totalAssets),
          totalLiabilities: sum(balances, (r) => r.totalLiabilities),
          totalEquity: sum(balances, (r) => r.totalEquity),
          cash: sum(balances, (r) => r.cash),
          clearing: sum(balances, (r) => r.clearing),
          loans: sum(balances, (r) => r.loans),
          opAssets: sum(balances, (r) => r.opAssets),
          fixedAssets: sum(balances, (r) => r.fixedAssets),
          finAssets: sum(balances, (r) => r.finAssets),
          opLiabilities: sum(balances, (r) => r.opLiabilities),
          finLiabilities: sum(balances, (r) => r.finLiabilities),
          receivables: sum(balances, (r) => r.receivables),
          inventory: sum(balances, (r) => r.inventory),
          loansCurrent: sum(balances, (r) => r.loansCurrent),
          finLiabCurrent: sum(balances, (r) => r.finLiabCurrent),
          shareCapital: sum(balances, (r) => r.shareCapital),
          detailed: balances.every((r) => r.detailed),
          equityDetailed: balances.every((r) => r.equityDetailed),
        };
  return { pnl, bs, cf };
}

export async function loadAcraPack(opts: { organizationId: string; year: number; scope: AcraScope; template?: AcraTemplate; isZh: boolean }): Promise<AcraPack> {
  const org = await db.organization.findUniqueOrThrow({ where: { id: opts.organizationId } });
  const [current, prior] = await Promise.all([periodOf(org.id, opts.year, org.fyeMonth, opts.scope), periodOf(org.id, opts.year - 1, org.fyeMonth, opts.scope)]);
  return buildAcraPack({
    entityName: org.name,
    uen: org.registrationNo,
    scope: opts.scope,
    year: opts.year,
    fyeMonth: org.fyeMonth,
    template: opts.template,
    accountingFramework: org.accountingFramework === "SFRS_SE" ? "SFRS_SE" : "SFRS_I",
    isZh: opts.isZh,
    current,
    prior,
  });
}
