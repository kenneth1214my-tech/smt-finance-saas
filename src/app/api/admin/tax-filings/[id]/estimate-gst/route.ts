import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/dal";
import { getValidXeroAccessToken, getValidXeroGroupAccessToken } from "@/lib/xero-token";
import { fetchXeroGstTaxTotal } from "@/lib/xero";
import { parseGstPeriodLabel } from "@/lib/tax";

// Needs the accounting.invoices.read scope (see the SCOPES comment in xero.ts — a prior attempt
// used the old, broad accounting.transactions.read name and got rejected with invalid_scope).
// Any connection made before that scope was added must be reconnected (Settings -> Connect Xero)
// before this succeeds for it; until then it fails cleanly with "xero_not_connected"-style errors
// rather than a 500.
//
// Covers a quarter's worth of paginated Invoices fetches (two types x however many pages), plus
// Xero's own 429 backoff — same headroom as the other Xero sync routes.
export const maxDuration = 120;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await ctx.params;
  const organizationId = user.organizationId;

  const filing = await db.taxFiling.findFirst({ where: { id, organizationId } });
  if (!filing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (filing.type !== "GST_F5") return NextResponse.json({ error: "not_gst_filing" }, { status: 400 });

  const quarter = parseGstPeriodLabel(filing.periodLabel);
  if (!quarter) {
    return NextResponse.json(
      { error: "unrecognized_period", message: 'Period label is not in the "YYYY QN" format this estimate relies on to know the date range — rename it to that format, or fill this filing in manually.' },
      { status: 400 }
    );
  }

  let accessToken: string;
  let tenantId: string;
  try {
    if (filing.subsidiaryId) {
      const conn = await db.xeroConnection.findUnique({ where: { subsidiaryId: filing.subsidiaryId } });
      if (!conn?.tenantId || !conn.connectedAt) return NextResponse.json({ error: "xero_not_connected" }, { status: 400 });
      accessToken = await getValidXeroAccessToken(conn);
      tenantId = conn.tenantId;
    } else {
      const conn = await db.xeroGroupConnection.findUnique({ where: { organizationId } });
      if (!conn?.tenantId || !conn.connectedAt) return NextResponse.json({ error: "xero_not_connected" }, { status: 400 });
      accessToken = await getValidXeroGroupAccessToken(conn);
      tenantId = conn.tenantId;
    }
  } catch (err) {
    return NextResponse.json({ error: "xero_error", message: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }

  let outputTax: number;
  let inputTax: number;
  try {
    [outputTax, inputTax] = await Promise.all([
      fetchXeroGstTaxTotal(accessToken, tenantId, "ACCREC", quarter.quarterStart, quarter.quarterEnd),
      fetchXeroGstTaxTotal(accessToken, tenantId, "ACCPAY", quarter.quarterStart, quarter.quarterEnd),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // This entity's connection predates the invoices.read scope being added — a refresh can't
    // grant it, only a full reconnect (see the SCOPES comment in xero.ts). Surfaced as its own
    // code so the client shows a short, actionable message instead of the raw Xero error JSON.
    if (message.includes("insufficient_scope")) {
      return NextResponse.json({ error: "insufficient_scope" }, { status: 400 });
    }
    return NextResponse.json({ error: "xero_error", message }, { status: 502 });
  }

  const row = await db.taxFiling.update({
    where: { id },
    data: {
      outputTax,
      inputTax,
      amount: outputTax - inputTax,
      notes:
        "Estimated from Xero invoices/bills (accrual/invoice-date basis) — verify against Xero's own GST F5 report before filing. Does not special-case reverse-charge imports (GSTONIMPORTS).",
    },
  });
  return NextResponse.json({ row });
}
