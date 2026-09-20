import { NextResponse } from "next/server";
import { requireUser, canApprove } from "@/lib/dal";
import { db } from "@/lib/db";
import { hqHeadcountSchema } from "@/lib/validation";

export async function GET() {
  const user = await requireUser();
  if (!canApprove(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const org = await db.organization.findUnique({ where: { id: user.organizationId } });
  return NextResponse.json({ headcount: org?.headcount ?? 0 });
}

export async function PUT(req: Request) {
  const user = await requireUser();
  if (!canApprove(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const raw = await req.json().catch(() => null);
  const parsed = hqHeadcountSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const row = await db.organization.update({ where: { id: user.organizationId }, data: parsed.data });
  return NextResponse.json({ headcount: row.headcount });
}
