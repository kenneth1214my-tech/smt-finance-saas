import "server-only";
import { db } from "@/lib/db";
import { localizedSegment, localizedName } from "@/lib/localize";
import { effectiveRiskRating, type RiskSeverity } from "@/lib/risk-rating";
import type { Locale } from "@/lib/i18n/dictionaries";

export interface ARAgingBucket {
  label: string;
  min: number;
  max: number;
  value: number;
}

export interface ARAgingCustomerRow {
  id: string;
  name: string;
  entityName: string;
  balance: number;
  agingDays: number;
  status: RiskSeverity;
}

export interface ARAgingReport {
  companyName: string;
  year: number;
  generatedAt: Date;
  totalAR: number;
  overdueAR: number;
  overduePct: number;
  dso: number;
  buckets: ARAgingBucket[];
  customers: ARAgingCustomerRow[];
}

// AR balances/aging are a CURRENT snapshot (ARCustomer has no history), not a historical series
// like MonthlyFinancial — same caveat as the Balance Sheet report. `year` only picks the revenue
// base for DSO; every generation reflects whatever AR is on file right now.
export async function computeARAgingReport(organizationId: string, year: number, locale: Locale): Promise<ARAgingReport> {
  const [organization, customers, monthly] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    db.aRCustomer.findMany({ where: { organizationId }, include: { subsidiary: true }, orderBy: { balance: "desc" } }),
    db.monthlyFinancial.findMany({ where: { organizationId, year } }),
  ]);

  const isZh = locale === "zh" || locale === "zh-Hant";
  const totalAR = customers.reduce((a, c) => a + Number(c.balance), 0);
  const totalRevenue = monthly.reduce((a, r) => a + Number(r.revenue), 0);
  const monthCount = monthly.length ? Math.max(...monthly.map((m) => m.month)) : 0;

  const buckets: ARAgingBucket[] = [
    { label: isZh ? "0-30天" : "0-30 days", min: 0, max: 30, value: 0 },
    { label: isZh ? "31-60天" : "31-60 days", min: 31, max: 60, value: 0 },
    { label: isZh ? "61-90天" : "61-90 days", min: 61, max: 90, value: 0 },
    { label: isZh ? "91-180天" : "91-180 days", min: 91, max: 180, value: 0 },
    { label: isZh ? "180天以上" : "180+ days", min: 181, max: Infinity, value: 0 },
  ].map((b) => ({ ...b, value: customers.filter((c) => c.agingDays >= b.min && c.agingDays <= b.max).reduce((a, c) => a + Number(c.balance), 0) }));

  const overdueAR = buckets.slice(2).reduce((a, b) => a + b.value, 0);
  const daysElapsed = monthCount * 30.4;
  const dso = totalRevenue > 0 ? Math.round((totalAR / totalRevenue) * daysElapsed) : 0;

  const customerRows: ARAgingCustomerRow[] = customers.map((c) => ({
    id: c.id,
    name: locale === "en" ? c.nameEn : c.nameZh,
    entityName: c.subsidiary ? localizedSegment(c.subsidiary, locale) : locale === "en" ? "Group HQ" : "集团总部",
    balance: Number(c.balance),
    agingDays: c.agingDays,
    status: c.status,
  }));

  return {
    companyName: organization.name,
    year,
    generatedAt: new Date(),
    totalAR,
    overdueAR,
    overduePct: totalAR > 0 ? (overdueAR / totalAR) * 100 : 0,
    dso,
    buckets,
    customers: customerRows,
  };
}

export interface MonthlyRiskEntityRow {
  id: string;
  name: string;
  revenue: number;
  netProfit: number;
  netMargin: number;
  yoy: number | null;
  manualRating: RiskSeverity;
  effRisk: RiskSeverity;
}

export interface MonthlyRiskAlertRow {
  id: string;
  severity: RiskSeverity;
  category: string;
  tag: string;
  entityLabel: string;
  text: string;
  occurredAt: Date;
}

