import { NextResponse } from "next/server";
import { requireUser, canApprove } from "@/lib/dal";
import { db } from "@/lib/db";
import { hqBalanceSheetSchema } from "@/lib/validation";

export async function GET() {
  const user = await requireUser();
  if (!canApprove(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const org = await db.organization.findUnique({ where: { id: user.organizationId } });
  return NextResponse.json({
    equity: org?.equity ?? 0,
    debtRatio: org?.debtRatio ?? 0,
    investmentInSubsidiaries: org?.investmentInSubsidiaries ?? 0,
    dueToSubsidiaries: org?.dueToSubsidiaries ?? 0,
  });
}

export async function PUT(req: Request) {
  const user = await requireUser();
  if (!canApprove(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const raw = await req.json().catch(() => null);
  const parsed = hqBalanceSheetSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const row = await db.organization.update({ where: { id: user.organizationId }, data: parsed.data });
  return NextResponse.json({
    equity: row.equity,
    debtRatio: row.debtRatio,
    investmentInSubsidiaries: row.investmentInSubsidiaries,
    dueToSubsidiaries: row.dueToSubsidiaries,
  });
}
