import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/dal";
import { syncSubsidiaryFromXero } from "@/lib/xero-sync";

// Manual "Sync all" button — does a full 24-month P&L backfill, unlike the cron job's shorter
// recent-months catch-up, since this is the one-time/occasional deep sync an admin triggers
// on demand (e.g. right after first connecting).
export async function POST(req: Request) {
  const user = await requireAdmin();
  const body = await req.json().catch(() => ({}));
  const subsidiaryId = body?.subsidiaryId;
  if (!subsidiaryId) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const subsidiary = await db.subsidiary.findUnique({ where: { id: subsidiaryId } });
  if (!subsidiary || subsidiary.organizationId !== user.organizationId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await syncSubsidiaryFromXero(subsidiaryId, user.organizationId, 24);
  return NextResponse.json(result);
}
