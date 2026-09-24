import "server-only";
import { db } from "@/lib/db";
import { refreshXeroToken } from "@/lib/xero";
import type { XeroConnection, XeroGroupConnection } from "@prisma/client";

// Access tokens expire in ~30 minutes; refresh a little early to avoid a race against the
// actual Xero API call. Xero refresh tokens rotate on every use, so the new one must be saved
// immediately or the next sync will fail with an invalid_grant.
export async function getValidXeroAccessToken(connection: XeroConnection): Promise<string> {
  const expiresAt = connection.expiresAt ? new Date(connection.expiresAt).getTime() : 0;
  if (!connection.refreshToken || expiresAt - Date.now() > 60_000) {
    return connection.accessToken ?? "";
  }
  const tokens = await refreshXeroToken(connection.refreshToken);
  await db.xeroConnection.update({
    where: { id: connection.id },
    data: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
  });
  return tokens.access_token;
}

// Same as above, for the separate group/HQ-level connection table — kept as its own function
// (rather than a generic one) since the refresh-token write-back targets a different Prisma
// delegate and there's no shared base type between XeroConnection and XeroGroupConnection.
export async function getValidXeroGroupAccessToken(connection: XeroGroupConnection): Promise<string> {
  const expiresAt = connection.expiresAt ? new Date(connection.expiresAt).getTime() : 0;
  if (!connection.refreshToken || expiresAt - Date.now() > 60_000) {
    return connection.accessToken ?? "";
  }
  const tokens = await refreshXeroToken(connection.refreshToken);
  await db.xeroGroupConnection.update({
    where: { id: connection.id },
    data: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
  });
  return tokens.access_token;
}
