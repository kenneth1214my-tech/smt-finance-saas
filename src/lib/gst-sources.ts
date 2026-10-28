// The GST-bearing records Xero keeps OUTSIDE invoices and credit notes, turned into the same GstRawDoc shape the F5 working
// uses. Pure (the Xero calls are injected), so the parsing and the journal scan can be tested without a Xero connection.
//
//  - Spend / receive money (BankTransactions): bank-paid purchases and receipts coded with GST.
//  - Manual journals: ledger adjustments that carry a tax code.
//  - Expense claims: staff purchase claims. Xero's granular scopes expose no expense-claim endpoint, so they are read from the
//    ledger journals (source type EXPCLAIM) — the only place they are reachable.
//
// Anything GST-relevant that this file cannot reach is reported by the caller as a coverage gap, never silently dropped.

import type { GstRawDoc, GstRawLine } from "@/lib/gst";

export type XeroGet = (url: string) => Promise<unknown>;

const API = "https://api.xero.com/api.xro/2.0";
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dtArg = (d: Date) => `DateTime(${d.getFullYear()},${d.getMonth() + 1},${d.getDate()})`;

/** Xero dates arrive as ISO text or the legacy "/Date(1583712000000+0000)/" form. Returns yyyy-mm-dd, or null if unreadable. */
export function parseXeroDate(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  const ms = /\/Date\((-?\d+)/.exec(v);
  if (ms) return new Date(Number(ms[1])).toISOString().slice(0, 10);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  return m ? m[1] : null;
}

// Singapore sales-side tax codes: OUTPUT*, SR / ZR / ES / OS / DS families. Purchase-side codes (INPUT*, TX, ZP, EP, BL, IM, ME,
// NP, OP, SROVR …) fall through to PURCHASE. "SROVR" (reverse-charge purchases) starts with SR but is a purchase code.
export function isSalesTaxCode(taxType: string): boolean {
  const c = (taxType || "").toUpperCase().trim();
  if (!c || c === "NONE") return false;
  if (c.startsWith("SROVR")) return false;
  return c.startsWith("OUTPUT") || c.startsWith("SR") || c.startsWith("ZR") || c.startsWith("ES") || c.startsWith("OS") || c.startsWith("DS");
}
const hasTaxCode = (taxType: string | undefined) => {
  const c = (taxType ?? "").toUpperCase().trim();
  return c !== "" && c !== "NONE";
};

// ---------------------------------------------------------------------------------------------
// Spend / receive money
// ---------------------------------------------------------------------------------------------
interface XeroBankTransaction {
  BankTransactionID?: string;
  Type?: string;
  Reference?: string;
  Contact?: { Name?: string };
  DateString?: string;
  Date?: string;
  Status?: string;
  CurrencyCode?: string;
  CurrencyRate?: number;
  LineAmountTypes?: string;
  LineItems?: { TaxType?: string; LineAmount?: number; TaxAmount?: number }[];
}

export function bankTransactionsToDocs(items: XeroBankTransaction[]): GstRawDoc[] {
  const out: GstRawDoc[] = [];
  for (const t of items) {
    // Only plain spend / receive money. Prepayments and overpayments are skipped: their GST is counted again when they are
    // allocated to the bill / invoice, so including both would double count. Transfers carry no GST.
    if (t.Type !== "SPEND" && t.Type !== "RECEIVE") continue;
    if (t.Status !== "AUTHORISED") continue;
    out.push({
      kind: "BankTransaction",
      direction: t.Type === "SPEND" ? "PURCHASE" : "SALES",
      number: t.Reference || (t.BankTransactionID ?? "").slice(0, 8),
      contact: t.Contact?.Name ?? "",
      date: parseXeroDate(t.DateString ?? t.Date) ?? "",
      status: t.Status ?? "",
      currency: t.CurrencyCode ?? "",
      currencyRate: t.CurrencyRate && t.CurrencyRate > 0 ? t.CurrencyRate : 1,
      lineAmountTypes: t.LineAmountTypes ?? "Exclusive",
      lines: (t.LineItems ?? []).map((l) => ({ taxType: l.TaxType ?? "", lineAmount: l.LineAmount ?? 0, taxAmount: l.TaxAmount ?? 0 })),
    });
  }
  return out;
}

export async function fetchBankTransactionsForGst(get: XeroGet, from: Date, to: Date): Promise<GstRawDoc[]> {
  const where = `(Type=="SPEND"||Type=="RECEIVE")&&Status=="AUTHORISED"&&Date>=${dtArg(from)}&&Date<=${dtArg(to)}`;
  const pageSize = 200;
  const out: GstRawDoc[] = [];
  for (let page = 1; page <= 100; page++) {
    const body = (await get(`${API}/BankTransactions?where=${encodeURIComponent(where)}&page=${page}&pageSize=${pageSize}`)) as { BankTransactions?: XeroBankTransaction[] };
    const items = body.BankTransactions ?? [];
    out.push(...bankTransactionsToDocs(items));
    if (items.length < pageSize) break;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Manual journals (ledger adjustments)
// ---------------------------------------------------------------------------------------------
interface XeroManualJournal {
  ManualJournalID?: string;
  Narration?: string;
  DateString?: string;
  Date?: string;
  Status?: string;
  LineAmountTypes?: string;
  JournalLines?: { LineAmount?: number; AccountCode?: string; TaxType?: string; TaxAmount?: number }[];
}

export function manualJournalsToDocs(items: XeroManualJournal[]): GstRawDoc[] {
  const out: GstRawDoc[] = [];
  for (const j of items) {
    if (j.Status !== "POSTED") continue;
    const taxed = (j.JournalLines ?? []).filter((l) => hasTaxCode(l.TaxType));
    if (taxed.length === 0) continue;
    const date = parseXeroDate(j.DateString ?? j.Date) ?? "";
    const number = (j.Narration ?? "").trim().slice(0, 40) || (j.ManualJournalID ?? "").slice(0, 8);
    // A journal can hold sales-coded and purchase-coded lines; each side becomes its own document. Debits are positive and
    // credits negative, so a sales-side (credit) line is flipped to read as a positive supply — a reversal still comes out negative.
    for (const direction of ["SALES", "PURCHASE"] as const) {
      const lines: GstRawLine[] = taxed
        .filter((l) => isSalesTaxCode(l.TaxType ?? "") === (direction === "SALES"))
        .map((l) => {
          const flip = direction === "SALES" ? -1 : 1;
          return { taxType: l.TaxType ?? "", lineAmount: flip * (l.LineAmount ?? 0), taxAmount: flip * (l.TaxAmount ?? 0) };
        });
      if (lines.length === 0) continue;
      out.push({ kind: "ManualJournal", direction, number, contact: "Manual journal", date, status: j.Status ?? "", currency: "", currencyRate: 1, lineAmountTypes: j.LineAmountTypes ?? "Exclusive", lines });
    }
  }
  return out;
}

export async function fetchManualJournalsForGst(get: XeroGet, from: Date, to: Date): Promise<GstRawDoc[]> {
  const where = `Status=="POSTED"&&Date>=${dtArg(from)}&&Date<=${dtArg(to)}`;
  const out: GstRawDoc[] = [];
  for (let page = 1; page <= 100; page++) {
    const body = (await get(`${API}/ManualJournals?where=${encodeURIComponent(where)}&page=${page}`)) as { ManualJournals?: XeroManualJournal[] };
    const items = body.ManualJournals ?? [];
    out.push(...manualJournalsToDocs(items));
    if (items.length < 100) break; // Xero returns 100 manual journals a page
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Expense claims, via the ledger journals
// ---------------------------------------------------------------------------------------------
interface XeroJournal {
  JournalID?: string;
  JournalNumber?: number;
  JournalDate?: string;
  Reference?: string;
  SourceType?: string;
  JournalLines?: { NetAmount?: number; GrossAmount?: number; TaxAmount?: number; TaxType?: string; AccountType?: string }[];
}

export function expenseClaimJournalsToDocs(journals: XeroJournal[], from: string, to: string): GstRawDoc[] {
  const out: GstRawDoc[] = [];
  for (const j of journals) {
    if (j.SourceType !== "EXPCLAIM") continue;
    const date = parseXeroDate(j.JournalDate) ?? "";
    if (!date || date < from || date > to) continue;
    // Only the expense lines carry a tax code; the GST control line and the payable line to the employee are coded NONE.
    const lines: GstRawLine[] = (j.JournalLines ?? [])
      .filter((l) => hasTaxCode(l.TaxType))
      .map((l) => ({ taxType: l.TaxType ?? "", lineAmount: l.NetAmount ?? 0, taxAmount: l.TaxAmount ?? 0 }));
    if (lines.length === 0) continue;
    out.push({ kind: "ExpenseClaim", direction: "PURCHASE", number: j.Reference || `J${j.JournalNumber ?? ""}`, contact: "Expense claim", date, status: "POSTED", currency: "", currencyRate: 1, lineAmountTypes: "Exclusive", lines });
  }
  return out;
}

export interface JournalScanResult {
  docs: GstRawDoc[];
  calls: number;
  truncated: boolean;
}

/**
 * Journals can only be listed by journal number ("offset"), not by date. The scan therefore (1) gallops to find the end of the
 * ledger, (2) binary-searches for the first journal dated on or after `from` minus a safety margin, then (3) reads forward to the
 * end — forward, not just to `to`, because a claim approved or back-dated after the quarter closed gets a LATER journal number.
 * `maxCalls` bounds the cost; hitting it is reported as a truncated scan rather than a silent gap.
 */
export async function scanExpenseClaimJournals(get: XeroGet, from: Date, to: Date, maxCalls = 220): Promise<JournalScanResult> {
  let calls = 0;
  const fromIso = iso(from);
  const toIso = iso(to);
  const margin = new Date(from.getTime() - 45 * 86_400_000);
  const marginIso = iso(margin);
  const page = async (offset: number): Promise<XeroJournal[]> => {
    calls++;
    const body = (await get(`${API}/Journals?offset=${offset}`)) as { Journals?: XeroJournal[] };
    return body.Journals ?? [];
  };

  // 1. find an offset past the start date (gallop), then 2. binary-search the earliest offset worth reading from
  let lo = 0; // known: journals after `lo` start before the margin (or lo is 0)
  let hi = -1; // known: first journal after `hi` is on/after the margin
  let probe = 100;
  while (hi < 0 && calls < maxCalls) {
    const first = (await page(probe))[0];
    if (!first) { hi = probe; break; } // ran off the end
    const d = parseXeroDate(first.JournalDate) ?? "";
    if (d >= marginIso) hi = probe;
    else { lo = probe; probe *= 2; }
  }
  if (hi < 0) hi = probe;
  while (hi - lo > 100 && calls < maxCalls) {
    const mid = Math.floor((lo + hi) / 2);
    const first = (await page(mid))[0];
    const d = first ? parseXeroDate(first.JournalDate) ?? "" : "9999-12-31";
    if (d >= marginIso) hi = mid;
    else lo = mid;
  }

  // 3. read forward from `lo` to the end of the ledger
  const docs: GstRawDoc[] = [];
  let offset = lo;
  let truncated = false;
  for (;;) {
    if (calls >= maxCalls) { truncated = true; break; }
    const rows = await page(offset);
    if (rows.length === 0) break;
    docs.push(...expenseClaimJournalsToDocs(rows, fromIso, toIso));
    const last = Math.max(...rows.map((r) => r.JournalNumber ?? 0));
    if (last <= offset) break; // no progress guard
    offset = last;
  }
  return { docs, calls, truncated };
}
