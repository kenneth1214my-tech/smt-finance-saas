import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/dal";
import { isXeroConfigured, buildXeroAuthorizeUrl } from "@/lib/xero";

const STATE_COOKIE = "xero_oauth_state";
const SUBSIDIARY_COOKIE = "xero_oauth_subsidiary";

// With no subsidiaryId, this connects the group/HQ-level Xero organization. With one, it
// connects that specific subsidiary instead — a group may have subsidiaries on different Xero
// company files, so each connects independently.
export async function GET(req: Request) {
  const user = await requireAdmin();
  const origin = new URL(req.url).origin;
  const subsidiaryId = new URL(req.url).searchParams.get("subsidiaryId");

  if (subsidiaryId) {
    const subsidiary = await db.subsidiary.findUnique({ where: { id: subsidiaryId } });
    if (!subsidiary || subsidiary.organizationId !== user.organizationId) {
      return NextResponse.redirect(new URL("/settings?tab=data&xero=error", origin));
    }
  }

  if (!isXeroConfigured()) {
    return NextResponse.redirect(new URL("/settings?tab=data&xero=not_configured", origin));
  }

  const state = crypto.randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600,
  };
  cookieStore.set(STATE_COOKIE, state, cookieOpts);
  if (subsidiaryId) cookieStore.set(SUBSIDIARY_COOKIE, subsidiaryId, cookieOpts);
  else cookieStore.delete(SUBSIDIARY_COOKIE);

  const redirectUri = `${origin}/api/admin/erp/xero/callback`;
  return NextResponse.redirect(buildXeroAuthorizeUrl(redirectUri, state));
}
