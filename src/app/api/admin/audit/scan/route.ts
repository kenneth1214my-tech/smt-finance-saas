import { NextResponse } from "next/server";
import { requireUser, canApprove } from "@/lib/dal";
import { getServerLocale } from "@/lib/i18n/locale";
import { runAuditScan } from "@/lib/audit";
import { z } from "zod";

const scanSchema = z.object({ year: z.coerce.number().int().min(2000).max(2100) });

export async function POST(req: Request) {
  const user = await requireUser();
  if (!canApprove(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const raw = await req.json().catch(() => null);
  const parsed = scanSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const locale = await getServerLocale();
  const result = await runAuditScan(user.organizationId, parsed.data.year, locale);
  return NextResponse.json(result);
}
