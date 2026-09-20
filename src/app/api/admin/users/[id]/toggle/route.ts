import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, canApprove } from "@/lib/dal";

export async function POST(_req: Request, ctx: RouteContext<"/api/admin/users/[id]/toggle">) {
  const user = await requireUser();
  if (!canApprove(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (id === user.id) {
    return NextResponse.json({ error: "cannot_toggle_self" }, { status: 400 });
  }

  const target = await db.user.findUnique({ where: { id } });
  if (!target || target.organizationId !== user.organizationId) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const nextStatus = target.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
  await db.user.update({ where: { id }, data: { status: nextStatus } });

  return NextResponse.json({ ok: true, status: nextStatus });
}
