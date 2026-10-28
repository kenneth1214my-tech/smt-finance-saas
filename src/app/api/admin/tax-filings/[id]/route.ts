import { db } from "@/lib/db";
import { taxFilingSchema } from "@/lib/validation";
import { itemHandlers } from "@/lib/admin/crudHandlers";
import { requireUser } from "@/lib/dal";
import { statutoryDueDate } from "@/lib/filing-due-server";

const base = itemHandlers(db.taxFiling, taxFilingSchema.partial());

export const DELETE = base.DELETE;

// If the edit changes the type, period or entity, the due date is recalculated by the statutory rule rather than taken from the form.
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (body) {
    const existing = await db.taxFiling.findFirst({ where: { id, organizationId: user.organizationId }, select: { type: true, periodLabel: true, subsidiaryId: true } });
    if (existing) {
      const due = await statutoryDueDate(user.organizationId, {
        type: (body.type as string) ?? existing.type,
        periodLabel: (body.periodLabel as string) ?? existing.periodLabel,
        subsidiaryId: "subsidiaryId" in body ? ((body.subsidiaryId as string) || null) : existing.subsidiaryId,
      });
      if (due) body.dueDate = due.toISOString();
    }
  }
  return base.PUT(new Request(req.url, { method: "PUT", headers: req.headers, body: JSON.stringify(body) }), ctx);
}
