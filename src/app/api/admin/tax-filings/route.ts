import { db } from "@/lib/db";
import { taxFilingSchema } from "@/lib/validation";
import { listCreateHandlers } from "@/lib/admin/crudHandlers";
import { requireUser } from "@/lib/dal";
import { statutoryDueDate } from "@/lib/filing-due-server";

const base = listCreateHandlers(db.taxFiling, taxFilingSchema, {
  include: { subsidiary: true },
  orderBy: { dueDate: "asc" },
});

export const GET = base.GET;

// The due date is set by the statutory rule (see filing-due.ts), not by whatever the form sent: IRAS / IRD dates are not typed in.
export async function POST(req: Request) {
  const user = await requireUser();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return base.POST(new Request(req.url, { method: "POST", headers: req.headers, body: "null" }));
  const due = await statutoryDueDate(user.organizationId, { type: body.type as string, periodLabel: body.periodLabel as string, subsidiaryId: (body.subsidiaryId as string) || null });
  const merged = due ? { ...body, dueDate: due.toISOString() } : body;
  return base.POST(new Request(req.url, { method: "POST", headers: req.headers, body: JSON.stringify(merged) }));
}
