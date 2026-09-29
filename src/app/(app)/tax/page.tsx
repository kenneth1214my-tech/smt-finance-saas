import { Landmark, CalendarClock, AlertTriangle, Scale } from "lucide-react";
import { requireAdmin } from "@/lib/dal";
import { db } from "@/lib/db";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary, withBaseCurrency, fmtMoney } from "@/lib/i18n/dictionaries";
import { getBaseCurrency } from "@/lib/currency";
import { computeCorporateTax, effectiveFilingStatus } from "@/lib/tax";
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

  const [subsidiaries, provisions, filings, deferredItems] = await Promise.all([
    db.subsidiary.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" } }),
    db.corporateTaxProvision.findMany({ where: { organizationId }, include: { subsidiary: true }, orderBy: [{ year: "desc" }] }),
    db.taxFiling.findMany({ where: { organizationId }, include: { subsidiary: true }, orderBy: [{ dueDate: "asc" }] }),
    db.deferredTaxItem.findMany({ where: { organizationId }, include: { subsidiary: true }, orderBy: [{ year: "desc" }] }),
  ]);

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
        />
      </div>
    </>
  );
}
