"use client";

import { X as XIcon } from "lucide-react";
import { exportToCsv, exportToXlsx, type ExportColumn } from "@/lib/export";
import { GST_CLASS_LABEL, type GstBreakdown } from "@/lib/gst";

export interface GstBreakdownView {
  entityName: string;
  periodLabel: string;
  quarterStart: string;
  quarterEnd: string;
  data: GstBreakdown;
}

const th = "pb-2 pr-3 text-left text-[11px] font-semibold";
const td = "whitespace-nowrap py-1.5 pr-3";

export default function GstBreakdownPanel({
  isZh,
  breakdown,
  unit,
  fmtM,
  onClose,
}: {
  isZh: boolean;
  breakdown: GstBreakdownView;
  unit: string;
  fmtM: (n: number) => string;
  onClose: () => void;
}) {
  const { data } = breakdown;
  const docColumns: ExportColumn[] = [
    { key: "date", label: isZh ? "日期" : "Date" },
    { key: "kind", label: isZh ? "单据类型" : "Document" },
    { key: "direction", label: isZh ? "方向" : "Direction" },
    { key: "number", label: isZh ? "编号" : "Number" },
    { key: "contact", label: isZh ? "联系人" : "Contact" },
    { key: "status", label: isZh ? "状态" : "Status" },
    { key: "currency", label: isZh ? "币种" : "Currency" },
    { key: "net", label: isZh ? "净额(本位币)" : "Net (base)" },
    { key: "tax", label: isZh ? "税额(本位币)" : "Tax (base)" },
    { key: "taxTypes", label: isZh ? "税码" : "Tax codes" },
  ];
  const docRows = data.documents as unknown as Record<string, unknown>[];
  const fileBase = `GST_F5_${breakdown.entityName.replace(/\s+/g, "_")}_${breakdown.periodLabel.replace(/\s+/g, "_")}`;
  const directionLabel = (d: string) => (d === "SALES" ? (isZh ? "销售" : "Sales") : isZh ? "采购" : "Purchases");

  return (
    <div className="mt-4 rounded-xl border p-4" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[14px] font-bold" style={{ color: "var(--ink-900)" }}>
            {isZh ? "IRAS GST F5 明细" : "IRAS GST F5 breakdown"} — {breakdown.entityName} · {breakdown.periodLabel}
          </div>
          <div className="text-[11.5px]" style={{ color: "var(--ink-400)" }}>
            {breakdown.quarterStart} → {breakdown.quarterEnd} · {unit}
          </div>
        </div>
        <button onClick={onClose} className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[12px] font-bold" style={{ background: "var(--surface-2)" }}>
          <XIcon size={13} /> {isZh ? "关闭" : "Close"}
        </button>
      </div>

      {data.warnings.length > 0 && (
        <ul className="mb-3 list-disc space-y-1 rounded-lg px-5 py-2 text-[11.5px]" style={{ background: "color-mix(in srgb,var(--status-warning) 12%,transparent)", color: "var(--ink-600)" }}>
          {data.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <div className="mb-1 text-[12px] font-bold" style={{ color: "var(--ink-900)" }}>
        {isZh ? "1. GST F5 栏位" : "1. GST F5 boxes"}
      </div>
      <div className="mb-4 overflow-x-auto">
        <table className="w-full text-[12.3px]">
          <thead>
            <tr style={{ color: "var(--ink-400)" }}>
              <th className={th}>Box</th>
              <th className={th}>{isZh ? "项目" : "Description"}</th>
              <th className={`${th} text-right`}>{isZh ? "金额" : "Amount"}</th>
            </tr>
          </thead>
          <tbody>
            {data.boxes.map((b) => (
              <tr key={b.box} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className={`${td} font-semibold`}>{b.box}</td>
                <td className="py-1.5 pr-3">{isZh ? b.zh : b.en}</td>
                <td className={`${td} text-right tabular-nums`} style={{ color: b.value === null ? "var(--ink-400)" : "var(--ink-900)", fontWeight: ["6", "7", "8"].includes(b.box) ? 700 : 400 }}>
                  {b.value === null ? (isZh ? "未计算 / 需人工填写" : "Not derived — enter manually") : fmtM(b.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mb-1 text-[12px] font-bold" style={{ color: "var(--ink-900)" }}>
        {isZh ? "2. 按税码汇总（核对分类是否正确）" : "2. By tax code (check the classification is right)"}
      </div>
      <div className="mb-4 overflow-x-auto">
        <table className="w-full text-[12.3px]">
          <thead>
            <tr style={{ color: "var(--ink-400)" }}>
              <th className={th}>{isZh ? "方向" : "Direction"}</th>
              <th className={th}>{isZh ? "税码" : "Tax code"}</th>
              <th className={th}>{isZh ? "归入" : "Treated as"}</th>
              <th className={`${th} text-right`}>{isZh ? "明细行数" : "Lines"}</th>
              <th className={`${th} text-right`}>{isZh ? "净额" : "Net"}</th>
              <th className={`${th} text-right`}>{isZh ? "税额" : "Tax"}</th>
            </tr>
          </thead>
          <tbody>
            {data.taxTypes.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 text-center" style={{ color: "var(--ink-400)" }}>
                  {isZh ? "该季度没有任何单据" : "No documents in this quarter"}
                </td>
              </tr>
            )}
            {data.taxTypes.map((r) => (
              <tr key={`${r.direction}${r.taxType}${r.cls}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className={td}>{directionLabel(r.direction)}</td>
                <td className={`${td} font-semibold`}>{r.taxType}</td>
                <td className="py-1.5 pr-3" style={{ color: r.cls === "UNK" ? "var(--status-critical)" : undefined }}>
                  {isZh ? GST_CLASS_LABEL[r.cls].zh : GST_CLASS_LABEL[r.cls].en}
                </td>
                <td className={`${td} text-right tabular-nums`}>{r.lines}</td>
                <td className={`${td} text-right tabular-nums`}>{fmtM(r.net)}</td>
                <td className={`${td} text-right tabular-nums`}>{fmtM(r.tax)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12px] font-bold" style={{ color: "var(--ink-900)" }}>
          {isZh ? `3. 单据清单（${data.documents.length} 张）` : `3. Document list (${data.documents.length})`}
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => exportToCsv(fileBase, docRows, docColumns)} disabled={docRows.length === 0} className="rounded-md px-2.5 py-1 text-[11.5px] font-bold disabled:opacity-40" style={{ background: "var(--surface-2)" }}>
            CSV
          </button>
          <button onClick={() => exportToXlsx(fileBase, docRows, docColumns, "GST F5")} disabled={docRows.length === 0} className="rounded-md px-2.5 py-1 text-[11.5px] font-bold disabled:opacity-40" style={{ background: "var(--surface-2)" }}>
            Excel
          </button>
        </div>
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0" style={{ background: "var(--surface)", color: "var(--ink-400)" }}>
            <tr>
              {docColumns.map((c) => (
                <th key={c.key} className={th}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.documents.map((d, i) => (
              <tr key={`${d.number}-${i}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className={td}>{d.date}</td>
                <td className={td}>{d.kind === "CreditNote" ? (isZh ? "贷项通知单" : "Credit note") : d.direction === "SALES" ? (isZh ? "销售发票" : "Invoice") : isZh ? "采购账单" : "Bill"}</td>
                <td className={td}>{directionLabel(d.direction)}</td>
                <td className={td}>{d.number}</td>
                <td className="py-1.5 pr-3">{d.contact}</td>
                <td className={td}>{d.status}</td>
                <td className={td}>{d.currency}</td>
                <td className={`${td} text-right tabular-nums`}>{fmtM(d.net)}</td>
                <td className={`${td} text-right tabular-nums`}>{fmtM(d.tax)}</td>
                <td className={td}>{d.taxTypes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
