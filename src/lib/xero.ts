import "server-only";
import type { GstRawDoc } from "@/lib/gst";

const AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const CONNECTIONS_URL = "https://api.xero.com/connections";

// Xero replaced broad scopes (accounting.reports.read, accounting.transactions.read) with
// granular ones for apps created after 2 March 2026 — the old names are rejected outright
// with invalid_scope. offline_access is required for a refresh token. app.connections was
// tried here too, assuming it was needed for the /connections endpoint (fetchXeroTenants
// below), but this app isn't actually granted that scope — requesting it alone triggers
// access_denied ("Requested wrong apps scopes"), confirmed via direct curl testing against
// Xero's authorize endpoint. /connections works fine without it: any valid access token can
// query which tenants it's connected to. The rest covers what a future sync would need (P&L,
// balance sheet, aged AR/AP, contact names).
// accounting.transactions.read (first attempt at backing fetchXeroGstTaxTotal / estimating GST
// F5 output/input tax from raw Invoices) was rejected outright with invalid_scope for this app
// — confirmed by actually hitting Xero's authorize endpoint in production, which broke
// Connect/Reconnect Xero entirely, not just the new feature. Root cause (per Xero's own granular
// scopes FAQ): accounting.transactions is one of the OLD broad scopes being split up for apps
// created after 2 March 2026 (this app's cohort) — Invoices now lives under its own
// accounting.invoices[.read] scope instead. Using the correct granular name this time.
const SCOPES =
  "offline_access accounting.contacts.read accounting.invoices.read accounting.reports.profitandloss.read accounting.reports.balancesheet.read accounting.reports.aged.read accounting.reports.budgetsummary.read accounting.reports.banksummary.read";

export function isXeroConfigured(): boolean {
  return Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET);
}

export function buildXeroAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.XERO_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

interface XeroTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export async function exchangeXeroCode(code: string, redirectUri: string): Promise<XeroTokenResponse> {
  const basic = Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  });
  if (!res.ok) throw new Error(`Xero token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

interface XeroConnectionInfo {
  tenantId: string;
  tenantName: string;
}

export async function fetchXeroTenants(accessToken: string): Promise<XeroConnectionInfo[]> {
  const res = await fetch(CONNECTIONS_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Xero connections fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Xero refresh tokens are single-use and rotate on every refresh — the caller must persist
// the NEW refresh_token returned here, or the next refresh attempt will fail.
export async function refreshXeroToken(refreshToken: string): Promise<XeroTokenResponse> {
  const basic = Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error(`Xero token refresh failed: ${res.status} ${await res.text()}`);
  return res.json();
}

interface XeroReportCell {
  Value?: string;
}
interface XeroReportRow {
  RowType: string;
  Title?: string;
  Cells?: XeroReportCell[];
  Rows?: XeroReportRow[];
}
export interface XeroReport {
  Rows: XeroReportRow[];
}

// Xero enforces a per-minute call quota (60/60s) AND a per-day quota (5000 calls/day per app) per
// tenant; a multi-month/multi-contact sync can burst past either. On 429, back off and retry a
// few times (honoring Retry-After when Xero sends one) instead of failing the whole sync
// outright — but Xero's Retry-After for a DAILY-quota breach can be minutes to hours (it resets
// on a fixed schedule, not a rolling window like the per-minute one), and blindly sleeping for
// that full duration inside a single serverless invocation just burns the entire function
// timeout in silence — no error, no progress, nothing in the logs, indistinguishable from a
// genuine hang (confirmed in production: a sync sat doing nothing for the full 300s platform
// limit with no diagnostic at all). Cap the wait comfortably above the per-minute window (60s) —
// confirmed in production that a burst of P&L calls right before a later step can trigger a
// ~45s Retry-After, which is worth actually waiting out — while a wait far beyond that (minutes
// to hours) is clearly the daily quota instead and fails fast with a clear, actionable error.
const MAX_RETRY_WAIT_SEC = 65;

async function xeroGet(accessToken: string, tenantId: string, url: string): Promise<unknown> {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, "Xero-Tenant-Id": tenantId, Accept: "application/json" },
    });
    if (res.status === 429 && attempt < maxAttempts) {
      const retryAfterSec = Number(res.headers.get("Retry-After")) || 2 ** attempt;
      if (retryAfterSec > MAX_RETRY_WAIT_SEC) {
        throw new Error(`Xero API call failed: 429 rate limited — Xero asked to wait ${retryAfterSec}s, too long to retry within this sync (likely the daily quota, which resets on a fixed schedule, not a short throttle)`);
      }
      await new Promise((r) => setTimeout(r, retryAfterSec * 1000));
      continue;
    }
    if (!res.ok) {
      // On a 401, Xero's WWW-Authenticate header distinguishes "token expired/invalid" from
      // "insufficient_scope" (the token is valid but was never granted this report's scope,
      // which happens when a scope was added to this app after an existing connection's OAuth
      // consent — refreshing a token only renews its ORIGINALLY granted scopes, it can't add
      // new ones; only a full reconnect re-prompts for consent) — surfaced here since the
      // combined error message alone couldn't distinguish the two.
      const wwwAuth = res.headers.get("www-authenticate");
      throw new Error(`Xero API call failed: ${res.status}${wwwAuth ? ` (${wwwAuth})` : ""} ${await res.text()}`);
    }
    return res.json();
  }
  throw new Error("Xero API call failed: exhausted retries after repeated 429");
}

export async function fetchXeroProfitAndLoss(accessToken: string, tenantId: string, fromDate: string, toDate: string): Promise<XeroReport> {
  const url = `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${fromDate}&toDate=${toDate}`;
  const body = (await xeroGet(accessToken, tenantId, url)) as { Reports?: XeroReport[] };
  return body.Reports?.[0] ?? { Rows: [] };
}

export interface XeroContact {
  ContactID: string;
  Name: string;
  IsCustomer: boolean;
  IsSupplier: boolean;
  Balances?: {
    AccountsReceivable?: { Outstanding?: number; Overdue?: number };
    AccountsPayable?: { Outstanding?: number; Overdue?: number };
  };
}

// Contacts is paginated at 100/page; callers should loop pages until an empty array comes back.
export async function fetchXeroContactsPage(accessToken: string, tenantId: string, page: number): Promise<XeroContact[]> {
  const url = `https://api.xero.com/api.xro/2.0/Contacts?page=${page}&includeArchived=false`;
  const body = (await xeroGet(accessToken, tenantId, url)) as { Contacts?: XeroContact[] };
  return body.Contacts ?? [];
}

