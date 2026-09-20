import { NextResponse } from "next/server";
import { requireUser, canApprove } from "@/lib/dal";
import { currencySettingSchema } from "@/lib/validation";
import { getBaseCurrency, setBaseCurrency } from "@/lib/currency";

export async function GET() {
  const user = await requireUser();
  if (!canApprove(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const baseCurrency = await getBaseCurrency(user.organizationId);
  return NextResponse.json({ baseCurrency });
}

export async function PUT(req: Request) {
  const user = await requireUser();
  if (!canApprove(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const raw = await req.json().catch(() => null);
  const parsed = currencySettingSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const row = await setBaseCurrency(user.organizationId, parsed.data.baseCurrency.toUpperCase());
  return NextResponse.json({ baseCurrency: row.baseCurrency });
}
