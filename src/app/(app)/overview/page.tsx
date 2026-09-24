import { TrendingUp, Percent, CircleDollarSign, Wallet, Landmark, Building2 } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary, withBaseCurrency, fmtMoney } from "@/lib/i18n/dictionaries";
import { localizedSegment } from "@/lib/localize";
import { getBaseCurrency, getExchangeRates, convertToBase } from "@/lib/currency";
import Topbar from "@/components/Topbar";
import Card from "@/components/ui/Card";
import KpiTile from "@/components/ui/KpiTile";

export default async function OverviewPage() {
  const user = await requireUser();
  const locale = await getServerLocale();

  const YEAR = new Date().getFullYear();
  const organizationId = user.organizationId;

  const [bySubsidiary, subsidiaries, organization, monthlyRows, cashflow, banks, arCustomers, baseCurrency, rates] = await Promise.all([
    db.monthlyFinancial.groupBy({
      by: ["subsidiaryId"],
      where: { year: YEAR, organizationId },
      _sum: { revenue: true, netProfit: true, opCost: true },
    }),
    db.subsidiary.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" } }),
    db.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    db.monthlyFinancial.findMany({ where: { year: YEAR, organizationId } }),
    db.cashFlowMonthly.findMany({ where: { year: YEAR, organizationId } }),
    db.bankAccount.findMany({ where: { organizationId } }),
    db.aRCustomer.findMany({ where: { organizationId } }),
    getBaseCurrency(organizationId),
    getExchangeRates(organizationId),
  ]);

  const dict = withBaseCurrency(getDictionary(locale), locale, baseCurrency);

  const latestMonth = monthlyRows.length ? monthlyRows.reduce((a, b) => (b.month > a.month ? b : a)) : null;

  const totalRevenue = bySubsidiary.reduce((sum, r) => sum + Number(r._sum.revenue ?? 0), 0);
  const totalNetProfit = bySubsidiary.reduce((sum, r) => sum + Number(r._sum.netProfit ?? 0), 0);
  const totalCost = bySubsidiary.reduce((sum, r) => sum + Number(r._sum.opCost ?? 0), 0);
  const latestGrossMargin = latestMonth ? Number(latestMonth.grossMarginPct) : 0;
  // Real period expenses (below the gross-profit line), summed from the same fields 经营分析
  // uses — previously this multiplied revenue by a hardcoded 18.7% ("estimated"), a leftover
  // from before sellExp/adminExp/rndExp/financeExp existed as real entered/synced figures.
  const periodExpenses = monthlyRows.reduce((a, r) => a + Number(r.sellExp) + Number(r.adminExp) + Number(r.rndExp) + Number(r.financeExp), 0);
  const opProfit = totalRevenue - totalCost - periodExpenses;
  const totalOcf = cashflow.reduce((a, c) => a + Number(c.ocf), 0);

  // Total Assets: prefer a real balance sheet (equity + debt ratio, from Xero sync or the
  // Balance Sheet import) per entity — assets = equity ÷ (1 − debtRatio%), derived from
  // debtRatio% = liabilities ÷ assets and assets = equity + liabilities. Falls back to that
  // same entity's own bank + receivables total only when it has no balance sheet data at all
  // (equity and debtRatio both still at their zero default) — the previous org-wide cash+AR
  // proxy silently ignored equity/debtRatio entirely, so an entity with a real balance sheet on
  // file never actually flowed through to this KPI.
  const bankBaseByEntity = new Map<string | null, number>();
  for (const b of banks) {
    const amount = convertToBase(Number(b.balance), b.currency, baseCurrency, rates) ?? Number(b.balance);
    bankBaseByEntity.set(b.subsidiaryId, (bankBaseByEntity.get(b.subsidiaryId) ?? 0) + amount);
  }
  const arByEntity = new Map<string | null, number>();
  for (const c of arCustomers) {
    arByEntity.set(c.subsidiaryId, (arByEntity.get(c.subsidiaryId) ?? 0) + Number(c.balance));
  }
  function entityAssets(subsidiaryId: string | null, equity: number, debtRatio: number): number {
    if (equity !== 0 || debtRatio !== 0) {
      return debtRatio < 100 ? equity / (1 - debtRatio / 100) : equity;
    }
    return (bankBaseByEntity.get(subsidiaryId) ?? 0) + (arByEntity.get(subsidiaryId) ?? 0);
  }
  // Naively summing each entity's own standalone assets double-counts the subsidiary's net
  // assets — once via HQ's own "Investment in Subsidiary" asset (baked into entityAssets(null,
  // ...) above), once via the subsidiary's own assets — and double-counts any intercompany
  // balance the same way. Eliminate both, mirroring computeConsolidatedBalanceSheet.
  const investmentInSubsidiariesEliminated = Number(organization.investmentInSubsidiaries);
  const dueToSubsidiaries = Number(organization.dueToSubsidiaries);
  const totalAssets =
    subsidiaries.reduce((sum, s) => sum + entityAssets(s.id, Number(s.equity), Number(s.debtRatio)), 0) +
    entityAssets(null, Number(organization.equity), Number(organization.debtRatio)) -
    investmentInSubsidiariesEliminated -
    Math.max(0, -dueToSubsidiaries);

  const subMap = new Map(subsidiaries.map((s) => [s.id, s]));
  // A pseudo-entity standing in for the group/HQ-level bucket (subsidiaryId === null) in the
  // breakdown views below — otherwise HQ's contribution vanishes from every chart even though
  // it's still fully counted in totalRevenue/totalNetProfit/totalCost above, so a large HQ
  // import could move the KPI tiles with no visible explanation anywhere on the page.
  const HQ_PSEUDO_SUB = {
    id: "__hq__",
    colorHex: "#64748b",
    nameZh: "集团总部",
    nameZhTw: "集團總部",
    nameEn: "Group HQ",
    nameMs: "Group HQ",
    nameId: "Group HQ",
    segmentZh: "集团总部",
    segmentZhTw: "集團總部",
    segmentEn: "Group HQ",
    segmentMs: "Group HQ",
    segmentId: "Group HQ",
  };
  const profitBySub = bySubsidiary
    .flatMap((r) => {
      const sub = r.subsidiaryId ? subMap.get(r.subsidiaryId) : HQ_PSEUDO_SUB;
      const profit = Number(r._sum.netProfit ?? 0);
      const revenue = Number(r._sum.revenue ?? 0);
      if (!sub) return [];
      if (sub === HQ_PSEUDO_SUB && profit === 0 && revenue === 0) return []; // no HQ-level data on file — don't clutter the breakdown with an empty row
      return [{ sub, profit, revenue }];
    })
    .sort((a, b) => b.profit - a.profit);

  const fmt1 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmtM = (n: number) => fmtMoney(n, locale);

  return (
    <>
      <Topbar dict={dict} locale={locale} title={dict.nav.overview} desc={dict.overview.pageDesc} user={user} />
      <div className="mx-auto w-full max-w-[1480px] flex-1 space-y-4 px-[26px] py-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <KpiTile icon={TrendingUp} color="var(--cat-1)" label={dict.overview.kpiRevenue} value={fmtM(totalRevenue)} unit={dict.common.yi} />
          <KpiTile icon={Percent} color="var(--cat-2)" label={dict.overview.kpiGrossMargin} value={fmt1(latestGrossMargin)} unit="%" />
          <KpiTile icon={CircleDollarSign} color="var(--status-good)" label={dict.overview.kpiOpProfit} value={fmtM(opProfit)} unit={dict.common.yi} />
          <KpiTile icon={Wallet} color="var(--cat-4)" label={dict.overview.kpiNetProfit} value={fmtM(totalNetProfit)} unit={dict.common.yi} />
          <KpiTile icon={Landmark} color="var(--cat-3)" label={dict.overview.kpiOcf} value={fmtM(totalOcf)} unit={dict.common.yi} />
          <KpiTile icon={Building2} color="var(--cat-5)" label={dict.overview.kpiTotalAssets} value={fmtM(totalAssets)} unit={dict.common.yi} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={dict.overview.profitStructCard} unit={dict.common.yi}>
            <div className="space-y-2.5">
              {profitBySub.map((row) => {
                // Share of the GROUP total (can be a net loss, not just a net profit) — dividing
                // by a negative total is still a meaningful "share of the loss" figure, so only
                // an exact-zero total (nothing to take a share of) falls back to 0%. Bar width
                // uses the magnitude since a signed percentage can't size a bar directly (e.g. an
                // entity that's profitable while the group overall is a loss gets a negative
                // share, meaning it offset the loss rather than contributed to it).
                const pct = totalNetProfit !== 0 ? (row.profit / totalNetProfit) * 100 : 0;
                const barPct = Math.max(0, Math.min(Math.abs(pct), 100));
                return (
                  <div key={row.sub.id}>
                    <div className="mb-1 flex items-center justify-between text-[12.5px]">
                      <span className="font-semibold" style={{ color: "var(--ink-900)" }}>
                        {localizedSegment(row.sub, locale)}
                      </span>
                      <span className="tabular-nums font-bold" style={{ color: row.profit < 0 ? "var(--status-critical)" : "var(--ink-900)" }}>
                        {fmtM(row.profit)} {dict.common.yi} · {pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-[7px] overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                      <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: row.sub.colorHex }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title={locale === "en" ? "Subsidiary revenue" : "子公司营业收入"} unit={dict.common.yi}>
            <div className="space-y-2.5">
              {profitBySub
                .slice()
                .sort((a, b) => b.revenue - a.revenue)
                .map((row, i) => {
                  const max = Math.max(...profitBySub.map((r) => r.revenue));
                  const pct = max > 0 ? (row.revenue / max) * 100 : 0;
                  return (
                    <div key={row.sub.id} className="flex items-center gap-2.5">
                      <div
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-extrabold text-white"
                        style={{ background: ["#D4A24C", "#9AA6A0", "#B07A52", "var(--ink-400)", "var(--ink-400)"][i] }}
                      >
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center justify-between text-[12.5px]">
                          <span className="truncate font-semibold" style={{ color: "var(--ink-900)" }}>
                            {locale === "en" ? row.sub.nameEn : row.sub.nameZh}
                          </span>
                          <span className="tabular-nums font-bold" style={{ color: "var(--ink-900)" }}>
                            {fmtM(row.revenue)}
                          </span>
                        </div>
                        <div className="h-[7px] overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: row.sub.colorHex }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </Card>
        </div>

        <div
          className="rounded-2xl border p-4 text-xs"
          style={{ background: "color-mix(in srgb, var(--cat-1) 6%, var(--surface))", borderColor: "var(--border-strong)", color: "var(--ink-600)" }}
        >
          {locale === "en"
            ? "This is the production build: all 11 modules read live data from PostgreSQL via Prisma. Real ERP integration (e.g. Yonyou/Kingdee/SAP) is not connected yet."
            : "这是正式系统:全部11个模块均通过 Prisma 从 PostgreSQL 实时读取数据。真实 ERP 系统对接(如用友/金蝶/SAP)尚未接入。"}
        </div>
      </div>
    </>
  );
}
