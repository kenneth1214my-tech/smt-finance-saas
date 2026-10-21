import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, canApprove } from "@/lib/dal";
import { taxAdjustmentSchema } from "@/lib/validation";
import { listCreateHandlers } from "@/lib/admin/crudHandlers";

const handlers = listCreateHandlers(db.taxAdjustment, taxAdjustmentSchema, { orderBy: { createdAt: "asc" } });

export const GET = handlers.GET;

// An adjustment can only be attached to a provision of the caller's own organization.
export async function POST(req: Request) {
  const user = await requireUser();
  if (!canApprove(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const raw = await req.json().catch(() => null);
  const provisionId = typeof raw?.provisionId === "string" ? raw.provisionId : "";
  const provision = provisionId ? await db.corporateTaxProvision.findFirst({ where: { id: provisionId, organizationId: user.organizationId }, select: { id: true } }) : null;
  if (!provision) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  return handlers.POST(new Request(req.url, { method: "POST", headers: req.headers, body: JSON.stringify(raw) }));
}
