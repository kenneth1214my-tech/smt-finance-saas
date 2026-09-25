import "server-only";

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
const SCOPES =
  "offline_access accounting.contacts.read accounting.reports.profitandloss.read accounting.reports.balancesheet.read accounting.reports.aged.read accounting.reports.budgetsummary.read accounting.reports.banksummary.read";

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
