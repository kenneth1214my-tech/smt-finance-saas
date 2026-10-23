import "server-only";
import { db } from "@/lib/db";
import { fyWhere } from "@/lib/financial-year";
import { buildAcraPack, type AcraPack, type AcraScope, type AcraTemplate, type BalanceInput, type CashFlowInput, type PeriodInput, type PnlInput } from "@/lib/acra-xbrl";

type Num = { toString(): string } | number | null | undefined;
const n = (v: Num) => Number(v ?? 0);

/** Which legal entity the statements are for: the company itself ("hq"), the sum of everything ("group"), or one subsidiary (its id). */
export type AcraEntity = "hq" | "group" | (string & {});

const entityFilter = (entity: AcraEntity) => (entity === "group" ? {} : entity === "hq" ? { subsidiaryId: null } : { subsidiaryId: entity });

async function periodOf(organizationId: string, year: number, fyeMonth: number, entity: AcraEntity): Promise<PeriodInput> {
  const [monthly, cash, balances] = await Promise.all([
    db.monthlyFinancial.findMany({ where: { organizationId, ...fyWhere(year, fyeMonth), ...entityFilter(entity) } }),
    db.cashFlowMonthly.findMany({ where: { organizationId, ...fyWhere(year, fyeMonth), ...entityFilter(entity) } }),
    db.balanceSheetMonthly.findMany({ where: { organizationId, year, month: fyeMonth, ...entityFilter(entity) } }),
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

export async function loadAcraPack(opts: { organizationId: string; year: number; entity: AcraEntity; template?: AcraTemplate; isZh: boolean }): Promise<AcraPack> {
  const org = await db.organization.findUniqueOrThrow({ where: { id: opts.organizationId } });
  const sub = opts.entity === "hq" || opts.entity === "group" ? null : await db.subsidiary.findFirst({ where: { id: opts.entity, organizationId: org.id } });
  if (opts.entity !== "hq" && opts.entity !== "group" && !sub) throw new Error("unknown_entity");
  // Each legal entity files with its own name, UEN and year-end (a subsidiary can close on a different month).
  const fyeMonth = sub ? sub.fyeMonth : org.fyeMonth;
  const [current, prior] = await Promise.all([periodOf(org.id, opts.year, fyeMonth, opts.entity), periodOf(org.id, opts.year - 1, fyeMonth, opts.entity)]);
  const scope: AcraScope = opts.entity === "group" ? "group" : "company";
  return buildAcraPack({
    entityName: sub ? sub.nameEn : org.name,
    uen: sub ? sub.registrationNo : org.registrationNo,
    scope,
    year: opts.year,
    fyeMonth,
    template: opts.template,
    accountingFramework: org.accountingFramework === "SFRS_SE" ? "SFRS_SE" : "SFRS_I",
    isZh: opts.isZh,
    current,
    prior,
  });
}
