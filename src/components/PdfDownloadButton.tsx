"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { downloadPagePdf } from "@/lib/pdf-export";

export default function PdfDownloadButton({ companyName, title, subtitle, isZh }: { companyName: string; title: string; subtitle?: string; isZh: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onClick() {
    setBusy(true);
    setError("");
    try {
      const date = new Date().toISOString().slice(0, 10);
      await downloadPagePdf({ filename: `${title.replace(/[\\/:*?"<>|\s]+/g, "_")}_${date}.pdf`, companyName, title, subtitle, isZh });
    } catch (err) {
      setError(err instanceof Error ? err.message : isZh ? "PDF 生成失败" : "PDF export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2" data-pdf-hide>
      {error && (
        <span className="text-[11.5px]" style={{ color: "var(--status-critical)" }}>
          {error}
        </span>
      )}
      <button
        onClick={onClick}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-60"
        style={{ borderColor: "var(--border-strong)", background: "var(--surface)", color: "var(--ink-900)" }}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
        {busy ? (isZh ? "正在生成 PDF…" : "Building PDF…") : isZh ? "下载 PDF (A4)" : "Download PDF (A4)"}
      </button>
    </div>
  );
}