export async function fetchXeroAgedReceivablesByContact(accessToken: string, tenantId: string, contactId: string): Promise<XeroReport> {
  const url = `https://api.xero.com/api.xro/2.0/Reports/AgedReceivablesByContact?contactId=${contactId}`;
  const body = (await xeroGet(accessToken, tenantId, url)) as { Reports?: XeroReport[] };
  return body.Reports?.[0] ?? { Rows: [] };
}

export async function fetchXeroAgedPayablesByContact(accessToken: string, tenantId: string, contactId: string): Promise<XeroReport> {
  const url = `https://api.xero.com/api.xro/2.0/Reports/AgedPayablesByContact?contactId=${contactId}`;
  const body = (await xeroGet(accessToken, tenantId, url)) as { Reports?: XeroReport[] };
  return body.Reports?.[0] ?? { Rows: [] };
}

// Budget Summary is a multi-period report (one column per month) rather than the single-value
// rows other reports return — the parser sums across all period columns to get an annual total.
export async function fetchXeroBudgetSummary(accessToken: string, tenantId: string, fromDate: string, periods: number): Promise<XeroReport> {
  // timeframe is the period LENGTH in months (1 = monthly, 3 = quarterly, 12 = yearly), not the
  // string "MONTH" — Xero rejects a non-numeric value with "Report Parameter timeframe could not
  // be parsed as an integer" (confirmed in production).
  const url = `https://api.xero.com/api.xro/2.0/Reports/BudgetSummary?date=${fromDate}&periods=${periods}&timeframe=1`;
  const body = (await xeroGet(accessToken, tenantId, url)) as { Reports?: XeroReport[] };
  return body.Reports?.[0] ?? { Rows: [] };
}

export async function fetchXeroBankSummary(accessToken: string, tenantId: string, fromDate: string, toDate: string): Promise<XeroReport> {
  const url = `https://api.xero.com/api.xro/2.0/Reports/BankSummary?fromDate=${fromDate}&toDate=${toDate}`;
  const body = (await xeroGet(accessToken, tenantId, url)) as { Reports?: XeroReport[] };
  return body.Reports?.[0] ?? { Rows: [] };
}

// Point-in-time snapshot (not a date range) — feeds Subsidiary.equity/debtRatio.
export async function fetchXeroBalanceSheet(accessToken: string, tenantId: string, date: string): Promise<XeroReport> {
  const url = `https://api.xero.com/api.xro/2.0/Reports/BalanceSheet?date=${date}`;
  const body = (await xeroGet(accessToken, tenantId, url)) as { Reports?: XeroReport[] };
  return body.Reports?.[0] ?? { Rows: [] };
}

