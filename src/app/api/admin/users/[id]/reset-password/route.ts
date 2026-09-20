import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, canApprove } from "@/lib/dal";
import { hashPassword } from "@/lib/password";
import { generateTempPassword } from "@/lib/genPassword";

export async function POST(_req: Request, ctx: RouteContext<"/api/admin/users/[id]/reset-password">) {
  const user = await requireUser();
  if (!canApprove(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const target = await db.user.findUnique({ where: { id } });
  if (!target || target.organizationId !== user.organizationId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  await db.user.update({ where: { id }, data: { passwordHash } });

  return NextResponse.json({ ok: true, tempPassword });
}
