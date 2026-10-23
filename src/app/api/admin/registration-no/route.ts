import { NextResponse } from "next/server";
import { requireUser, canApprove } from "@/lib/dal";
import { db } from "@/lib/db";

// The company's UEN / registration number — ACRA XBRL filings are keyed on it.
export async function PUT(req: Request) {
  const user = await requireUser();
  if (!canApprove(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const raw = (await req.json().catch(() => null)) as { registrationNo?: unknown } | null;
  const value = typeof raw?.registrationNo === "string" ? raw.registrationNo.trim().toUpperCase() : "";
  if (value && !/^[0-9]{9}[A-Z]$/.test(value) && !/^[0-9]{8,10}[A-Z]?$/.test(value) && !/^[A-Z0-9-]{4,20}$/.test(value)) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const row = await db.organization.update({ where: { id: user.organizationId }, data: { registrationNo: value || null }, select: { registrationNo: true } });
  return NextResponse.json({ registrationNo: row.registrationNo });
}
