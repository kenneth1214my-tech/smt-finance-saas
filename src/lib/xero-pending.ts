// Shared between the OAuth callback and the tenant-choice routes: when a single Xero login
// authorizes multiple tenants, the tokens are held here (httpOnly, short-lived) until the
// admin picks which tenant belongs to which subsidiary.
export const PENDING_COOKIE = "xero_pending";

export const PENDING_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
};

export type XeroPending =
  | { kind: "group"; accessToken: string; refreshToken: string; expiresAt: string; tenants: { tenantId: string; tenantName: string }[] }
  | { kind: "subsidiary"; subsidiaryId: string; accessToken: string; refreshToken: string; expiresAt: string; tenants: { tenantId: string; tenantName: string }[] };

export function decodePending(raw: string): XeroPending | null {
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    return null;
  }
}
