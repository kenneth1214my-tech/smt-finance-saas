import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { loadGstBreakdown } from "@/lib/gst-xero";

// Read-only: recomputes the IRAS GST F5 working from Xero on demand and returns it, writing nothing.
export const maxDuration = 300;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await ctx.params;

  const result = await loadGstBreakdown(id, user.organizationId);
  if (!result.ok) return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  return NextResponse.json(result);
}
