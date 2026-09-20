// Client-safe parser for a real Xero "Aged Receivables Summary" / "Aged Payables Summary" Excel
// export — a bucketed report (one row per contact, aging buckets as columns: Current, < 1 Month,
// 1 Month, 2 Months, 3 Months, Older, Total), structurally nothing like the flat single-row-per-
// record CSV the plain Bulk Import expects. Built after a real Kingston export ("Aged Receivables
// Summary", 2484 rows of real student/parent contacts) failed against the strict template —
// mirrors the PnlImport/BalanceSheetImport pattern: read the real shape, don't invent one.
import { toNumber } from "@/lib/pnl-parser";
import { statusFromAgingDays, type RiskStatus } from "@/lib/xero-aging-parser";

export interface AgingContactRow {
  name: string;
  balance: number;
  agingDays: number;
  status: RiskStatus;
}

export interface AgingSummaryResult {
  contacts: AgingContactRow[];
  headerRowIndex: number | null;
  bucketLabels: string[];
  unrecognizedBuckets: string[];
}

// Xero always orders aging buckets from newest to oldest. Matching by label text (rather than a
// fixed column count) keeps this robust to different aging-period settings across orgs — e.g. an
// org configured for 4/5-month buckets still parses correctly via the "N Months" pattern.
function bucketDays(label: string): number | null {
  const l = label.trim().toLowerCase();
  if (l === "current") return 0;
  if (l === "< 1 month" || l === "less than 1 month") return 30;
  const monthMatch = l.match(/^(\d+)\s*months?$/);
  if (monthMatch) return parseInt(monthMatch[1], 10) * 30;
  if (l === "older") return 9999; // sentinel: always the oldest bucket in a comparison
  return null;
}

const SKIP_LABELS = ["total", "percentage of total", "aged receivables", "aged payables"];

// Recomputes each contact's balance from their own bucket cells rather than trusting the file's
// "Total" column — the same defense used in pnl-parser/balance-sheet-parser after finding Xero
// exports can carry a stale cached "0.00" in a formula cell that was never recalculated before
// saving. A row's Total/subtotal/percentage row (also literal 0.00 in every cell, same root
// cause) gets excluded naturally because it sums to zero — no real contact ever legitimately
// nets to exactly $0.00 across every bucket in an aging report, so this doubles as the filter
// for section-header and blank rows too, without needing to enumerate every possible label Xero
// might use for them.
export function parseAgingSummary(rows: string[][]): AgingSummaryResult {
  const headerRowIndex = rows.findIndex((r) => r[0]?.trim().toLowerCase() === "contact");
  if (headerRowIndex === -1) {
    return { contacts: [], headerRowIndex: null, bucketLabels: [], unrecognizedBuckets: [] };
  }

  const header = rows[headerRowIndex];
  const bucketCols: { index: number; label: string; days: number | null }[] = [];
  for (let i = 1; i < header.length; i++) {
    const label = header[i]?.trim();
    if (!label || label.toLowerCase() === "total") continue;
    bucketCols.push({ index: i, label, days: bucketDays(label) });
  }
  const unrecognizedBuckets = bucketCols.filter((b) => b.days === null).map((b) => b.label);

  const contacts: AgingContactRow[] = [];
  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    const name = row[0]?.trim();
    if (!name) continue;
    if (SKIP_LABELS.some((s) => name.toLowerCase() === s || name.toLowerCase().startsWith(s))) continue;

    let balance = 0;
    let oldestDays = 0;
    for (const b of bucketCols) {
      const amount = toNumber(row[b.index] ?? "");
      if (amount === 0) continue;
      balance += amount;
      const d = b.days ?? oldestDays; // unrecognized bucket: don't let it understate the aging
      if (d > oldestDays) oldestDays = d;
    }
    if (balance === 0) continue; // fully paid / no real outstanding amount — nothing to import

    // The 9999 sentinel is only for comparing which bucket is oldest — it's never a real day
    // count, so it can't be stored as-is. "Older" has no upper bound in Xero's own report, so
    // 150 (one bucket-width past the "3 Months" cutoff of 120) is used as its representative
    // value: enough to classify correctly as CRITICAL via statusFromAgingDays without displaying
    // an absurd number.
    const agingDays = oldestDays >= 9999 ? 150 : oldestDays;
    contacts.push({ name, balance, agingDays, status: statusFromAgingDays(agingDays) });
  }

  return { contacts, headerRowIndex, bucketLabels: bucketCols.map((b) => b.label), unrecognizedBuckets };
}
