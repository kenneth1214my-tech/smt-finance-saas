import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { readSessionFromCookies, createSessionCookie } from "@/lib/session";
import { rateLimit, clientKeyFromRequest } from "@/lib/rateLimit";

// Add another company account to this session by proving its e-mail + password once.
export async function POST(req: Request) {
  const session = await readSessionFromCookies();
  if (!session?.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limit = rateLimit(`link-company:${session.userId}:${clientKeyFromRequest(req)}`, 10, 10 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });

  const raw = (await req.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  const email = typeof raw?.email === "string" ? raw.email.trim().toLowerCase() : "";
  const password = typeof raw?.password === "string" ? raw.password : "";
  if (!email || !password) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const candidates = await db.user.findMany({ where: { email, status: "ACTIVE" } });
  const added: string[] = [];
  for (const c of candidates) if (await verifyPassword(password, c.passwordHash)) added.push(c.id);
  if (added.length === 0) return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });

  const ids = [...new Set([session.userId, ...(Array.isArray(session.linked) ? session.linked : []), ...added])];
  await createSessionCookie(session.userId, ids);
  return NextResponse.json({ ok: true, added: added.length });
}
