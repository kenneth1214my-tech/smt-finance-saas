import { NextResponse } from "next/server";
import { requireUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { changePasswordSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
  const user = await requireUser();
  const limit = rateLimit(`change-password:${user.id}`, 10, 10 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });

  const raw = await req.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "wrong_password" }, { status: 401 });

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await db.user.update({ where: { id: user.id }, data: { passwordHash } });
  return NextResponse.json({ ok: true });
}
