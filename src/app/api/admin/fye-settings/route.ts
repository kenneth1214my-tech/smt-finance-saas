import { NextResponse } from "next/server";
import { requireUser, canApprove } from "@/lib/dal";
import { fyeSettingSchema } from "@/lib/validation";
import { getFyeMonth, setFyeMonth } from "@/lib/currency";

export async function GET() {
  const user = await requireUser();
  if (!canApprove(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const fyeMonth = await getFyeMonth(user.organizationId);
  return NextResponse.json({ fyeMonth });
}

export async function PUT(req: Request) {
  const user = await requireUser();
  if (!canApprove(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const raw = await req.json().catch(() => null);
  const parsed = fyeSettingSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const row = await setFyeMonth(user.organizationId, parsed.data.fyeMonth);
  return NextResponse.json({ fyeMonth: row.fyeMonth });
}
