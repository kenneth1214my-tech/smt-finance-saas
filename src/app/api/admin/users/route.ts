import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, canApprove } from "@/lib/dal";
import { hashPassword } from "@/lib/password";
import { generateTempPassword } from "@/lib/genPassword";
import { createUserSchema } from "@/lib/validation";

export async function POST(req: Request) {
  const admin = await requireUser();
  if (!canApprove(admin.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = createUserSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues }, { status: 400 });

  const existing = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return NextResponse.json({ error: "email_taken" }, { status: 409 });

  if (parsed.data.subsidiaryId) {
    const sub = await db.subsidiary.findUnique({ where: { id: parsed.data.subsidiaryId } });
    if (!sub || sub.organizationId !== admin.organizationId) {
      return NextResponse.json({ error: "invalid_subsidiary" }, { status: 400 });
    }
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const user = await db.user.create({
    data: {
      organizationId: admin.organizationId,
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: parsed.data.role,
      subsidiaryId: parsed.data.subsidiaryId || null,
      status: "ACTIVE",
    },
  });

  return NextResponse.json({ ok: true, user, tempPassword });
}
