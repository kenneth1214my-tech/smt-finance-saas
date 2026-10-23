import { Landmark, CalendarClock, AlertTriangle, Scale } from "lucide-react";
import { requireAdmin } from "@/lib/dal";
import { db } from "@/lib/db";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary, withBaseCurrency, fmtMoney } from "@/lib/i18n/dictionaries";
import { getBaseCurrency } from "@/lib/currency";
import { computeCorporateTax, effectiveFilingStatus, currentGstQuarter } from "@/lib/tax";
import { getJurisdictionConfig, computeHkProfitsTax, hkDraftFilings } from "@/lib/jurisdiction";
import { computeHkSchedule, type HkScheduleInput, type HkScheduleRow } from "@/lib/hk-tax-schedule";
import { fyMonths, fyOf, fyOpen } from "@/lib/financial-year";
import Topbar from "@/components/Topbar";
import KpiTile from "@/components/ui/KpiTile";
import TaxCenterClient from "./TaxCenterClient";
import KpiBreakdown from "@/components/ui/KpiBreakdown";
import { localizedName } from "@/lib/localize";
import { buildTaxKpiSections, type TaxProvisionView } from "@/lib/tax-kpi-breakdown";
import { currentFiscal } from "@/lib/fiscal";

// Prisma Decimal / Date instances aren't plain-serializable across the server->client
// boundary; round-trip through JSON so every field becomes a plain string/number.
function toPlain<T>(rows: T): T {
  return JSON.parse(JSON.stringify(rows));
}

