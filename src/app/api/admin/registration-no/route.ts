import { NextResponse } from "next/server";
import { requireUser, canApprove } from "@/lib/dal";
import { db } from "@/lib/db";

// The UEN / registration number of the company (no subsidiaryId) or of one subsidiary — each legal entity files in its own right.
export async function PUT(req: Request) {
  const user = await requireUser();
  if (!canApprove(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const raw = (await req.json().catch(() => null)) as { registrationNo?: unknown; subsidiaryId?: unknown } | null;
  const value = typeof raw?.registrationNo === "string" ? raw.registrationNo.trim().toUpperCase() : "";
  if (value && !/^[A-Z0-9-]{4,20}$/.test(value)) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  if (typeof raw?.subsidiaryId === "string" && raw.subsidiaryId) {
    const res = await db.subsidiary.updateMany({ where: { id: raw.subsidiaryId, organizationId: user.organizationId }, data: { registrationNo: value || null } });
    if (res.count === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ registrationNo: value || null });
  }
  const row = await db.organization.update({ where: { id: user.organizationId }, data: { registrationNo: value || null }, select: { registrationNo: true } });
  return NextResponse.json({ registrationNo: row.registrationNo });
}
