import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/dal";

export async function POST(req: Request) {
  const user = await requireAdmin();
  const body = await req.json().catch(() => ({}));
  const subsidiaryId = body?.subsidiaryId;

  if (subsidiaryId) {
    await db.xeroConnection.deleteMany({ where: { subsidiaryId, organizationId: user.organizationId } });
  } else {
    await db.xeroGroupConnection.deleteMany({ where: { organizationId: user.organizationId } });
  }
  return NextResponse.json({ ok: true });
}
