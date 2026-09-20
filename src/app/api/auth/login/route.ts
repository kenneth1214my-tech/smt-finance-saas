import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSessionCookie } from "@/lib/session";
import { loginSchema } from "@/lib/validation";
import { rateLimit, clientKeyFromRequest } from "@/lib/rateLimit";

export async function POST(req: Request) {
  const ip = clientKeyFromRequest(req);
  const limit = rateLimit(`login-ip:${ip}`, 20, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const emailLimit = rateLimit(`login-email:${email.toLowerCase()}`, 10, 10 * 60 * 1000);
  if (!emailLimit.ok) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }
  if (user.status === "DISABLED") {
    return NextResponse.json({ error: "account_disabled" }, { status: 403 });
  }

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSessionCookie(user.id);

  return NextResponse.json({ ok: true });
}
