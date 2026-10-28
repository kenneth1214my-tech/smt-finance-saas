import "server-only";
import { db } from "@/lib/db";
import { getValidXeroAccessToken, getValidXeroGroupAccessToken } from "@/lib/xero-token";
import { fetchXeroGstDocuments } from "@/lib/xero";
import { buildGstBreakdown, type GstBreakdown } from "@/lib/gst";
import { parseGstPeriodLabel } from "@/lib/tax";

export type GstLoadResult =
  | { ok: true; filingId: string; subsidiaryId: string | null; entityName: string; periodLabel: string; quarterStart: string; quarterEnd: string; breakdown: GstBreakdown }
  | { ok: false; status: number; error: string; message?: string };

// Single place that turns a GST_F5 TaxFiling row into a Xero-derived breakdown — shared by the
// "estimate" action (which writes Box 6/7/8 onto the filing) and the "breakdown" action (which just
// shows the working), so the two can never disagree.
export async function loadGstBreakdown(filingId: string, organizationId: string): Promise<GstLoadResult> {
  const filing = await db.taxFiling.findFirst({ where: { id: filingId, organizationId }, include: { subsidiary: true } });
  if (!filing) return { ok: false, status: 404, error: "not_found" };
  if (filing.type !== "GST_F5") return { ok: false, status: 400, error: "not_gst_filing" };

  const quarter = parseGstPeriodLabel(filing.periodLabel);
  if (!quarter) {
    return {
      ok: false,
      status: 400,
      error: "unrecognized_period",
      message: 'Period label is not in the "YYYY QN" format this estimate relies on to know the date range — rename it to that format, or fill this filing in manually.',
    };
  }

  let accessToken: string;
  let tenantId: string;
  try {
    if (filing.subsidiaryId) {
      const conn = await db.xeroConnection.findUnique({ where: { subsidiaryId: filing.subsidiaryId } });
      if (!conn?.tenantId || !conn.connectedAt) return { ok: false, status: 400, error: "xero_not_connected" };
      accessToken = await getValidXeroAccessToken(conn);
      tenantId = conn.tenantId;
    } else {
      const conn = await db.xeroGroupConnection.findUnique({ where: { organizationId } });
      if (!conn?.tenantId || !conn.connectedAt) return { ok: false, status: 400, error: "xero_not_connected" };
      accessToken = await getValidXeroGroupAccessToken(conn);
      tenantId = conn.tenantId;
    }
  } catch (err) {
    return { ok: false, status: 502, error: "xero_error", message: err instanceof Error ? err.message : String(err) };
  }

  try {
    const { docs, coverage } = await fetchXeroGstDocuments(accessToken, tenantId, quarter.quarterStart, quarter.quarterEnd);
    // Box 13 is the revenue in the profit and loss for the same months — the platform already holds it per entity.
    const months: { year: number; month: number }[] = [];
    for (let d = new Date(quarter.quarterStart.getFullYear(), quarter.quarterStart.getMonth(), 1); d <= quarter.quarterEnd; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    const pnl = await db.monthlyFinancial.findMany({ where: { organizationId, subsidiaryId: filing.subsidiaryId ?? null, OR: months } });
    const periodRevenue = pnl.length > 0 ? pnl.reduce((a, r) => a + Number(r.revenue), 0) : null;
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return {
      ok: true,
      filingId: filing.id,
      subsidiaryId: filing.subsidiaryId,
      entityName: filing.subsidiary?.nameEn ?? "Group HQ",
      periodLabel: filing.periodLabel,
      quarterStart: iso(quarter.quarterStart),
      quarterEnd: iso(quarter.quarterEnd),
      breakdown: buildGstBreakdown(docs, coverage, { periodRevenue }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // This entity's connection predates the invoices.read scope — a refresh can't grant it, only a
    // full reconnect (see the SCOPES comment in xero.ts). Own code so the client shows a short,
    // actionable message instead of Xero's raw error JSON.
    if (message.includes("insufficient_scope")) return { ok: false, status: 400, error: "insufficient_scope" };
    return { ok: false, status: 502, error: "xero_error", message };
  }
}
