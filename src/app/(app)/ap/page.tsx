import { Receipt, Clock, AlertTriangle, Pencil } from "lucide-react";
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

export default async function APPage(props: PageProps<"/ap">) {
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
  const [allVendors, monthly] = await Promise.all([
    db.payable.findMany({ where: { organizationId }, include: { subsidiary: true }, orderBy: { balance: "desc" } }),
    db.monthlyFinancial.findMany({ where: { year: 2026, organizationId } }),
  ]);
  // KPIs/aging buckets recompute from the SELECTED scope, not the full list — so "Group HQ"
  // never shows the subsidiary's Xero-synced vendors mixed into its own AP totals, and vice versa.
  const vendors = scope === "hq" ? allVendors.filter((v) => !v.subsidiaryId) : scope === "subsidiary" ? allVendors.filter((v) => v.subsidiaryId) : allVendors;

  const totalAP = vendors.reduce((a, v) => a + Number(v.balance), 0);
  const totalCost = monthly.reduce((a, m) => a + Number(m.opCost), 0);
  const monthCount = monthly.length ? Math.max(...monthly.map((m) => m.month)) : 0;

  const buckets = [
    { label: isZh ? "0-30天" : "0-30 days", min: 0, max: 30, color: "var(--cat-3)" },
    { label: isZh ? "31-60天" : "31-60 days", min: 31, max: 60, color: "var(--cat-1)" },
    { label: isZh ? "61-90天" : "61-90 days", min: 61, max: 90, color: "var(--cat-2)" },
    { label: isZh ? "91-180天" : "91-180 days", min: 91, max: 180, color: "var(--status-serious)" },
    { label: isZh ? "180天以上" : "180+ days", min: 181, max: Infinity, color: "var(--status-critical)" },
  ].map((b) => ({
    ...b,
    value: vendors.filter((v) => v.agingDays >= b.min && v.agingDays <= b.max).reduce((a, v) => a + Number(v.balance), 0),
  }));

  const overdue = buckets.slice(2).reduce((a, b) => a + b.value, 0);
  // DPO = AP balance ÷ (cost of sales ÷ days elapsed YTD) — mirrors the DSO formula on 应收管理,
  // using cost instead of revenue since payables track what's owed to vendors for costs incurred.
  const daysElapsed = monthCount * 30.4;
  const dpo = totalCost > 0 ? Math.round((totalAP / totalCost) * daysElapsed) : 0;

  const statusLabel = (s: string) =>
    s === "GOOD" ? (isZh ? "正常" : "Normal") : s === "WARNING" ? (isZh ? "关注" : "Watch") : s === "SERIOUS" ? (isZh ? "预警" : "Alert") : isZh ? "严重逾期" : "Severely overdue";

  return (
    <>
      <Topbar dict={dict} locale={locale} title={dict.nav.ap} desc={dict.nav.ap} user={user} />
      <div className="mx-auto w-full max-w-[1480px] flex-1 space-y-4 px-[26px] py-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <KpiTile icon={Receipt} color="var(--cat-1)" label={dict.m.apBalance} value={fmtM(totalAP)} unit={dict.common.yi} />
          <KpiTile icon={Clock} color="var(--cat-2)" label={dict.m.dpo} value={String(dpo)} unit={dict.m.dayUnit} />
          <KpiTile icon={AlertTriangle} color="var(--status-critical)" label={dict.m.overdueAmt} value={fmtM(overdue)} unit={dict.common.yi} note={`${fmt1(totalAP > 0 ? (overdue / totalAP) * 100 : 0)}%`} />
        </div>

        <Card title={dict.m.apAgingCard} unit={`${dict.common.yi} · ${dict.m.total} ${fmtM(totalAP)} ${dict.common.yi}`}>
          <StackedBar segments={buckets} valueFmt={fmtM} />
        </Card>

        <Card title={dict.m.apTableCard}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <EntityScopeFilter scope={scope} locale={locale} />
            <Link
              href="/settings?tab=business&sub=ap"
              className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[12px] font-bold"
              style={{ borderColor: "var(--border-strong)", color: "var(--ink-600)" }}
            >
              <Pencil size={13} />
              {isZh ? "管理供应商" : "Manage vendors"}
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.6px]">
              <thead>
                <tr className="text-left text-[11.3px] font-semibold" style={{ color: "var(--ink-400)" }}>
                  <th className="pb-2">{dict.m.thVendorName}</th>
                  <th className="pb-2">{dict.m.thSubsidiary}</th>
                  <th className="pb-2 text-right">{dict.m.apBalance} ({dict.common.yi})</th>
                  <th className="pb-2 text-right">{dict.m.thAgingDays}</th>
                  <th className="pb-2">{dict.m.thStatus}</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <tr key={v.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 font-semibold" style={{ color: "var(--ink-900)" }}>
                      {locale === "en" ? v.nameEn : v.nameZh}
                    </td>
                    <td className="py-2.5" style={{ color: "var(--ink-400)" }}>
                      {v.subsidiary ? localizedSegment(v.subsidiary, locale) : isZh ? "集团总部" : "Group HQ"}
                    </td>
                    <td className="tabular-nums py-2.5 text-right">{fmtM(Number(v.balance))}</td>
                    <td className="tabular-nums py-2.5 text-right">{v.agingDays}</td>
                    <td className="py-2.5">
                      <StatusPill tone={RISK_TONE[v.status]} label={statusLabel(v.status)} />
                    </td>
                    <td className="py-2.5 text-right">
                      <Link
                        href={`/settings?tab=business&sub=ap&q=${encodeURIComponent(v.nameZh)}`}
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
