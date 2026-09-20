import type { XeroReport } from "@/lib/xero";

export type RiskStatus = "GOOD" | "WARNING" | "SERIOUS" | "CRITICAL";

// Matches the aging buckets already used on the AR/AP dashboard pages (0-30/31-60/61-90/90+).
export function statusFromAgingDays(days: number): RiskStatus {
  if (days <= 30) return "GOOD";
  if (days <= 60) return "WARNING";
  if (days <= 90) return "SERIOUS";
  return "CRITICAL";
}

// AgedReceivablesByContact / AgedPayablesByContact list one Row per outstanding invoice, with
// Cells [Date, Number, Due Date, "", Total, Paid, Credited, Due]. A customer's overall aging is
// taken from their OLDEST unpaid invoice's due date (the worst-case item drives collection
// risk), not an average — a single old invoice among newer ones should still flag as risky.
export function oldestDueAgingDays(report: XeroReport, asOf: Date = new Date()): number {
  let oldestDueDate: Date | null = null;

  for (const section of report.Rows ?? []) {
    if (section.RowType !== "Section" || !section.Rows) continue;
    for (const row of section.Rows) {
      if (row.RowType !== "Row" || !row.Cells || row.Cells.length < 8) continue;
      const due = parseFloat(row.Cells[7]?.Value ?? "0");
      if (!due || due <= 0) continue;
      const dueDateRaw = row.Cells[2]?.Value;
      if (!dueDateRaw) continue;
      const dueDate = new Date(dueDateRaw);
      if (Number.isNaN(dueDate.getTime())) continue;
      if (!oldestDueDate || dueDate < oldestDueDate) oldestDueDate = dueDate;
    }
  }

  if (!oldestDueDate) return 0;
  const days = Math.floor((asOf.getTime() - oldestDueDate.getTime()) / 86_400_000);
  return Math.max(0, days);
}
