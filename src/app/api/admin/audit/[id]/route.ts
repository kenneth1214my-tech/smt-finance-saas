import { NextResponse } from "next/server";
import { requireUser, canApprove } from "@/lib/dal";
import { db } from "@/lib/db";
import { z } from "zod";

const updateSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "CLOSED"]).optional(),
  rootCause: z.string().max(4000).nullable().optional(),
  managementResponse: z.string().max(4000).nullable().optional(),
  auditorAssessment: z.string().max(4000).nullable().optional(),
  responsibleOwner: z.string().max(200).nullable().optional(),
  targetDate: z.coerce.date().nullable().optional(),
  closureEvidence: z.string().max(4000).nullable().optional(),
});

// Custom PATCH (not the generic itemHandlers CRUD helper) because closing a finding has a real
// business rule to enforce: §23 of the audit spec — "shall not mark a finding as closed solely
// because management states that corrective action was completed... closure should require
// appropriate evidence." So a transition to CLOSED is rejected server-side unless closureEvidence
// is present, either newly supplied in this request or already on the record.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!canApprove(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const raw = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues }, { status: 400 });

  const existing = await db.auditFinding.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const data = parsed.data;
  if (data.status === "CLOSED") {
    const closureEvidence = data.closureEvidence !== undefined ? data.closureEvidence : existing.closureEvidence;
    if (!closureEvidence || !closureEvidence.trim()) {
      return NextResponse.json({ error: "closure_evidence_required" }, { status: 400 });
    }
  }

  const closedAt = data.status === "CLOSED" && existing.status !== "CLOSED" ? new Date() : data.status && data.status !== "CLOSED" ? null : undefined;

  const row = await db.auditFinding.update({
    where: { id },
    data: { ...data, ...(closedAt !== undefined ? { closedAt } : {}) },
  });
  return NextResponse.json({ row });
}
