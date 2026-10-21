import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSessionCookie } from "@/lib/session";
import type { User } from "@prisma/client";
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

  // One e-mail + password can belong to several companies: collect every account whose password matches.
  const candidates = await db.user.findMany({
    where: { email: email.toLowerCase() },
    include: { organization: { select: { name: true } } },
    orderBy: { lastLoginAt: { sort: "desc", nulls: "last" } },
  });
  const matched: (User & { organization: { name: string } })[] = [];
  for (const c of candidates) if (await verifyPassword(password, c.passwordHash)) matched.push(c);
  if (matched.length === 0) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }
  const active = matched.filter((m) => m.status === "ACTIVE");
  if (active.length === 0) {
    return NextResponse.json({ error: "account_disabled" }, { status: 403 });
  }

  // Open the company used last time; with several, the client then offers a "choose company" step.
  const user = active[0];
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSessionCookie(user.id, active.map((a) => a.id));

  return NextResponse.json({
    ok: true,
    choices: active.length > 1 ? active.map((a) => ({ userId: a.id, company: a.organization.name, role: a.role, current: a.id === user.id })) : undefined,
  });
}
