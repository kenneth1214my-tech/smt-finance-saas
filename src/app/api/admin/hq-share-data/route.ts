import { NextResponse } from "next/server";
import { requireUser, canApprove } from "@/lib/dal";
import { db } from "@/lib/db";
import { hqShareDataSchema } from "@/lib/validation";

// Share data of the reporting company — shares outstanding, share price and dividend per share. Not held in
// Xero, so it is entered once here; EPS, P/E and dividend yield on the Business Analysis page read it.
export async function PUT(req: Request) {
  const user = await requireUser();
  if (!canApprove(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const raw = await req.json().catch(() => null);
  const parsed = hqShareDataSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const row = await db.organization.update({ where: { id: user.organizationId }, data: parsed.data });
  return NextResponse.json({
    sharesOutstanding: row.sharesOutstanding?.toString() ?? "",
    sharePrice: row.sharePrice?.toString() ?? "",
    dividendPerShare: row.dividendPerShare?.toString() ?? "",
  });
}
