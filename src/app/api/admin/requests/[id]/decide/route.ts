import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, canApprove } from "@/lib/dal";
import { hashPassword } from "@/lib/password";
import { generateTempPassword } from "@/lib/genPassword";

export async function POST(req: Request, ctx: RouteContext<"/api/admin/requests/[id]/decide">) {
  const user = await requireUser();
  if (!canApprove(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const approve = body?.approve === true;

  const request = await db.accessRequest.findUnique({ where: { id } });
  if (!request || request.status !== "PENDING" || request.organizationId !== user.organizationId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!approve) {
    await db.accessRequest.update({
      where: { id },
      data: { status: "REJECTED", decidedById: user.id, decidedAt: new Date() },
    });
    return NextResponse.json({ ok: true, approved: false });
  }

  const existing = await db.user.findUnique({ where: { email: request.email } });
  if (existing) {
    return NextResponse.json({ error: "email_taken" }, { status: 409 });
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  await db.$transaction([
    db.user.create({
      data: {
        organizationId: request.organizationId,
        name: request.name,
        email: request.email,
        passwordHash,
        role: request.requestedRole,
        subsidiaryId: request.subsidiaryId,
        status: "ACTIVE",
      },
    }),
    db.accessRequest.update({
      where: { id },
      data: { status: "APPROVED", decidedById: user.id, decidedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true, approved: true, tempPassword });
}
