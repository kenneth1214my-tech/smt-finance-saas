"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { JURISDICTIONS, type AuditJurisdiction } from "@/lib/audit-jurisdiction";
import type { Locale } from "@/lib/i18n/dictionaries";

export default function JurisdictionSelect({ year, jurisdiction, locale }: { year: number; jurisdiction: AuditJurisdiction; locale: Locale }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isZh = locale === "zh" || locale === "zh-Hant";

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(year));
    params.set("jurisdiction", next);
    router.push(`/report/audit-report?${params.toString()}`);
  }

  return (
    <label className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--ink-600)" }}>
      {isZh ? "报告格式" : "Report format"}
      <select value={jurisdiction} onChange={(e) => onChange(e.target.value)} className="rounded-lg border px-2.5 py-1.5 text-[12.5px]" style={{ borderColor: "var(--border)" }}>
        {JURISDICTIONS.map((j) => (
          <option key={j.code} value={j.code}>
            {isZh ? j.labelZh : j.labelEn}
          </option>
        ))}
      </select>
    </label>
  );
}
