import { ShieldAlert, AlertOctagon, CheckCircle2, Clock } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary, withBaseCurrency, fmtMoney } from "@/lib/i18n/dictionaries";
import { getBaseCurrency } from "@/lib/currency";
import { computeAuditReport, matchesAuditScope, type AuditScope } from "@/lib/audit";
import { JURISDICTIONS, defaultJurisdictionForCurrency, getJurisdictionText, type AuditJurisdiction } from "@/lib/audit-jurisdiction";
import Topbar from "@/components/Topbar";
import Card from "@/components/ui/Card";
import KpiTile from "@/components/ui/KpiTile";
import StatusPill from "@/components/ui/StatusPill";
import AuditReportActions from "./AuditReportActions";
import JurisdictionSelect from "./JurisdictionSelect";
import ScopeFilter from "../../audit/ScopeFilter";

const SEVERITY_TONE: Record<string, "good" | "warning" | "serious" | "critical"> = { LOW: "good", MEDIUM: "warning", HIGH: "serious", CRITICAL: "critical" };
const STATUS_TONE: Record<string, "good" | "warning" | "serious" | "critical"> = { OPEN: "critical", IN_PROGRESS: "warning", CLOSED: "good" };
const AREA_KEY: Record<string, "auditAreaAR" | "auditAreaAP" | "auditAreaBudget" | "auditAreaDebt" | "auditAreaRisk" | "auditAreaSod"> = {
  ar: "auditAreaAR",
  ap: "auditAreaAP",
  budget: "auditAreaBudget",
  debt: "auditAreaDebt",
  risk: "auditAreaRisk",
  sod: "auditAreaSod",
};

