import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readSessionFromCookies, createSessionCookie } from "@/lib/session";

// Switch to another company account that was proven at sign-in (the signed session lists them).
export async function POST(req: Request) {
  const session = await readSessionFromCookies();
  if (!session?.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = (await req.json().catch(() => null)) as { userId?: unknown } | null;
  const targetId = typeof raw?.userId === "string" ? raw.userId : "";
  const allowed = [...new Set([session.userId, ...(Array.isArray(session.linked) ? session.linked : [])])];
  if (!allowed.includes(targetId)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const target = await db.user.findUnique({ where: { id: targetId } });
  if (!target || target.status !== "ACTIVE") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await db.user.update({ where: { id: target.id }, data: { lastLoginAt: new Date() } });
  await createSessionCookie(target.id, allowed);
  return NextResponse.json({ ok: true });
}
