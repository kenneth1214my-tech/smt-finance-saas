import { Landmark, CalendarClock, AlertTriangle, Scale } from "lucide-react";
import { requireAdmin } from "@/lib/dal";
import { db } from "@/lib/db";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary, withBaseCurrency, fmtMoney } from "@/lib/i18n/dictionaries";
import { getBaseCurrency } from "@/lib/currency";
import { computeCorporateTax, effectiveFilingStatus, currentGstQuarter } from "@/lib/tax";
import Topbar from "@/components/Topbar";
import KpiTile from "@/components/ui/KpiTile";
import TaxCenterClient from "./TaxCenterClient";

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
    db.monthlyFinancial.findMany({ where: { organizationId }, select: { subsidiaryId: true, year: true, netProfit: true } }),
  ]);

  // Net profit before tax, per entity per year, straight from Xero-synced P&L data already in
  // the system (MonthlyFinancial) — feeds the "generate draft provisions" shortcut so chargeable
  // income doesn't have to be retyped from a number that's already on file.
  const netProfitByEntity: Record<string, Record<number, number>> = {};
  for (const mf of monthlyFinancials) {
    const key = mf.subsidiaryId ?? "HQ";
    netProfitByEntity[key] ??= {};
    netProfitByEntity[key][mf.year] = (netProfitByEntity[key][mf.year] ?? 0) + Number(mf.netProfit);
  }

  // Auto-create this quarter's GST F5 filing as a draft (due date only, figures left for the
  // user to fill in — see currentGstQuarter's doc comment) so the obligation is on the tracker as
  // soon as the quarter starts, not only once someone remembers to add it.
  const gstQuarter = currentGstQuarter();
  const entities: { subsidiaryId: string | null }[] = [{ subsidiaryId: null }, ...subsidiaries.map((s) => ({ subsidiaryId: s.id }))];
  const existingGstThisQuarter = await db.taxFiling.findMany({ where: { organizationId, type: "GST_F5", periodLabel: gstQuarter.periodLabel } });
  const existingGstKeys = new Set(existingGstThisQuarter.map((f) => f.subsidiaryId ?? "HQ"));
  const missingGstEntities = entities.filter((e) => !existingGstKeys.has(e.subsidiaryId ?? "HQ"));
  if (missingGstEntities.length > 0) {
    await db.taxFiling.createMany({
      data: missingGstEntities.map((e) => ({
        organizationId,
        subsidiaryId: e.subsidiaryId,
        type: "GST_F5" as const,
        periodLabel: gstQuarter.periodLabel,
        dueDate: gstQuarter.dueDate,
        status: "UPCOMING" as const,
        notes: "Auto-created from the quarterly GST filing schedule — delete if this entity isn't GST-registered for this period.",
      })),
    });
  }
  const filings = await db.taxFiling.findMany({ where: { organizationId }, include: { subsidiary: true }, orderBy: [{ dueDate: "asc" }] });

  const currentYear = new Date().getFullYear();
  const netPayableCurrentYear = provisions
    .filter((p) => p.year === currentYear)
    .reduce((sum, p) => sum + computeCorporateTax(Number(p.chargeableIncome), Number(p.taxRatePct), Number(p.rebatePct), Number(p.rebateCap)).netTaxPayable, 0);

  const now = new Date();
  const upcomingFilings = filings.filter((f) => effectiveFilingStatus(f.status, f.dueDate, now) === "UPCOMING").length;
  const overdueFilings = filings.filter((f) => effectiveFilingStatus(f.status, f.dueDate, now) === "OVERDUE").length;
  const netDeferredTax = deferredItems.reduce((sum, d) => sum + Number(d.deferredTaxAmount), 0);

  return (
    <>
      <Topbar dict={dict} locale={locale} title={dict.nav.tax} desc={dict.m.taxPageDesc} user={user} />
      <div className="mx-auto w-full max-w-[1480px] flex-1 space-y-4 px-[26px] py-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiTile icon={Landmark} color="var(--cat-1)" label={dict.m.taxKpiNetPayable} value={fmtM(netPayableCurrentYear)} unit={dict.common.yi} />
          <KpiTile icon={CalendarClock} color="var(--status-warning)" label={dict.m.taxKpiUpcomingFilings} value={String(upcomingFilings)} />
          <KpiTile icon={AlertTriangle} color="var(--status-critical)" label={dict.m.taxKpiOverdueFilings} value={String(overdueFilings)} />
          <KpiTile icon={Scale} color="var(--cat-2)" label={dict.m.taxKpiDeferredTax} value={fmtM(netDeferredTax)} unit={dict.common.yi} />
        </div>

        <TaxCenterClient
          locale={locale}
          unit={dict.common.yi}
          dict={dict}
          subsidiaries={toPlain(subsidiaries)}
          provisions={toPlain(provisions)}
          filings={toPlain(filings)}
          deferredItems={toPlain(deferredItems)}
          netProfitByEntity={netProfitByEntity}
        />
      </div>
    </>
  );
}
