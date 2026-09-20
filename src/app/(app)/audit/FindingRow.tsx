"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import StatusPill from "@/components/ui/StatusPill";
import type { Locale, DICTIONARIES } from "@/lib/i18n/dictionaries";

type Dict = (typeof DICTIONARIES)[Locale];

interface Finding {
  id: string;
  findingRef: string;
  area: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "IN_PROGRESS" | "CLOSED";
  dateIdentified: string;
  entityLabel: string | null;
  transactionRef: string | null;
  amountFormatted: string | null;
  criteria: string;
  condition: string;
  evidence: string;
  riskImpact: string;
  recommendation: string;
  rootCause: string | null;
  managementResponse: string | null;
  auditorAssessment: string | null;
  responsibleOwner: string | null;
  targetDate: string | null;
  closureEvidence: string | null;
  closedAt: string | null;
  detectionType: string;
}

export default function FindingRow({
  finding,
  dict,
  isZh,
  canEdit,
  areaLabel,
  severityTone,
  statusTone,
  severityLabel,
  statusLabel,
}: {
  finding: Finding;
  dict: Dict;
  isZh: boolean;
  canEdit: boolean;
  areaLabel: string;
  severityTone: "good" | "warning" | "serious" | "critical";
  statusTone: "good" | "warning" | "serious" | "critical";
  severityLabel: string;
  statusLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(finding.status);
  const [rootCause, setRootCause] = useState(finding.rootCause ?? "");
  const [managementResponse, setManagementResponse] = useState(finding.managementResponse ?? "");
  const [auditorAssessment, setAuditorAssessment] = useState(finding.auditorAssessment ?? "");
  const [responsibleOwner, setResponsibleOwner] = useState(finding.responsibleOwner ?? "");
  const [targetDate, setTargetDate] = useState(finding.targetDate ? finding.targetDate.slice(0, 10) : "");
  const [closureEvidence, setClosureEvidence] = useState(finding.closureEvidence ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/audit/${finding.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        rootCause: rootCause || null,
        managementResponse: managementResponse || null,
        auditorAssessment: auditorAssessment || null,
        responsibleOwner: responsibleOwner || null,
        targetDate: targetDate || null,
        closureEvidence: closureEvidence || null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      router.refresh();
    } else {
      const body = await res.json().catch(() => null);
      setError(body?.error === "closure_evidence_required" ? dict.m.auditClosureRequired : isZh ? "保存失败" : "Save failed");
    }
  }

  const fieldStyle = { borderColor: "var(--border)" };

  return (
    <div className="border-t py-3 first:border-t-0" style={{ borderColor: "var(--border)" }}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start justify-between gap-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11.5px] font-bold" style={{ color: "var(--cat-1)" }}>
              {finding.findingRef}
            </span>
            <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: "var(--surface-2)", color: "var(--ink-600)" }}>
              {areaLabel}
            </span>
            <StatusPill tone={severityTone} label={severityLabel} />
            <StatusPill tone={statusTone} label={statusLabel} />
          </div>
          <div className="mt-1 text-[12.8px] font-medium" style={{ color: "var(--ink-900)" }}>
            {finding.condition}
          </div>
          <div className="mt-1 text-[11px]" style={{ color: "var(--ink-400)" }}>
            {finding.entityLabel ?? "—"} · {finding.transactionRef ?? "—"} · {finding.dateIdentified.slice(0, 10)}
            {finding.amountFormatted !== null && ` · ${finding.amountFormatted}`}
          </div>
        </div>
        {open ? <ChevronUp size={16} className="mt-1 shrink-0" /> : <ChevronDown size={16} className="mt-1 shrink-0" />}
      </button>

      {open && (
        <div className="mt-3 space-y-3 rounded-xl border p-3.5 text-[12.3px]" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
          <div>
            <div className="font-bold" style={{ color: "var(--ink-600)" }}>
              {dict.m.auditDetailCriteria}
            </div>
            <div style={{ color: "var(--ink-900)" }}>{finding.criteria}</div>
          </div>
          <div>
            <div className="font-bold" style={{ color: "var(--ink-600)" }}>
              {dict.m.auditDetailEvidence}
            </div>
            <div className="font-mono text-[11.5px]" style={{ color: "var(--ink-400)" }}>
              {finding.evidence}
            </div>
          </div>
          <div>
            <div className="font-bold" style={{ color: "var(--ink-600)" }}>
              {dict.m.auditDetailRisk}
            </div>
            <div style={{ color: "var(--ink-900)" }}>{finding.riskImpact}</div>
          </div>
          <div>
            <div className="font-bold" style={{ color: "var(--ink-600)" }}>
              {dict.m.auditDetailRecommendation}
            </div>
            <div style={{ color: "var(--ink-900)" }}>{finding.recommendation}</div>
          </div>

          {canEdit ? (
            <div className="grid gap-2.5 border-t pt-3 sm:grid-cols-2" style={{ borderColor: "var(--border)" }}>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold" style={{ color: "var(--ink-600)" }}>
                  {dict.m.thStatus}
                </span>
                <select value={status} onChange={(e) => setStatus(e.target.value as Finding["status"])} className="rounded-lg border px-2.5 py-1.5" style={fieldStyle}>
                  <option value="OPEN">{dict.m.auditStatusOpen}</option>
                  <option value="IN_PROGRESS">{dict.m.auditStatusInProgress}</option>
                  <option value="CLOSED">{dict.m.auditStatusClosed}</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold" style={{ color: "var(--ink-600)" }}>
                  {dict.m.auditResponsibleOwner}
                </span>
                <input value={responsibleOwner} onChange={(e) => setResponsibleOwner(e.target.value)} className="rounded-lg border px-2.5 py-1.5" style={fieldStyle} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold" style={{ color: "var(--ink-600)" }}>
                  {dict.m.auditTargetDate}
                </span>
                <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="rounded-lg border px-2.5 py-1.5" style={fieldStyle} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold" style={{ color: "var(--ink-600)" }}>
                  {isZh ? "根本原因" : "Root Cause"}
                </span>
                <input value={rootCause} onChange={(e) => setRootCause(e.target.value)} className="rounded-lg border px-2.5 py-1.5" style={fieldStyle} />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-[11px] font-semibold" style={{ color: "var(--ink-600)" }}>
                  {dict.m.auditManagementResponse}
                </span>
                <textarea value={managementResponse} onChange={(e) => setManagementResponse(e.target.value)} rows={2} className="rounded-lg border px-2.5 py-1.5" style={fieldStyle} />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-[11px] font-semibold" style={{ color: "var(--ink-600)" }}>
                  {dict.m.auditAuditorAssessment}
                </span>
                <textarea value={auditorAssessment} onChange={(e) => setAuditorAssessment(e.target.value)} rows={2} className="rounded-lg border px-2.5 py-1.5" style={fieldStyle} />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-[11px] font-semibold" style={{ color: "var(--ink-600)" }}>
                  {dict.m.auditClosureEvidence}
                  {status === "CLOSED" && <span style={{ color: "var(--status-critical)" }}> *</span>}
                </span>
                <textarea value={closureEvidence} onChange={(e) => setClosureEvidence(e.target.value)} rows={2} className="rounded-lg border px-2.5 py-1.5" style={fieldStyle} />
              </label>
              <div className="flex items-center gap-2 sm:col-span-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-lg px-3.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50"
                  style={{ background: "var(--cat-1)" }}
                >
                  {dict.m.auditSaveDetail}
                </button>
                {error && (
                  <span className="text-[11.5px]" style={{ color: "var(--status-critical)" }}>
                    {error}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <>
              {finding.managementResponse && (
                <div>
                  <div className="font-bold" style={{ color: "var(--ink-600)" }}>
                    {dict.m.auditManagementResponse}
                  </div>
                  <div style={{ color: "var(--ink-900)" }}>{finding.managementResponse}</div>
                </div>
              )}
              {finding.auditorAssessment && (
                <div>
                  <div className="font-bold" style={{ color: "var(--ink-600)" }}>
                    {dict.m.auditAuditorAssessment}
                  </div>
                  <div style={{ color: "var(--ink-900)" }}>{finding.auditorAssessment}</div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
