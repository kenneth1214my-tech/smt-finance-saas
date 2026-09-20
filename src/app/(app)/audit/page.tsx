import { ShieldAlert, AlertOctagon, Clock } from "lucide-react";
import { requireUser, canApprove } from "@/lib/dal";
import { db } from "@/lib/db";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary, withBaseCurrency, fmtMoney } from "@/lib/i18n/dictionaries";
import { getBaseCurrency } from "@/lib/currency";
import { matchesAuditScope, type AuditScope } from "@/lib/audit";
import Topbar from "@/components/Topbar";
import Card from "@/components/ui/Card";
import KpiTile from "@/components/ui/KpiTile";
import AuditScanButton from "./AuditScanButton";
import FindingRow from "./FindingRow";
import ScopeFilter from "./ScopeFilter";

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
const VALID_SCOPES: AuditScope[] = ["all", "hq", "subsidiary"];

export default async function AuditPage(props: PageProps<"/audit">) {
  const user = await requireUser();
  const locale = await getServerLocale();
  const isZh = locale === "zh" || locale === "zh-Hant";
  const organizationId = user.organizationId;
  const baseCurrency = await getBaseCurrency(organizationId);
  const dict = withBaseCurrency(getDictionary(locale), locale, baseCurrency);
  const fmtM = (n: number) => fmtMoney(n, locale);

  const searchParams = await props.searchParams;
  const scopeParam = typeof searchParams.scope === "string" ? searchParams.scope : "all";
  const scope: AuditScope = VALID_SCOPES.includes(scopeParam as AuditScope) ? (scopeParam as AuditScope) : "all";

  const allFindings = await db.auditFinding.findMany({ where: { organizationId }, orderBy: [{ status: "asc" }, { severity: "desc" }, { dateIdentified: "desc" }] });
  const findings = allFindings.filter((f) => matchesAuditScope(f.entityLabel, scope));

  const open = findings.filter((f) => f.status !== "CLOSED");
  const highCritical = open.filter((f) => f.severity === "HIGH" || f.severity === "CRITICAL");
  const overdue = open.filter((f) => f.targetDate && f.targetDate < new Date());

  const areaCounts = new Map<string, number>();
  for (const f of open) areaCounts.set(f.area, (areaCounts.get(f.area) || 0) + 1);

  const statusLabel = (s: string) => (s === "OPEN" ? dict.m.auditStatusOpen : s === "IN_PROGRESS" ? dict.m.auditStatusInProgress : dict.m.auditStatusClosed);
  const severityLabel = (s: string) => (s === "LOW" ? dict.m.auditSeverityLow : s === "MEDIUM" ? dict.m.auditSeverityMedium : s === "HIGH" ? dict.m.auditSeverityHigh : dict.m.auditSeverityCritical);

  return (
    <>
      <Topbar dict={dict} locale={locale} title={dict.nav.audit} desc={dict.m.auditPageDesc} user={user} />
      <div className="mx-auto w-full max-w-[1480px] flex-1 space-y-4 px-[26px] py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ScopeFilter scope={scope} locale={locale} />
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <KpiTile icon={ShieldAlert} color="var(--cat-1)" label={dict.m.auditOpenCount} value={String(open.length)} />
          <KpiTile icon={AlertOctagon} color="var(--status-critical)" label={dict.m.auditHighCriticalCount} value={String(highCritical.length)} />
          <KpiTile icon={Clock} color="var(--status-warning)" label={dict.m.auditOverdueCount} value={String(overdue.length)} />
        </div>

        {canApprove(user.role) && <AuditScanButton locale={locale} label={dict.m.auditRunScan} scanningLabel={dict.m.auditScanning} noNewLabel={dict.m.auditNoNewFindings} />}

        {areaCounts.size > 0 && (
          <Card title={dict.m.auditByAreaCard}>
            <div className="flex flex-wrap gap-3">
              {Array.from(areaCounts.entries()).map(([area, count]) => (
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

        <Card title={dict.m.auditFindingsCard}>
          {findings.length === 0 ? (
            <p className="py-3 text-[12.5px]" style={{ color: "var(--ink-400)" }}>
              {dict.m.auditNoFindings}
            </p>
          ) : (
            <div className="flex flex-col">
              {findings.map((f) => (
                <FindingRow
                  key={f.id}
                  finding={{
                    id: f.id,
                    findingRef: f.findingRef,
                    area: f.area,
                    severity: f.severity,
                    status: f.status,
                    entityLabel: f.entityLabel,
                    transactionRef: f.transactionRef,
                    criteria: f.criteria,
                    condition: f.condition,
                    evidence: f.evidence,
                    riskImpact: f.riskImpact,
                    recommendation: f.recommendation,
                    rootCause: f.rootCause,
                    managementResponse: f.managementResponse,
                    auditorAssessment: f.auditorAssessment,
                    responsibleOwner: f.responsibleOwner,
                    closureEvidence: f.closureEvidence,
                    detectionType: f.detectionType,
                    amountFormatted: f.amount === null ? null : fmtM(Number(f.amount)),
                    dateIdentified: f.dateIdentified.toISOString(),
                    targetDate: f.targetDate ? f.targetDate.toISOString() : null,
                    closedAt: f.closedAt ? f.closedAt.toISOString() : null,
                  }}
                  dict={dict}
                  isZh={isZh}
                  canEdit={canApprove(user.role)}
                  areaLabel={dict.m[AREA_KEY[f.area]] || f.area}
                  severityTone={SEVERITY_TONE[f.severity]}
                  statusTone={STATUS_TONE[f.status]}
                  severityLabel={severityLabel(f.severity)}
                  statusLabel={statusLabel(f.status)}
                />
              ))}
            </div>
          )}
        </Card>

        <div className="rounded-2xl border p-4 text-[12px] leading-relaxed" style={{ borderColor: "var(--border)", color: "var(--ink-400)" }}>
          {isZh
            ? "本模块基于系统内真实数据（应收/应付账龄、预算、资产负债率、风险评级）自动检测异常，不涉及凭证、采购订单、工资单等本系统未记录的数据。每条发现均标注其证据来源，管理层说明与审计员评估需人工填写；结案前必须填写结案证据。"
            : "This module detects exceptions from real data already in the system (AR/AP aging, budgets, debt ratio, risk ratings) — it does not cover journal entries, purchase orders, payroll, or other data this system doesn't record. Every finding cites its evidence source; management response and auditor assessment are entered by a human reviewer, and closure evidence is required before a finding can be closed."}
        </div>
      </div>
    </>
  );
}
