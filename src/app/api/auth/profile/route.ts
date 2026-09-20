import { NextResponse } from "next/server";
import { requireUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { profileSchema } from "@/lib/validation";

export async function PUT(req: Request) {
  const user = await requireUser();
  const raw = await req.json().catch(() => null);
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const email = parsed.data.email.toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing && existing.id !== user.id) {
    return NextResponse.json({ error: "email_taken" }, { status: 409 });
  }

  const row = await db.user.update({ where: { id: user.id }, data: { name: parsed.data.name, email } });
  return NextResponse.json({ name: row.name, email: row.email });
}
