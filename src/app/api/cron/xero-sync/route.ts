import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncSubsidiaryFromXero, syncGroupFromXero } from "@/lib/xero-sync";

export const maxDuration = 300;

// Vercel Cron invokes this on schedule (see vercel.json) with an Authorization header matching
// the CRON_SECRET env var — this is the only auth check, since there's no logged-in user for a
// scheduled job. Syncs every connected subsidiary AND every connected group/HQ-level connection
// across every organization; each is wrapped so one tenant's failure (revoked token, Xero
// outage) doesn't stop the rest from running.
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const connections = await db.xeroConnection.findMany({ where: { connectedAt: { not: null } } });
  const groupConnections = await db.xeroGroupConnection.findMany({ where: { connectedAt: { not: null } } });
  const results: { subsidiaryId: string; ok: boolean; errors: string[] }[] = [];
  const groupResults: { organizationId: string; ok: boolean; errors: string[] }[] = [];

  for (const conn of connections) {
    try {
      const result = await syncSubsidiaryFromXero(conn.subsidiaryId, conn.organizationId, 3);
      results.push({ subsidiaryId: conn.subsidiaryId, ok: result.ok, errors: result.errors });
    } catch (err) {
      results.push({ subsidiaryId: conn.subsidiaryId, ok: false, errors: [err instanceof Error ? err.message : String(err)] });
    }
  }

  for (const conn of groupConnections) {
    try {
      const result = await syncGroupFromXero(conn.organizationId, 3);
      groupResults.push({ organizationId: conn.organizationId, ok: result.ok, errors: result.errors });
    } catch (err) {
      groupResults.push({ organizationId: conn.organizationId, ok: false, errors: [err instanceof Error ? err.message : String(err)] });
    }
  }

  return NextResponse.json({ ok: true, synced: results.length, results, groupSynced: groupResults.length, groupResults });
}
