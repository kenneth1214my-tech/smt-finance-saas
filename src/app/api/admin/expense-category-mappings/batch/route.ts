import { NextResponse } from "next/server";
import { requireUser, canApprove } from "@/lib/dal";
import { db } from "@/lib/db";
import { expenseCategoryMappingSchema } from "@/lib/validation";

// Upserts several (accountLabel -> category) mappings in one call — used by the Smart P&L
// Import panel when the admin classifies expense line items inline at import time, so those
// choices are remembered for every future import/sync instead of being asked again.
export async function POST(req: Request) {
  const user = await requireUser();
  if (!canApprove(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const raw = await req.json().catch(() => null);
  const rows: unknown[] = Array.isArray(raw?.mappings) ? raw.mappings : [];

  let successCount = 0;
  const failed: { index: number; error: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const parsed = expenseCategoryMappingSchema.safeParse(rows[i]);
    if (!parsed.success) {
      failed.push({ index: i, error: parsed.error.issues[0]?.message ?? "invalid_input" });
      continue;
    }
    try {
      await db.expenseCategoryMapping.upsert({
        where: { organizationId_accountLabel: { organizationId: user.organizationId, accountLabel: parsed.data.accountLabel } },
        create: { ...parsed.data, organizationId: user.organizationId },
        update: { category: parsed.data.category },
      });
      successCount++;
    } catch (err) {
      failed.push({ index: i, error: err instanceof Error ? err.message : "unknown_error" });
    }
  }

  return NextResponse.json({ successCount, failedCount: failed.length, failed });
}
