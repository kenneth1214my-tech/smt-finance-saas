import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireUser } from "@/lib/dal";
import { getServerLocale } from "@/lib/i18n/locale";
import { loadLedgerAudit } from "@/lib/ledger-audit-data";
import { buildCorrections } from "@/lib/ledger-corrections";
import { buildLedgerSheets, rowsToCsv, LEDGER_SHEETS, type LedgerSheetName } from "@/lib/ledger-export";

// Download of the deferred revenue / prepayment / accrual audit: one Excel workbook with every sheet, or one sheet as CSV.
//   GET /api/admin/ledger-audit?format=xlsx
//   GET /api/admin/ledger-audit?format=csv&sheet=checks|breakdown|corrections|xero-journal
export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "xlsx";
  const sheet = url.searchParams.get("sheet") ?? "checks";
  if (format !== "xlsx" && format !== "csv") return NextResponse.json({ error: "invalid_format" }, { status: 400 });
  if (format === "csv" && !LEDGER_SHEETS.includes(sheet as LedgerSheetName)) return NextResponse.json({ error: "invalid_sheet" }, { status: 400 });

  const locale = await getServerLocale();
  const isZh = locale === "zh" || locale === "zh-Hant";
  const results = await loadLedgerAudit(user.organizationId, locale);
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10); // Singapore / Hong Kong date
  const sheets = buildLedgerSheets(results, buildCorrections(results, isZh, today), isZh);
  const base = `ledger-audit-${today}`;

  if (format === "csv") {
    const rows = sheets[sheet as LedgerSheetName];
    // The Xero import file needs its header row even when there is nothing to correct.
    const headers = sheet === "xero-journal" ? ["*Narration", "*Date", "Description", "*AccountCode", "*TaxRate", "*Amount", "TrackingName1", "TrackingOption1", "TrackingName2", "TrackingOption2"] : undefined;
    return new NextResponse(rowsToCsv(rows, headers), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}-${sheet}.csv"` },
    });
  }

  const wb = XLSX.utils.book_new();
  const names: Record<LedgerSheetName, string> = {
    checks: isZh ? "检查结果" : "Checks",
    breakdown: isZh ? "按月明细" : "Monthly breakdown",
    corrections: isZh ? "更正分录草稿" : "Draft corrections",
    "xero-journal": "Xero journal import",
  };
  for (const key of LEDGER_SHEETS) {
    const rows = sheets[key];
    const ws = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([[isZh ? "无记录" : "No rows"]]);
    if (rows.length) ws["!cols"] = Object.keys(rows[0]).map((k) => ({ wch: Math.min(60, Math.max(12, k.length + 2)) }));
    XLSX.utils.book_append_sheet(wb, ws, names[key]);
  }
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
    },
  });
}
