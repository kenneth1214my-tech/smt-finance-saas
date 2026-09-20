import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, canApprove } from "@/lib/dal";
import { updateUserSchema } from "@/lib/validation";

export async function PUT(req: Request, ctx: RouteContext<"/api/admin/users/[id]">) {
  const admin = await requireUser();
  if (!canApprove(admin.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const raw = await req.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues }, { status: 400 });

  const target = await db.user.findUnique({ where: { id } });
  if (!target || target.organizationId !== admin.organizationId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (parsed.data.email !== target.email) {
    const existing = await db.user.findUnique({ where: { email: parsed.data.email } });
    if (existing) return NextResponse.json({ error: "email_taken" }, { status: 409 });
  }

  if (parsed.data.subsidiaryId) {
    const sub = await db.subsidiary.findUnique({ where: { id: parsed.data.subsidiaryId } });
    if (!sub || sub.organizationId !== admin.organizationId) {
      return NextResponse.json({ error: "invalid_subsidiary" }, { status: 400 });
    }
  }

  const result = await db.user.updateMany({
    where: { id, organizationId: admin.organizationId },
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      subsidiaryId: parsed.data.subsidiaryId || null,
    },
  });
  if (result.count === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const user = await db.user.findUnique({ where: { id } });
  return NextResponse.json({ ok: true, user });
}
