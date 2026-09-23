"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Eye } from "lucide-react";
import type { Locale } from "@/lib/i18n/dictionaries";

const REPORT_TYPES = [
  { key: "consolidated_income_statement", zh: "合并利润表", en: "Consolidated Income Statement", href: "/report/consolidated", monthly: false },
  { key: "consolidated_balance_sheet", zh: "合并资产负债表", en: "Consolidated Balance Sheet", href: "/report/consolidated-balance-sheet", monthly: false },
  { key: "consolidated_cash_flow", zh: "合并现金流量表", en: "Consolidated Cash Flow Statement", href: "/report/consolidated-cash-flow", monthly: false },
  { key: "ar_aging", zh: "应收账龄分析报告", en: "AR Aging Analysis Report", href: "/report/ar-aging", monthly: false },
  { key: "monthly_risk", zh: "月度风险预警报告", en: "Monthly Risk Report", href: "/report/monthly-risk", monthly: true },
  { key: "audit_report", zh: "内部审计报告", en: "Internal Audit Report", href: "/report/audit-report", monthly: false },
  { key: "audited_statements", zh: "合并审计财务报表", en: "Consolidated Audited Financial Statements", href: "/report/audited-statements", monthly: false },
] as const;

export default function GenerateReportButton({ locale }: { locale: Locale }) {
  const router = useRouter();
  const isZh = locale === "zh" || locale === "zh-Hant";
  const [reportKey, setReportKey] = useState<(typeof REPORT_TYPES)[number]["key"]>("consolidated_income_statement");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [busy, setBusy] = useState(false);

  const type = REPORT_TYPES.find((t) => t.key === reportKey)!;

  // Every report page recomputes live from current data on every view regardless of whether a
  // ReportDoc exists for it (see the report-generation architecture notes) — so "preview" is
  // just navigating to that same live view without registering it in Report Center's list.
  // "Generate" does the same navigation but also creates/updates the ReportDoc row first, so the
  // report shows up as a tracked entry afterward.
  function preview() {
    router.push(type.monthly ? `${type.href}?year=${year}&month=${month}` : `${type.href}?year=${year}`);
  }

  async function generate() {
    setBusy(true);
    const res = await fetch("/api/admin/reports/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(type.monthly ? { reportKey, year, month } : { reportKey, year }),
    });
    setBusy(false);
    if (res.ok) {
      router.refresh();
      router.push(type.monthly ? `${type.href}?year=${year}&month=${month}` : `${type.href}?year=${year}`);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border p-3.5" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}>
      <span className="text-[12.5px] font-semibold" style={{ color: "var(--ink-600)" }}>
        {isZh ? "生成报表" : "Generate Report"}
      </span>
      <select
        value={reportKey}
        onChange={(e) => setReportKey(e.target.value as (typeof REPORT_TYPES)[number]["key"])}
        className="rounded-lg border px-2.5 py-1.5 text-[12.5px]"
        style={{ borderColor: "var(--border)" }}
      >
        {REPORT_TYPES.map((t) => (
          <option key={t.key} value={t.key}>
            {isZh ? t.zh : t.en}
          </option>
        ))}
      </select>
      <input
        value={year}
        onChange={(e) => setYear(e.target.value)}
        className="w-24 rounded-lg border px-2.5 py-1.5 text-[12.5px]"
        style={{ borderColor: "var(--border)" }}
      />
      {type.monthly && (
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border px-2.5 py-1.5 text-[12.5px]" style={{ borderColor: "var(--border)" }}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {isZh ? `${m}月` : `Month ${m}`}
            </option>
          ))}
        </select>
      )}
      <button
        onClick={preview}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-[12.5px] font-bold disabled:opacity-50"
        style={{ borderColor: "var(--border-strong)", color: "var(--ink-900)" }}
      >
        <Eye size={14} />
        {isZh ? "预览" : "Preview"}
      </button>
      <button
        onClick={generate}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50"
        style={{ background: "var(--cat-1)" }}
      >
        <Sparkles size={14} />
        {busy ? (isZh ? "生成中…" : "Generating…") : isZh ? "生成" : "Generate"}
      </button>
    </div>
  );
}
