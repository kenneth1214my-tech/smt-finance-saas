import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/dal";
import { syncSubsidiaryFromXero, syncGroupFromXero } from "@/lib/xero-sync";

// Manual "Sync all" button — does a full 24-month P&L backfill, unlike the cron job's shorter
// recent-months catch-up, since this is the one-time/occasional deep sync an admin triggers
// on demand (e.g. right after first connecting). No subsidiaryId means the group/HQ-level
// connection instead — mirrors how /api/admin/erp/xero/connect and /disconnect already treat
// a missing subsidiaryId as "the group connection".
export async function POST(req: Request) {
  const user = await requireAdmin();
  const body = await req.json().catch(() => ({}));
  const subsidiaryId = body?.subsidiaryId;

  if (!subsidiaryId) {
    const result = await syncGroupFromXero(user.organizationId, 24);
    return NextResponse.json(result);
  }

  const subsidiary = await db.subsidiary.findUnique({ where: { id: subsidiaryId } });
  if (!subsidiary || subsidiary.organizationId !== user.organizationId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await syncSubsidiaryFromXero(subsidiaryId, user.organizationId, 24);
  return NextResponse.json(result);
}
