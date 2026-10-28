// The GST-bearing records Xero keeps OUTSIDE invoices and credit notes, turned into the same GstRawDoc shape the F5 working
// uses. Pure (the Xero calls are injected), so the parsing and the journal scan can be tested without a Xero connection.
//
//  - Spend / receive money (BankTransactions): bank-paid purchases and receipts coded with GST.
//  - Manual journals: ledger adjustments that carry a tax code.
//  - Expense claims: staff claims entered through Xero's own expenses (Receipts). That endpoint is deprecated and needs its own
//    permission, so it is optional; claims paid as spend money or entered as bills are already covered by the other sources.
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
// Expense claims (Xero's own claims / receipts)
// ---------------------------------------------------------------------------------------------
interface XeroReceipt {
  ReceiptID?: string;
  ReceiptNumber?: string | number;
  Reference?: string;
  Date?: string;
  DateString?: string;
  Status?: string;
  Contact?: { Name?: string };
  User?: { FirstName?: string; LastName?: string };
  LineAmountTypes?: string;
  LineItems?: { TaxType?: string; LineAmount?: number; TaxAmount?: number }[];
}

export function receiptsToDocs(items: XeroReceipt[]): GstRawDoc[] {
  const out: GstRawDoc[] = [];
  for (const r of items) {
    // Only approved receipts reach the ledger; drafts, submitted, declined and voided ones carry no GST yet.
    if (r.Status !== "AUTHORISED") continue;
    const who = [r.User?.FirstName, r.User?.LastName].filter(Boolean).join(" ");
    out.push({
      kind: "ExpenseClaim",
      direction: "PURCHASE",
      number: String(r.ReceiptNumber ?? r.Reference ?? (r.ReceiptID ?? "").slice(0, 8)),
      contact: r.Contact?.Name || who || "Expense claim",
      date: parseXeroDate(r.DateString ?? r.Date) ?? "",
      status: r.Status ?? "",
      currency: "",
      currencyRate: 1,
      lineAmountTypes: r.LineAmountTypes ?? "Exclusive",
      lines: (r.LineItems ?? []).map((l) => ({ taxType: l.TaxType ?? "", lineAmount: l.LineAmount ?? 0, taxAmount: l.TaxAmount ?? 0 })),
    });
  }
  return out;
}

export async function fetchReceiptsForGst(get: XeroGet, from: Date, to: Date): Promise<GstRawDoc[]> {
  const where = `Status=="AUTHORISED"&&Date>=${dtArg(from)}&&Date<=${dtArg(to)}`;
  const body = (await get(`${API}/Receipts?where=${encodeURIComponent(where)}`)) as { Receipts?: XeroReceipt[] };
  return receiptsToDocs(body.Receipts ?? []);
}