export default async function TaxPage() {
  const user = await requireAdmin();
  const locale = await getServerLocale();
  const organizationId = user.organizationId;
  const baseCurrency = await getBaseCurrency(organizationId);
  const dict = withBaseCurrency(getDictionary(locale), locale, baseCurrency);
  const fmtM = (n: number) => fmtMoney(n, locale);

  const [subsidiaries, provisions, deferredItems, monthlyFinancials] = await Promise.all([
    db.subsidiary.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" } }),
    db.corporateTaxProvision.findMany({ where: { organizationId }, include: { subsidiary: true }, orderBy: [{ year: "desc" }] }),
    db.deferredTaxItem.findMany({ where: { organizationId }, include: { subsidiary: true }, orderBy: [{ year: "desc" }] }),
    db.monthlyFinancial.findMany({ where: { organizationId }, select: { subsidiaryId: true, year: true, month: true, netProfit: true } }),
  ]);

  const orgRow = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { jurisdiction: true, fyeMonth: true, incorporationDate: true } });
  // Each legal entity closes its own financial year (Subsidiary.fyeMonth; the group's for HQ) — profits are bucketed by FINANCIAL year.
  const fyeByKey: Record<string, number> = { HQ: orgRow.fyeMonth };
  for (const s of subsidiaries) fyeByKey[s.id] = s.fyeMonth;
  // Net profit before tax, per entity per year, straight from Xero-synced P&L data already in
  // the system (MonthlyFinancial) — feeds the "generate draft provisions" shortcut so chargeable
  // income doesn't have to be retyped from a number that's already on file.
  const netProfitByEntity: Record<string, Record<number, number>> = {};
  for (const mf of monthlyFinancials) {
    const key = mf.subsidiaryId ?? "HQ";
    netProfitByEntity[key] ??= {};
    const fy = fyOf(mf.year, mf.month, fyeByKey[key] ?? 12);
    netProfitByEntity[key][fy] = (netProfitByEntity[key][fy] ?? 0) + Number(mf.netProfit);
  }

  // Auto-create this quarter's GST F5 filing as a draft (due date only, figures left for the
  // user to fill in — see currentGstQuarter's doc comment) so the obligation is on the tracker as
  // soon as the quarter starts, not only once someone remembers to add it. skipDuplicates relies
  // on TaxFiling's (subsidiaryId, type, periodLabel) unique constraint to stay correct under
  // concurrent page loads — a plain "check then create" here raced and produced a real duplicate
  // in production before that constraint existed.
  // The country edition decides which obligations are auto-tracked: Singapore → the quarterly GST F5; Hong Kong has no GST,
  // so → profits tax return (per year of assessment), Employer's Return (BIR56A) and the Annual Return (NAR1).
  const org = orgRow;
  const cfg = getJurisdictionConfig(org.jurisdiction);
  if (cfg.hasGst) {
    const gstQuarter = currentGstQuarter();
    const entities: { subsidiaryId: string | null }[] = [{ subsidiaryId: null }, ...subsidiaries.map((s) => ({ subsidiaryId: s.id }))];
    await db.taxFiling.createMany({
      data: entities.map((e) => ({
        organizationId,
        subsidiaryId: e.subsidiaryId,
        type: "GST_F5" as const,
        periodLabel: gstQuarter.periodLabel,
        dueDate: gstQuarter.dueDate,
        status: "UPCOMING" as const,
        notes: "Auto-created from the quarterly GST filing schedule — delete if this entity isn't GST-registered for this period.",
      })),
      skipDuplicates: true,
    });
  } else {
    const nowDate = new Date();
    const hkEntities = [
      { subsidiaryId: null as string | null, fyeMonth: org.fyeMonth, annual: true },
      ...subsidiaries.map((s) => ({ subsidiaryId: s.id as string | null, fyeMonth: s.fyeMonth, annual: false })),
    ];
    const drafts = hkEntities.flatMap((e) => hkDraftFilings({ now: nowDate, fyeMonth: e.fyeMonth, incorporationDate: org.incorporationDate, includeAnnualReturn: e.annual }).map((d) => ({ ...d, subsidiaryId: e.subsidiaryId })));
    if (drafts.length > 0) {
      await db.taxFiling.createMany({
        data: drafts.map((d) => ({ organizationId, subsidiaryId: d.subsidiaryId, type: d.type, periodLabel: d.periodLabel, dueDate: d.dueDate, status: "UPCOMING" as const, notes: d.notes })),
        skipDuplicates: true,
      });
    }
  }
  const filings = await db.taxFiling.findMany({ where: { organizationId }, include: { subsidiary: true }, orderBy: [{ dueDate: "asc" }] });

  // Hong Kong: the profits tax computation schedule (accounting profit → assessable profits, losses carried forward, tax).
  // Accounting depreciation is added back automatically, derived from the fixed-asset movement over the financial year
  // (investing cash flow and the archived month-end balance sheets); every other adjustment is entered per provision.
  let adjustmentRows: Awaited<ReturnType<typeof db.taxAdjustment.findMany>> = [];
  const scheduleByProvision: Record<string, HkScheduleRow> = {};
  if (cfg.code === "HK" && provisions.length > 0) {
    const [adj, cashflows, balances] = await Promise.all([
      db.taxAdjustment.findMany({ where: { organizationId } }),
      db.cashFlowMonthly.findMany({ where: { organizationId }, select: { subsidiaryId: true, year: true, month: true, icf: true } }),
      db.balanceSheetMonthly.findMany({ where: { organizationId }, select: { subsidiaryId: true, year: true, month: true, fixedAssets: true } }),
    ]);
    adjustmentRows = adj;
    const fixedAt = new Map(balances.map((b) => [`${b.subsidiaryId ?? "HQ"}|${b.year}-${b.month}`, Number(b.fixedAssets)]));
    const icfAt = new Map(cashflows.map((c) => [`${c.subsidiaryId ?? "HQ"}|${c.year}-${c.month}`, Number(c.icf)]));
    const derivedDepreciation = (entityKey: string, fy: number, fye: number): number | null => {
      let icf = 0;
      for (const m of fyMonths(fy, fye)) {
        const v = icfAt.get(`${entityKey}|${m.year}-${m.month}`);
        if (v === undefined) return null; // a month of the year has no derived cash flow
        icf += v;
      }
      const open = fyOpen(fy, fye);
      const fo = fixedAt.get(`${entityKey}|${open.year}-${open.month}`);
      const fc = fixedAt.get(`${entityKey}|${fy}-${fye}`);
      if (fo === undefined || fc === undefined) return null; // no archived balance sheet at one of the year-ends
      return Math.max(0, -icf - (fc - fo)); // investing outflow = additions = Δ net fixed assets + depreciation
    };
    const inputs: HkScheduleInput[] = provisions.map((p) => {
      const entityKey = p.subsidiaryId ?? "HQ";
      return {
        id: p.id,
        entityKey,
        year: p.year,
        accountingProfit: Number(p.chargeableIncome),
        autoDepreciation: derivedDepreciation(entityKey, p.year, fyeByKey[entityKey] ?? 12),
        adjustments: adjustmentRows.filter((a) => a.provisionId === p.id).map((a) => ({ category: a.category, amount: Number(a.amount) })),
        lossesBroughtForward: Number(p.lossesBroughtForward),
        standardRatePct: Number(p.taxRatePct),
        lowerRateElected: p.lowerRateElected,
        rebatePct: Number(p.rebatePct),
        rebateCap: Number(p.rebateCap),
      };
    });
    for (const [id, row] of computeHkSchedule(inputs)) scheduleByProvision[id] = row;
  }

  const currentYear = new Date().getFullYear();
  const netPayableCurrentYear = provisions
    .filter((p) => p.year === currentYear)
    .reduce(
      (sum, p) =>
        sum +
        (cfg.code === "HK"
          ? (scheduleByProvision[p.id]?.tax.netTaxPayable ?? computeHkProfitsTax(Number(p.chargeableIncome), Number(p.taxRatePct), p.lowerRateElected, Number(p.rebatePct), Number(p.rebateCap)).netTaxPayable)
          : computeCorporateTax(Number(p.chargeableIncome), Number(p.taxRatePct), Number(p.rebatePct), Number(p.rebateCap)).netTaxPayable),
      0
    );

  const now = new Date();
  const upcomingFilings = filings.filter((f) => effectiveFilingStatus(f.status, f.dueDate, now) === "UPCOMING").length;
  const overdueFilings = filings.filter((f) => effectiveFilingStatus(f.status, f.dueDate, now) === "OVERDUE").length;
  const netDeferredTax = deferredItems.reduce((sum, d) => sum + Number(d.deferredTaxAmount), 0);

  // ---- Workings behind the four KPI tiles (see KpiBreakdown) ----
  const isZhLocale = locale === "zh" || locale === "zh-Hant";
  const entityName = (s: Parameters<typeof localizedName>[0] | null) => (s ? localizedName(s, locale) : dict.m.taxGroupHQ);
  const kpiProvisions: TaxProvisionView[] = provisions
    .filter((p) => p.year === currentYear)
    .map((p) => {
      const rate = Number(p.taxRatePct);
      const sg = computeCorporateTax(Number(p.chargeableIncome), rate, Number(p.rebatePct), Number(p.rebateCap));
      const sch = scheduleByProvision[p.id];
      const hkTax = sch?.tax ?? computeHkProfitsTax(Number(p.chargeableIncome), rate, p.lowerRateElected, Number(p.rebatePct), Number(p.rebateCap));
      const base = cfg.code === "HK" ? hkTax : sg;
      return {
        name: entityName(p.subsidiary),
        taxRatePct: rate,
        chargeableIncome: Number(p.chargeableIncome),
        exemptAmount: base.exemptAmount,
        taxableAfterExemption: cfg.code === "HK" ? 0 : sg.taxableAfterExemption,
        grossTax: base.grossTax,
        rebateAmount: base.rebateAmount,
        netTaxPayable: base.netTaxPayable,
        effectiveRatePct: base.effectiveRatePct,
        hk:
          cfg.code === "HK"
            ? { adjustmentsNet: sch?.adjustmentsNet ?? 0, lossesUtilised: sch?.lossesUtilised ?? 0, assessableProfits: sch?.assessableProfits ?? Math.max(0, Number(p.chargeableIncome)), tier1Tax: hkTax.tier1Tax, tier2Tax: hkTax.tier2Tax }
            : undefined,
      };
    });
  const typeLabelOf = new Map(cfg.filingTypes.map((t) => [t.value, t.label]));
  const filingView = (f: (typeof filings)[number]) => ({ name: entityName(f.subsidiary), typeLabel: typeLabelOf.get(f.type) ?? f.type, periodLabel: f.periodLabel, dueDate: f.dueDate });
  const kpiSections = buildTaxKpiSections({
    jurisdiction: cfg.code,
    isZh: isZhLocale,
    year: currentYear,
    provisions: kpiProvisions,
    upcoming: filings.filter((f) => effectiveFilingStatus(f.status, f.dueDate, now) === "UPCOMING").map(filingView),
    overdue: filings.filter((f) => effectiveFilingStatus(f.status, f.dueDate, now) === "OVERDUE").map(filingView),
    deferred: deferredItems.map((d) => ({ name: entityName(d.subsidiary), year: d.year, description: d.description, temporaryDifference: Number(d.temporaryDifference), deferredTax: Number(d.deferredTaxAmount) })),
    now,
  });

  // Singapore: ACRA XBRL tab — the latest financial year that has already ended is the one being filed.
  let acra: { years: number[]; defaultYear: number; entities: { id: string; name: string; uen: string | null }[] } | undefined;
  if (cfg.code === "SG") {
    const org = await db.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { fyeMonth: true, registrationNo: true, name: true } });
    const cur = currentFiscal(org.fyeMonth, now);
    const curEnd = new Date(Date.UTC(cur.year, org.fyeMonth, 0)); // last day of the financial year-end month
    const defaultYear = curEnd.getTime() < now.getTime() ? cur.year : cur.year - 1;
    // Each legal entity files its own statements: the company itself, every subsidiary, plus the (unfileable) group total.
    acra = {
      years: [cur.year, cur.year - 1, cur.year - 2, cur.year - 3, cur.year - 4],
      defaultYear,
      entities: [
        { id: "hq", name: org.name, uen: org.registrationNo },
        ...subsidiaries.map((s) => ({ id: s.id, name: s.nameEn, uen: s.registrationNo })),
        { id: "group", name: dict.m.taxGroupHQ, uen: org.registrationNo },
      ],
    };
  }

  return (
    <>
      <Topbar dict={dict} locale={locale} title={dict.nav.tax} desc={cfg.code === "HK" ? (locale === "zh" || locale === "zh-Hant" ? "利得税预提、申报与缴款跟踪、递延税项及公司注册处/税务局申报日历（香港无 GST），按总部/子公司分主体记录" : "Profits tax provision, filing & payment tracking, deferred tax and the IRD / Companies Registry filing calendar (Hong Kong has no GST) — tracked per entity (HQ / subsidiary)") : dict.m.taxPageDesc} user={user} />
      <div className="mx-auto w-full max-w-[1480px] flex-1 space-y-4 px-[26px] py-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiTile icon={Landmark} color="var(--cat-1)" label={dict.m.taxKpiNetPayable} value={fmtM(netPayableCurrentYear)} unit={dict.common.yi} />
          <KpiTile icon={CalendarClock} color="var(--status-warning)" label={dict.m.taxKpiUpcomingFilings} value={String(upcomingFilings)} />
          <KpiTile icon={AlertTriangle} color="var(--status-critical)" label={dict.m.taxKpiOverdueFilings} value={String(overdueFilings)} />
          <KpiTile icon={Scale} color="var(--cat-2)" label={dict.m.taxKpiDeferredTax} value={fmtM(netDeferredTax)} unit={dict.common.yi} />
        </div>

        <KpiBreakdown
          sections={kpiSections}
          locale={locale}
          unit={baseCurrency}
          heading={isZhLocale ? "指标明细与计算过程" : "KPI breakdown & calculation"}
          hint={isZhLocale ? "点击展开，查看每个税务指标的计算公式、逐项明细与说明，便于复核。" : "Click a KPI to see its formula, line items and an explanation so every figure can be re-checked."}
        />

        <TaxCenterClient
          jurisdiction={cfg.code}
          adjustments={toPlain(adjustmentRows)}
          schedule={scheduleByProvision}
          fyeByKey={fyeByKey}
          locale={locale}
          unit={dict.common.yi}
          dict={dict}
          subsidiaries={toPlain(subsidiaries)}
          provisions={toPlain(provisions)}
          filings={toPlain(filings)}
          deferredItems={toPlain(deferredItems)}
          netProfitByEntity={netProfitByEntity}
          acra={acra}
        />
      </div>
    </>
  );
}