export interface MonthlyRiskReport {
  companyName: string;
  year: number;
  month: number;
  generatedAt: Date;
  alertsThisMonth: MonthlyRiskAlertRow[];
  alertCategoryCounts: { category: string; count: number }[];
  byEntity: MonthlyRiskEntityRow[];
}

// Risk alerts are filtered to the given month specifically (occurredAt within [year-month-01,
// next month)) — a genuine "monthly" report rather than a cumulative all-time list. Per-entity
// risk uses year-to-date revenue through `month` vs. the same months of the prior year, run
// through the same effectiveRiskRating() escalation used on 利润分析/子公司分析, so this report
// can't show a rating inconsistent with what the dashboards already display.
export async function computeMonthlyRiskReport(organizationId: string, year: number, month: number, locale: Locale): Promise<MonthlyRiskReport> {
  const [organization, subsidiaries, alerts, curYtd, prevYtd] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    db.subsidiary.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" } }),
    db.riskAlert.findMany({ where: { organizationId }, orderBy: { occurredAt: "desc" } }),
    db.monthlyFinancial.findMany({ where: { organizationId, year, month: { lte: month } } }),
    db.monthlyFinancial.findMany({ where: { organizationId, year: year - 1, month: { lte: month } } }),
  ]);

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));
  const alertsThisMonth = alerts.filter((a) => a.occurredAt >= monthStart && a.occurredAt < monthEnd);

  const catCounts = new Map<string, number>();
  for (const a of alertsThisMonth) catCounts.set(a.category, (catCounts.get(a.category) || 0) + 1);

  const HQ_PSEUDO_SUB = { id: "__hq__", name: locale === "en" ? "Group HQ" : "集团总部", riskRating: "GOOD" as RiskSeverity };

  function entityRow(id: string, name: string, manualRating: RiskSeverity, revenue: number, netProfit: number, prevRevenue: number): MonthlyRiskEntityRow {
    const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
    const yoy = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;
    const marginForRisk = revenue > 0 ? netMargin : netProfit < 0 ? -100 : 0;
    const effRisk = effectiveRiskRating(manualRating, yoy ?? 0, marginForRisk);
    return { id, name, revenue, netProfit, netMargin, yoy, manualRating, effRisk };
  }

  const byEntity: MonthlyRiskEntityRow[] = [];
  for (const s of subsidiaries) {
    const cur = curYtd.filter((m) => m.subsidiaryId === s.id);
    if (cur.length === 0) continue;
    const prev = prevYtd.filter((m) => m.subsidiaryId === s.id);
    byEntity.push(
      entityRow(
        s.id,
        localizedName(s, locale),
        s.riskRating,
        cur.reduce((a, r) => a + Number(r.revenue), 0),
        cur.reduce((a, r) => a + Number(r.netProfit), 0),
        prev.reduce((a, r) => a + Number(r.revenue), 0)
      )
    );
  }
  const hqCur = curYtd.filter((m) => !m.subsidiaryId);
  if (hqCur.length > 0) {
    const hqPrev = prevYtd.filter((m) => !m.subsidiaryId);
    byEntity.push(
      entityRow(
        HQ_PSEUDO_SUB.id,
        HQ_PSEUDO_SUB.name,
        HQ_PSEUDO_SUB.riskRating,
        hqCur.reduce((a, r) => a + Number(r.revenue), 0),
        hqCur.reduce((a, r) => a + Number(r.netProfit), 0),
        hqPrev.reduce((a, r) => a + Number(r.revenue), 0)
      )
    );
  }

  return {
    companyName: organization.name,
    year,
    month,
    generatedAt: new Date(),
    alertsThisMonth: alertsThisMonth.map((a) => ({
      id: a.id,
      severity: a.severity,
      category: a.category,
      tag: a.tag,
      entityLabel: a.entityLabel,
      text: locale === "en" ? a.textEn : locale === "zh-Hant" ? a.textZhTw : locale === "ms" ? a.textMs : locale === "id" ? a.textId : a.textZh,
      occurredAt: a.occurredAt,
    })),
    alertCategoryCounts: Array.from(catCounts.entries()).map(([category, count]) => ({ category, count })),
    byEntity,
  };
}
