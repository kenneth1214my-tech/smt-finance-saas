import "server-only";
import { db } from "@/lib/db";
import { fetchXeroBalanceSheetSeries } from "@/lib/xero";
import { parseBalanceSheetSeries, deriveMonth, type MonthSnapshot, type PnlMonth } from "@/lib/cashflow-derive";

export { depreciationOf, type PnlMonth } from "@/lib/cashflow-derive";

const r2 = (n: number) => Math.round(n * 100) / 100;

function monthEnd(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

// Fetches the balance sheets needed for `months`, derives each month's flows (see
// cashflow-derive.ts) and stores them per entity. Returns problems instead of throwing so one
// failed step never fails the rest of the sync.
export async function syncDerivedCashFlow(args: {
  accessToken: string;
  tenantId: string;
  organizationId: string;
  subsidiaryId: string | null;
  months: { year: number; month: number }[];
  pnl: Map<string, PnlMonth>;
}): Promise<{ stored: number; errors: string[] }> {
  const { accessToken, tenantId, organizationId, subsidiaryId, months, pnl } = args;
  const errors: string[] = [];
  if (months.length === 0) return { stored: 0, errors };

  const ordered = [...months].sort((a, b) => a.year - b.year || a.month - b.month);
  const newest = ordered[ordered.length - 1];
  const needed = ordered.length + 1; // each flow needs the previous month-end too
  const balances = new Map<string, MonthSnapshot>();
  try {
    const reports = await fetchXeroBalanceSheetSeries(accessToken, tenantId, monthEnd(newest.year, newest.month), needed);
    for (const report of reports) {
      const { byMonth, warnings } = parseBalanceSheetSeries(report);
      byMonth.forEach((v, k) => balances.set(k, v));
      for (const w of warnings) if (!errors.includes(w)) errors.push(w);
    }
  } catch (err) {
    return { stored: 0, errors: [`Cash flow (balance sheets): ${err instanceof Error ? err.message : String(err)}`] };
  }

  // Keep every month-end balance sheet we just fetched (including the opening one) — free, since the
  // columns were needed for the cash flow anyway — so past month-ends can be reported as they stood.
  for (const [key, b] of balances) {
    const [y, m] = key.split("-").map(Number);
    // The still-open current month is not a month-end yet — it would be overwritten on every sync and
    // mislabelled as closed — so only completed months are stored.
    if (new Date(Date.UTC(y, m, 0)) > new Date()) continue;
    const data = {
      totalAssets: r2(b.totalAssets), totalLiabilities: r2(b.totalLiabilities), totalEquity: r2(b.totalEquity),
      cash: r2(b.cash), loans: r2(b.loan), clearing: r2(b.clearing), opAssets: r2(b.opAsset), fixedAssets: r2(b.fixed),
      finAssets: r2(b.finAsset), opLiabilities: r2(b.opLiab), finLiabilities: r2(b.finLiab),
      receivables: r2(b.receivables), inventory: r2(b.inventory), loansCurrent: r2(b.loanCurrent), finLiabCurrent: r2(b.finLiabCurrent), detailed: true,
      shareCapital: r2(b.shareCapital), dividends: r2(b.dividends), equityDetailed: true,
    };
    try {
      if (subsidiaryId) {
        await db.balanceSheetMonthly.upsert({
          where: { subsidiaryId_year_month: { subsidiaryId, year: y, month: m } },
          create: { organizationId, subsidiaryId, year: y, month: m, ...data },
          update: data,
        });
      } else {
        // NULL subsidiaryIds are distinct in the compound unique, so HQ rows can't use upsert.
        const existing = await db.balanceSheetMonthly.findFirst({ where: { organizationId, subsidiaryId: null, year: y, month: m } });
        if (existing) await db.balanceSheetMonthly.update({ where: { id: existing.id }, data });
        else await db.balanceSheetMonthly.create({ data: { organizationId, subsidiaryId: null, year: y, month: m, ...data } });
      }
    } catch (err) {
      errors.push(`Balance sheet ${y}-${m}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let stored = 0;
  for (const { year, month } of ordered) {
    const prevY = month === 1 ? year - 1 : year;
    const prevM = month === 1 ? 12 : month - 1;
    const prev = balances.get(`${prevY}-${prevM}`);
    const cur = balances.get(`${year}-${month}`);
    const p = pnl.get(`${year}-${month}`);
    if (!prev || !cur || !p) continue; // can't derive a month without both balance sheets and its P&L
    const flow = deriveMonth(prev, cur, p);
    const residual = r2(flow.deltaCash - (flow.ocf + flow.icf + flow.fcf));
    if (Math.abs(residual) > 1) errors.push(`Cash flow ${year}-${month}: derived flows differ from the change in cash by ${residual} — check the balance sheet grouping`);
    try {
      const data = { ocf: flow.ocf, icf: flow.icf, fcf: flow.fcf };
      if (subsidiaryId) {
        await db.cashFlowMonthly.upsert({
          where: { subsidiaryId_year_month: { subsidiaryId, year, month } },
          create: { organizationId, subsidiaryId, year, month, ...data },
          update: data,
        });
      } else {
        // Postgres treats NULLs as distinct in the compound unique, so HQ rows can't use upsert.
        const existing = await db.cashFlowMonthly.findFirst({ where: { organizationId, subsidiaryId: null, year, month } });
        if (existing) await db.cashFlowMonthly.update({ where: { id: existing.id }, data });
        else await db.cashFlowMonthly.create({ data: { organizationId, subsidiaryId: null, year, month, ...data } });
      }
      stored++;
    } catch (err) {
      errors.push(`Cash flow ${year}-${month}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { stored, errors };
}
