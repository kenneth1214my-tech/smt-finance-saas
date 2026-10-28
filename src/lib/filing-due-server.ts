import "server-only";
import { db } from "@/lib/db";
import { computeFilingDueDate } from "@/lib/filing-due";

/** The statutory due date for a filing, from the organization's jurisdiction and the entity's year-end — or null when the rule cannot work it out. */
export async function statutoryDueDate(organizationId: string, f: { type?: string | null; periodLabel?: string | null; subsidiaryId?: string | null }): Promise<Date | null> {
  if (!f.type || !f.periodLabel) return null;
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { jurisdiction: true, fyeMonth: true, incorporationDate: true } });
  if (!org) return null;
  let fye = org.fyeMonth;
  if (f.subsidiaryId) {
    const sub = await db.subsidiary.findFirst({ where: { id: f.subsidiaryId, organizationId }, select: { fyeMonth: true } });
    if (sub) fye = sub.fyeMonth;
  }
  const r = computeFilingDueDate({ jurisdiction: org.jurisdiction === "HK" ? "HK" : "SG", type: f.type, periodLabel: f.periodLabel, fyeMonth: fye, incorporationDate: org.incorporationDate ? org.incorporationDate.toISOString().slice(0, 10) : null });
  return r ? new Date(r.date + "T00:00:00.000Z") : null;
}
