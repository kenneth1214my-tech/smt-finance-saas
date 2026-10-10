import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/dal";
import { loadGstBreakdown } from "@/lib/gst-xero";

// Needs the accounting.invoices.read scope (see the SCOPES comment in xero.ts). A connection made
// before that scope was added must be reconnected before this succeeds for it. Pulls a whole
// quarter of invoices/bills/credit notes with line detail, so it gets the maximum duration.
export const maxDuration = 300;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await ctx.params;

  const result = await loadGstBreakdown(id, user.organizationId);
  if (!result.ok) return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });

  const box = (n: string) => result.breakdown.boxes.find((b) => b.box === n)?.value ?? 0;
  const row = await db.taxFiling.update({
    where: { id },
    data: {
      outputTax: box("6"),
      inputTax: box("7"),
      amount: box("8"),
      notes:
        "Estimated from Xero invoices/bills/credit notes (invoice-date basis) — use the Breakdown action to review every figure against Xero's GST report before filing. Boxes 9-12 and 14-15 are not derived.",
    },
  });
  return NextResponse.json({ row });
}