export default async function AuditReportPage(props: PageProps<"/report/audit-report">) {
  const user = await requireUser();
  const locale = await getServerLocale();
  const isZh = locale === "zh" || locale === "zh-Hant";
  const searchParams = await props.searchParams;
  const year = Number(typeof searchParams.year === "string" ? searchParams.year : new Date().getFullYear());

  const baseCurrency = await getBaseCurrency(user.organizationId);
  const dict = withBaseCurrency(getDictionary(locale), locale, baseCurrency);
  const fmtM = (n: number) => fmtMoney(n, locale);

  const jurisdictionParam = typeof searchParams.jurisdiction === "string" ? searchParams.jurisdiction : null;
  const validJurisdiction = JURISDICTIONS.some((j) => j.code === jurisdictionParam);
  const jurisdiction: AuditJurisdiction = validJurisdiction ? (jurisdictionParam as AuditJurisdiction) : defaultJurisdictionForCurrency(baseCurrency);
  const jt = getJurisdictionText(jurisdiction);

  const scopeParam = typeof searchParams.scope === "string" ? searchParams.scope : "all";
  const scope: AuditScope = (["all", "hq", "subsidiary"] as const).includes(scopeParam as AuditScope) ? (scopeParam as AuditScope) : "all";

  const fullReport = await computeAuditReport(user.organizationId, year);
  const scopedFindings = fullReport.findings.filter((f) => matchesAuditScope(f.entityLabel, scope));
  const byAreaMap = new Map<string, number>();
  for (const f of scopedFindings) byAreaMap.set(f.area, (byAreaMap.get(f.area) || 0) + 1);
  // A scoped view of the same real report — Print/Export use this too, so a "Group HQ only" or
  // "Subsidiaries only" export never includes findings outside that scope.
  const report = {
    ...fullReport,
    findings: scopedFindings,
    totalFindings: scopedFindings.length,
    openCount: scopedFindings.filter((f) => f.status === "OPEN").length,
    inProgressCount: scopedFindings.filter((f) => f.status === "IN_PROGRESS").length,
    closedCount: scopedFindings.filter((f) => f.status === "CLOSED").length,
    highCriticalCount: scopedFindings.filter((f) => f.severity === "HIGH" || f.severity === "CRITICAL").length,
    byArea: Array.from(byAreaMap.entries()).map(([area, count]) => ({ area, count })),
  };

  const title = isZh ? jt.titleZh : jt.titleEn;
  const statusLabel = (s: string) => (s === "OPEN" ? dict.m.auditStatusOpen : s === "IN_PROGRESS" ? dict.m.auditStatusInProgress : dict.m.auditStatusClosed);
  const severityLabel = (s: string) => (s === "LOW" ? dict.m.auditSeverityLow : s === "MEDIUM" ? dict.m.auditSeverityMedium : s === "HIGH" ? dict.m.auditSeverityHigh : dict.m.auditSeverityCritical);

  return (
    <>
      <Topbar dict={dict} locale={locale} title={title} desc={`${report.companyName} · ${year}`} user={user} />
      <div className="mx-auto w-full max-w-[1480px] flex-1 space-y-4 px-[26px] py-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}>
          <div>
            <div className="text-[15px] font-bold" style={{ color: "var(--ink-900)" }}>
              {report.companyName}
            </div>
            <div className="text-[12px]" style={{ color: "var(--ink-400)" }}>
              {isZh ? `会计年度 ${year}` : `Fiscal Year ${year}`} · {isZh ? "生成于" : "Generated"} {report.generatedAt.toISOString().slice(0, 16).replace("T", " ")}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ScopeFilter scope={scope} locale={locale} />
            <JurisdictionSelect year={year} jurisdiction={jurisdiction} locale={locale} />
            <AuditReportActions report={report} locale={locale} jt={jt} />
          </div>
        </div>

        <Card title={isZh ? "执行摘要" : "Executive Summary"}>
          <p className="mb-2 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-600)" }}>
            {isZh
              ? `审计目标：基于系统内真实数据，独立检测应收/应付账龄、预算差异、资产负债率、风险评级背离及职责分离等方面的财务异常。审计范围：${year}年度内识别的全部审计发现，${scope === "hq" ? "仅限集团总部" : scope === "subsidiary" ? "仅限子公司层面" : "涵盖集团总部及全部子公司"}。本报告不构成对舞弊或不当行为的最终结论，所有发现均需人工审计员进一步核实。`
              : `Objective: independently detect financial exceptions across AR/AP aging, budget variance, debt ratio, risk-rating divergence, and segregation of duties, based on real data already in the system. Scope: all findings identified during ${year}, ${scope === "hq" ? "limited to Group HQ" : scope === "subsidiary" ? "limited to the subsidiary level" : "covering Group HQ and all subsidiaries"}. This report does not constitute a final conclusion of fraud or misconduct — every finding requires further verification by a human auditor.`}
          </p>
          <p className="mb-2 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-600)" }}>
            {isZh ? jt.frameworkZh : jt.frameworkEn}
          </p>
          <p className="mb-3.5 rounded-lg border p-2.5 text-[11.5px] leading-relaxed" style={{ borderColor: "var(--status-warning)", background: "color-mix(in srgb, var(--status-warning) 8%, transparent)", color: "var(--ink-600)" }}>
            {isZh ? jt.disclaimerZh : jt.disclaimerEn}
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiTile icon={ShieldAlert} color="var(--cat-1)" label={isZh ? "发现总数" : "Total Findings"} value={String(report.totalFindings)} />
            <KpiTile icon={AlertOctagon} color="var(--status-critical)" label={dict.m.auditHighCriticalCount} value={String(report.highCriticalCount)} />
            <KpiTile icon={Clock} color="var(--status-warning)" label={`${dict.m.auditStatusOpen}/${dict.m.auditStatusInProgress}`} value={String(report.openCount + report.inProgressCount)} />
            <KpiTile icon={CheckCircle2} color="var(--status-good)" label={dict.m.auditStatusClosed} value={String(report.closedCount)} />
          </div>
        </Card>

        {report.byArea.length > 0 && (
          <Card title={dict.m.auditByAreaCard}>
            <div className="flex flex-wrap gap-3">
              {report.byArea.map(({ area, count }) => (
                <div key={area} className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12.5px]" style={{ borderColor: "var(--border)" }}>
                  <span className="font-semibold" style={{ color: "var(--ink-900)" }}>
                    {dict.m[AREA_KEY[area]] || area}
                  </span>
                  <span style={{ color: "var(--ink-400)" }}>{count}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card title={isZh ? "详细发现" : "Detailed Findings"}>
          {report.findings.length === 0 ? (
            <p className="py-3 text-[12.5px]" style={{ color: "var(--ink-400)" }}>
              {isZh ? `${year}年度暂无审计发现` : `No audit findings identified in ${year}`}
            </p>
          ) : (
            <div className="flex flex-col">
              {report.findings.map((f) => (
                <div key={f.findingRef} className="border-t py-3 first:border-t-0" style={{ borderColor: "var(--border)" }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11.5px] font-bold" style={{ color: "var(--cat-1)" }}>
                      {f.findingRef}
                    </span>
                    <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: "var(--surface-2)", color: "var(--ink-600)" }}>
                      {dict.m[AREA_KEY[f.area]] || f.area}
                    </span>
                    <StatusPill tone={SEVERITY_TONE[f.severity]} label={severityLabel(f.severity)} />
                    <StatusPill tone={STATUS_TONE[f.status]} label={statusLabel(f.status)} />
                  </div>
                  <div className="mt-1.5 text-[12.6px]" style={{ color: "var(--ink-900)" }}>
                    <span className="font-bold">{dict.m.auditDetailCondition}: </span>
                    {f.condition}
                  </div>
                  <div className="mt-1 text-[12.3px]" style={{ color: "var(--ink-600)" }}>
                    <span className="font-bold">{dict.m.auditDetailCriteria}: </span>
                    {f.criteria}
                  </div>
                  <div className="mt-1 font-mono text-[11.3px]" style={{ color: "var(--ink-400)" }}>
                    <span className="font-bold" style={{ color: "var(--ink-600)" }}>
                      {dict.m.auditDetailEvidence}:{" "}
                    </span>
                    {f.evidence}
                  </div>
                  <div className="mt-1 text-[12.3px]" style={{ color: "var(--ink-600)" }}>
                    <span className="font-bold">{dict.m.auditDetailRisk}: </span>
                    {f.riskImpact}
                  </div>
                  <div className="mt-1 text-[12.3px]" style={{ color: "var(--ink-600)" }}>
                    <span className="font-bold">{dict.m.auditDetailRecommendation}: </span>
                    {f.recommendation}
                  </div>
                  {f.managementResponse && (
                    <div className="mt-1 text-[12.3px]" style={{ color: "var(--ink-600)" }}>
                      <span className="font-bold">{dict.m.auditManagementResponse}: </span>
                      {f.managementResponse}
                    </div>
                  )}
                  {f.closureEvidence && (
                    <div className="mt-1 text-[12.3px]" style={{ color: "var(--status-good)" }}>
                      <span className="font-bold">{isZh ? "结案证据" : "Closure Evidence"}: </span>
                      {f.closureEvidence}
                    </div>
                  )}
                  <div className="mt-1.5 text-[11px]" style={{ color: "var(--ink-400)" }}>
                    {f.entityLabel ?? "—"} · {f.transactionRef ?? "—"} · {f.dateIdentified.toISOString().slice(0, 10)}
                    {f.amount !== null && ` · ${fmtM(f.amount)}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
