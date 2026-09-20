import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/dal";
import { PENDING_COOKIE, decodePending } from "@/lib/xero-pending";

// Read-only view of a pending multi-tenant Xero connection, safe to send to the client — the
// access/refresh tokens themselves never leave the server.
export async function GET() {
  const user = await requireAdmin();
  const cookieStore = await cookies();
  const raw = cookieStore.get(PENDING_COOKIE)?.value;
  const pending = raw ? decodePending(raw) : null;
  if (!pending) return NextResponse.json({ pending: null });

  if (pending.kind === "group") {
    return NextResponse.json({ pending: { kind: "group", tenants: pending.tenants } });
  }

  const subsidiary = await db.subsidiary.findUnique({ where: { id: pending.subsidiaryId } });
  if (!subsidiary || subsidiary.organizationId !== user.organizationId) {
    return NextResponse.json({ pending: null });
  }

  return NextResponse.json({
    pending: {
      kind: "subsidiary",
      subsidiaryId: pending.subsidiaryId,
      subsidiaryName: subsidiary.nameZh,
      tenants: pending.tenants,
    },
  });
}
