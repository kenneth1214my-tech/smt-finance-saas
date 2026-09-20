import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/dal";
import { PENDING_COOKIE, decodePending } from "@/lib/xero-pending";

export async function POST(req: Request) {
  const user = await requireAdmin();
  const cookieStore = await cookies();
  const raw = cookieStore.get(PENDING_COOKIE)?.value;
  const pending = raw ? decodePending(raw) : null;
  if (!pending) return NextResponse.json({ error: "expired" }, { status: 410 });

  const body = await req.json().catch(() => null);
  const tenantId = body?.tenantId;
  const tenant = pending.tenants.find((t) => t.tenantId === tenantId);
  if (!tenant) return NextResponse.json({ error: "invalid_tenant" }, { status: 400 });

  const data = {
    tenantId: tenant.tenantId,
    tenantName: tenant.tenantName,
    accessToken: pending.accessToken,
    refreshToken: pending.refreshToken,
    expiresAt: new Date(pending.expiresAt),
    connectedAt: new Date(),
  };

  if (pending.kind === "group") {
    await db.xeroGroupConnection.upsert({
      where: { organizationId: user.organizationId },
      create: { organizationId: user.organizationId, ...data },
      update: data,
    });
  } else {
    const subsidiary = await db.subsidiary.findUnique({ where: { id: pending.subsidiaryId } });
    if (!subsidiary || subsidiary.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    await db.xeroConnection.upsert({
      where: { subsidiaryId: pending.subsidiaryId },
      create: { subsidiaryId: pending.subsidiaryId, organizationId: user.organizationId, ...data },
      update: data,
    });
  }
  cookieStore.delete(PENDING_COOKIE);

  return NextResponse.json({ ok: true });
}
