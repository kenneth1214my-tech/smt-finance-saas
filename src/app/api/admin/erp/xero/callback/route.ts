import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/dal";
import { exchangeXeroCode, fetchXeroTenants } from "@/lib/xero";
import { PENDING_COOKIE, PENDING_COOKIE_OPTS } from "@/lib/xero-pending";

const STATE_COOKIE = "xero_oauth_state";
const SUBSIDIARY_COOKIE = "xero_oauth_subsidiary";

export async function GET(req: Request) {
  const user = await requireAdmin();
  const url = new URL(req.url);
  const origin = url.origin;

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  const subsidiaryId = cookieStore.get(SUBSIDIARY_COOKIE)?.value || null;
  cookieStore.delete(STATE_COOKIE);
  cookieStore.delete(SUBSIDIARY_COOKIE);

  if (oauthError || !code || !state || !expectedState || state !== expectedState) {
    console.error("Xero callback rejected before token exchange", { oauthError, hasCode: Boolean(code), hasState: Boolean(state), hasExpectedState: Boolean(expectedState), stateMatches: state === expectedState });
    return NextResponse.redirect(new URL("/settings?tab=data&xero=error", origin));
  }

  if (subsidiaryId) {
    const subsidiary = await db.subsidiary.findUnique({ where: { id: subsidiaryId } });
    if (!subsidiary || subsidiary.organizationId !== user.organizationId) {
      console.error("Xero callback rejected: subsidiary ownership check failed", { subsidiaryId, userOrgId: user.organizationId, found: Boolean(subsidiary) });
      return NextResponse.redirect(new URL("/settings?tab=data&xero=error", origin));
    }
  }

  try {
    const redirectUri = `${origin}/api/admin/erp/xero/callback`;
    const tokens = await exchangeXeroCode(code, redirectUri);
    const tenants = await fetchXeroTenants(tokens.access_token);

    if (tenants.length === 0) {
      console.error("Xero callback rejected: no tenants returned by /connections");
      return NextResponse.redirect(new URL("/settings?tab=data&xero=error", origin));
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // A single Xero login can authorize access to several Xero organisations at once (common
    // when an accountant manages multiple client entities). If there's exactly one, connect it
    // immediately; otherwise the admin must pick which one belongs here rather than silently
    // keeping the first and losing the rest.
    if (tenants.length === 1) {
      const tenant = tenants[0];
      const data = {
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        connectedAt: new Date(),
      };
      if (subsidiaryId) {
        await db.xeroConnection.upsert({
          where: { subsidiaryId },
          create: { subsidiaryId, organizationId: user.organizationId, ...data },
          update: data,
        });
      } else {
        await db.xeroGroupConnection.upsert({
          where: { organizationId: user.organizationId },
          create: { organizationId: user.organizationId, ...data },
          update: data,
        });
      }
      return NextResponse.redirect(new URL("/settings?tab=data&xero=connected", origin));
    }

    const pendingBase = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: expiresAt.toISOString(),
      tenants,
    };
    const pending = Buffer.from(
      JSON.stringify(subsidiaryId ? { kind: "subsidiary", subsidiaryId, ...pendingBase } : { kind: "group", ...pendingBase })
    ).toString("base64");
    cookieStore.set(PENDING_COOKIE, pending, PENDING_COOKIE_OPTS);
    return NextResponse.redirect(new URL("/settings?tab=data&xero=choose_tenant", origin));
  } catch (err) {
    console.error("Xero OAuth callback failed", err);
    return NextResponse.redirect(new URL("/settings?tab=data&xero=error", origin));
  }
}
