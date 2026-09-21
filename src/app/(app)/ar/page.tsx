import { FileSpreadsheet, Clock, AlertTriangle, ShieldAlert, Banknote, Pencil } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary, withBaseCurrency, fmtMoney } from "@/lib/i18n/dictionaries";
import { localizedSegment } from "@/lib/localize";
import { getBaseCurrency } from "@/lib/currency";
import Topbar from "@/components/Topbar";
import Card from "@/components/ui/Card";
import KpiTile from "@/components/ui/KpiTile";
import StackedBar from "@/components/ui/StackedBar";
import StatusPill from "@/components/ui/StatusPill";
import EntityScopeFilter, { type EntityScope } from "@/components/ui/EntityScopeFilter";

const fmt1 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const RISK_TONE: Record<string, "good" | "warning" | "serious" | "critical"> = { GOOD: "good", WARNING: "warning", SERIOUS: "serious", CRITICAL: "critical" };

export default async function ARPage(props: PageProps<"/ar">) {
  const user = await requireUser();
  const locale = await getServerLocale();
  const isZh = locale === "zh" || locale === "zh-Hant";
  const searchParams = await props.searchParams;
  const scopeParam = typeof searchParams.scope === "string" ? searchParams.scope : "all";
  const scope: EntityScope = scopeParam === "hq" || scopeParam === "subsidiary" ? scopeParam : "all";

  const organizationId = user.organizationId;
  const baseCurrency = await getBaseCurrency(organizationId);
  const dict = withBaseCurrency(getDictionary(locale), locale, baseCurrency);
  const fmtM = (n: number) => fmtMoney(n, locale);
  const [allCustomers, monthly] = await Promise.all([
    db.aRCustomer.findMany({ where: { organizationId }, include: { subsidiary: true }, orderBy: { balance: "desc" } }),
    db.monthlyFinancial.findMany({ where: { year: 2026, organizationId } }),
  ]);
  // KPIs/aging buckets recompute from the SELECTED scope, not the full list — so "Group HQ"
  // never shows the subsidiary's Xero-synced customers mixed into its own AR totals, and vice versa.
  const customers = scope === "hq" ? allCustomers.filter((c) => !c.subsidiaryId) : scope === "subsidiary" ? allCustomers.filter((c) => c.subsidiaryId) : allCustomers;

  const totalAR = customers.reduce((a, c) => a + Number(c.balance), 0);
  const totalRevenue = monthly.reduce((a, m) => a + Number(m.revenue), 0);
  const monthCount = monthly.length ? Math.max(...monthly.map((m) => m.month)) : 0;

  const buckets = [
    { label: isZh ? "0-30天" : "0-30 days", min: 0, max: 30, color: "var(--cat-3)" },
    { label: isZh ? "31-60天" : "31-60 days", min: 31, max: 60, color: "var(--cat-1)" },
    { label: isZh ? "61-90天" : "61-90 days", min: 61, max: 90, color: "var(--cat-2)" },
    { label: isZh ? "91-180天" : "91-180 days", min: 91, max: 180, color: "var(--status-serious)" },
    { label: isZh ? "180天以上" : "180+ days", min: 181, max: Infinity, color: "var(--status-critical)" },
  ].map((b) => ({
    ...b,
    value: customers.filter((c) => c.agingDays >= b.min && c.agingDays <= b.max).reduce((a, c) => a + Number(c.balance), 0),
  }));

  const overdue = buckets.slice(2).reduce((a, b) => a + b.value, 0);
  // DSO = AR balance ÷ (revenue ÷ days elapsed YTD) — standard formula, computed from real data.
  const daysElapsed = monthCount * 30.4;
  const dso = totalRevenue > 0 ? Math.round((totalAR / totalRevenue) * daysElapsed) : 0;
  // No bad-debt provisioning or a collections ledger exists in the schema yet — shown as 0 rather than invented numbers.
  const badDebt = 0;
  const collections = 0;

  const statusLabel = (s: string) =>
    s === "GOOD" ? (isZh ? "正常" : "Normal") : s === "WARNING" ? (isZh ? "关注" : "Watch") : s === "SERIOUS" ? (isZh ? "预警" : "Alert") : isZh ? "严重逾期" : "Severely overdue";

  return (
    <>
      <Topbar dict={dict} locale={locale} title={dict.nav.ar} desc={dict.nav.ar} user={user} />
      <div className="mx-auto w-full max-w-[1480px] flex-1 space-y-4 px-[26px] py-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <KpiTile icon={FileSpreadsheet} color="var(--cat-1)" label={dict.m.arBalance} value={fmtM(totalAR)} unit={dict.common.yi} />
          <KpiTile icon={Clock} color="var(--cat-2)" label={dict.m.dso} value={String(dso)} unit={dict.m.dayUnit} />
          <KpiTile icon={AlertTriangle} color="var(--status-critical)" label={dict.m.overdueAmt} value={fmtM(overdue)} unit={dict.common.yi} note={`${fmt1(totalAR > 0 ? (overdue / totalAR) * 100 : 0)}%`} />
          <KpiTile icon={ShieldAlert} color="var(--cat-4)" label={dict.m.badDebt} value={fmtM(badDebt)} unit={dict.common.yi} />
          <KpiTile icon={Banknote} color="var(--status-good)" label={dict.m.collections} value={fmtM(collections)} unit={dict.common.yi} />
        </div>

        <Card title={dict.m.arAgingCard} unit={`${dict.common.yi} · ${dict.m.total} ${fmtM(totalAR)} ${dict.common.yi}`}>
          <StackedBar segments={buckets} valueFmt={fmtM} />
        </Card>

        <Card title={dict.m.custTableCard}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <EntityScopeFilter scope={scope} locale={locale} />
            <Link
              href="/settings?tab=business&sub=ar"
              className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[12px] font-bold"
              style={{ borderColor: "var(--border-strong)", color: "var(--ink-600)" }}
            >
              <Pencil size={13} />
              {isZh ? "管理客户" : "Manage customers"}
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.6px]">
              <thead>
                <tr className="text-left text-[11.3px] font-semibold" style={{ color: "var(--ink-400)" }}>
                  <th className="pb-2">{dict.m.thCustName}</th>
                  <th className="pb-2">{dict.m.thSubsidiary}</th>
                  <th className="pb-2 text-right">{dict.m.arBalance} ({dict.common.yi})</th>
                  <th className="pb-2 text-right">{dict.m.thAgingDays}</th>
                  <th className="pb-2">{dict.m.thStatus}</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 font-semibold" style={{ color: "var(--ink-900)" }}>
                      {locale === "en" ? c.nameEn : c.nameZh}
                    </td>
                    <td className="py-2.5" style={{ color: "var(--ink-400)" }}>
                      {c.subsidiary ? localizedSegment(c.subsidiary, locale) : isZh ? "集团总部" : "Group HQ"}
                    </td>
                    <td className="tabular-nums py-2.5 text-right">{fmtM(Number(c.balance))}</td>
                    <td className="tabular-nums py-2.5 text-right">{c.agingDays}</td>
                    <td className="py-2.5">
                      <StatusPill tone={RISK_TONE[c.status]} label={statusLabel(c.status)} />
                    </td>
                    <td className="py-2.5 text-right">
                      <Link
                        href={`/settings?tab=business&sub=ar&q=${encodeURIComponent(c.nameZh)}`}
                        className="inline-flex items-center gap-1 text-[11.5px] font-semibold"
                        style={{ color: "var(--cat-1)" }}
                      >
                        <Pencil size={12} />
                        {isZh ? "编辑" : "Edit"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
