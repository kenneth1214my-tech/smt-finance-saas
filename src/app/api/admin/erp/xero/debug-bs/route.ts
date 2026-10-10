import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/dal";
import { getValidXeroAccessToken, getValidXeroGroupAccessToken } from "@/lib/xero-token";

// TEMPORARY recon route — returns the raw BalanceSheet row structure so the cash-flow derivation can
// be built against real data. Deleted right after use.
export const maxDuration = 60;

export async function GET(req: Request) {
  const user = await requireAdmin();
  const url = new URL(req.url);
  const subsidiaryId = url.searchParams.get("subsidiaryId");
  let accessToken: string;
  let tenantId: string;
  if (subsidiaryId) {
    const c = await db.xeroConnection.findUniqueOrThrow({ where: { subsidiaryId } });
    accessToken = await getValidXeroAccessToken(c);
    tenantId = c.tenantId!;
  } else {
    const c = await db.xeroGroupConnection.findUniqueOrThrow({ where: { organizationId: user.organizationId } });
    accessToken = await getValidXeroGroupAccessToken(c);
    tenantId = c.tenantId!;
  }
  const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const res = await fetch(`https://api.xero.com/api.xro/2.0/Reports/BalanceSheet?date=${date}&periods=2&timeframe=MONTH`, {
    headers: { Authorization: `Bearer ${accessToken}`, "Xero-Tenant-Id": tenantId, Accept: "application/json" },
  });
  const body = await res.json();
  type R = { RowType: string; Title?: string; Cells?: { Value?: string }[]; Rows?: R[] };
  function outline(rows: R[], depth = 0): string[] {
    return rows.flatMap((r) => [
      `${"  ".repeat(depth)}${r.RowType}${r.Title ? ` "${r.Title}"` : ""}${r.Cells ? " | " + r.Cells.map((c) => c.Value).join(" | ") : ""}`,
      ...(r.Rows ? outline(r.Rows, depth + 1) : []),
    ]);
  }
  return NextResponse.json({ status: res.status, outline: outline(body.Reports?.[0]?.Rows ?? []) });
}