// Month-end balance sheets in as few calls as possible: one request returns the given date plus up
// to 11 earlier month-ends as extra columns, so `count` month-ends need ceil(count / 12) requests.
// `newestMonthEnd` must itself be a month-end (yyyy-mm-dd). Returns one report per request, newest first.
export async function fetchXeroBalanceSheetSeries(accessToken: string, tenantId: string, newestMonthEnd: string, count: number): Promise<XeroReport[]> {
  const reports: XeroReport[] = [];
  let remaining = count;
  let year = Number(newestMonthEnd.slice(0, 4));
  let month = Number(newestMonthEnd.slice(5, 7));
  while (remaining > 0) {
    const periods = Math.min(11, remaining - 1);
    const date = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const url = `https://api.xero.com/api.xro/2.0/Reports/BalanceSheet?date=${date}&periods=${periods}&timeframe=MONTH`;
    const body = (await xeroGet(accessToken, tenantId, url)) as { Reports?: XeroReport[] };
    reports.push(body.Reports?.[0] ?? { Rows: [] });
    remaining -= periods + 1;
    month -= periods + 1;
    while (month <= 0) {
      month += 12;
      year -= 1;
    }
  }
  return reports;
}

// Xero has no GST report endpoint (see the SCOPES comment above), so GST output/input tax is
// estimated by summing the tax actually recorded on real invoices/bills instead — this is an
// ESTIMATE, not a certified replacement for Xero's own GST F5 return: it uses invoice-date
// (accrual) basis, not cash basis, and doesn't special-case reverse-charge imports (GSTONIMPORTS),
// which the real F5 form reports in both box 6 and box 7. Every caller must label the result as
// an estimate for the user to verify, not a final filing figure.
// Fetches every sales invoice, purchase bill and credit note in [fromDate, toDate] with line-level
// tax detail, for src/lib/gst.ts to classify into IRAS GST F5 boxes.
// Status must be AUTHORISED *or PAID*: Xero moves an invoice from AUTHORISED to PAID once it is
// fully settled, so filtering on AUTHORISED alone silently dropped every already-paid
// invoice/bill. DRAFT/SUBMITTED/VOIDED/DELETED stay excluded (not a real supply). Pages are fetched
// 500 at a time (Xero's default of 100 meant a busy entity needed dozens of calls and timed out).
type XeroGstApiDoc = {
  InvoiceNumber?: string;
  CreditNoteNumber?: string;
  Contact?: { Name?: string };
  DateString?: string;
  Status?: string;
  CurrencyCode?: string;
  CurrencyRate?: number;
  LineAmountTypes?: string;
  LineItems?: { TaxType?: string; LineAmount?: number; TaxAmount?: number }[];
};

async function fetchGstDocsOfType(accessToken: string, tenantId: string, resource: "Invoices" | "CreditNotes", type: string, fromDate: Date, toDate: Date): Promise<GstRawDoc[]> {
  const fmt = (d: Date) => `${d.getFullYear()},${d.getMonth() + 1},${d.getDate()}`;
  const where = `Type=="${type}"&&(Status=="AUTHORISED"||Status=="PAID")&&Date>=DateTime(${fmt(fromDate)})&&Date<=DateTime(${fmt(toDate)})`;
  const pageSize = 500;
  const out: GstRawDoc[] = [];
  for (let page = 1; ; page++) {
    const url = `https://api.xero.com/api.xro/2.0/${resource}?where=${encodeURIComponent(where)}&page=${page}&pageSize=${pageSize}`;
    const body = (await xeroGet(accessToken, tenantId, url)) as Record<string, XeroGstApiDoc[] | undefined>;
    const docs = body[resource] ?? [];
    for (const d of docs) {
      out.push({
        kind: resource === "Invoices" ? "Invoice" : "CreditNote",
        direction: type.startsWith("ACCREC") ? "SALES" : "PURCHASE",
        number: d.InvoiceNumber ?? d.CreditNoteNumber ?? "",
        contact: d.Contact?.Name ?? "",
        date: (d.DateString ?? "").slice(0, 10),
        status: d.Status ?? "",
        currency: d.CurrencyCode ?? "",
        currencyRate: d.CurrencyRate && d.CurrencyRate > 0 ? d.CurrencyRate : 1,
        lineAmountTypes: d.LineAmountTypes ?? "Exclusive",
        lines: (d.LineItems ?? []).map((l) => ({ taxType: l.TaxType ?? "", lineAmount: l.LineAmount ?? 0, taxAmount: l.TaxAmount ?? 0 })),
      });
    }
    if (docs.length < pageSize) break;
  }
  return out;
}

export async function fetchXeroGstDocuments(accessToken: string, tenantId: string, fromDate: Date, toDate: Date): Promise<GstRawDoc[]> {
  const parts = await Promise.all([
    fetchGstDocsOfType(accessToken, tenantId, "Invoices", "ACCREC", fromDate, toDate),
    fetchGstDocsOfType(accessToken, tenantId, "Invoices", "ACCPAY", fromDate, toDate),
    fetchGstDocsOfType(accessToken, tenantId, "CreditNotes", "ACCRECCREDIT", fromDate, toDate),
    fetchGstDocsOfType(accessToken, tenantId, "CreditNotes", "ACCPAYCREDIT", fromDate, toDate),
  ]);
  return parts.flat();
}
