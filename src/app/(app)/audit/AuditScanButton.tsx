"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScanSearch } from "lucide-react";
import type { Locale } from "@/lib/i18n/dictionaries";

export default function AuditScanButton({ locale, label, scanningLabel, noNewLabel }: { locale: Locale; label: string; scanningLabel: string; noNewLabel: string }) {
  const router = useRouter();
  const isZh = locale === "zh" || locale === "zh-Hant";
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<{ created: number; skipped: number } | null>(null);

  async function scan() {
    setBusy(true);
    setLastResult(null);
    const res = await fetch("/api/admin/audit/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year }),
    });
    setBusy(false);
    if (res.ok) {
      const body = await res.json();
      setLastResult(body);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border p-3.5" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}>
      <input
        value={year}
        onChange={(e) => setYear(e.target.value)}
        className="w-24 rounded-lg border px-2.5 py-1.5 text-[12.5px]"
        style={{ borderColor: "var(--border)" }}
      />
      <button
        onClick={scan}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50"
        style={{ background: "var(--cat-1)" }}
      >
        <ScanSearch size={14} />
        {busy ? scanningLabel : label}
      </button>
      {lastResult && (
        <span className="text-[12.5px]" style={{ color: "var(--ink-400)" }}>
          {lastResult.created > 0
            ? isZh
              ? `新增 ${lastResult.created} 条发现（另有 ${lastResult.skipped} 条为已存在的未结项）`
              : `${lastResult.created} new finding(s) created (${lastResult.skipped} skipped as already-open)`
            : noNewLabel}
        </span>
      )}
    </div>
  );
}
