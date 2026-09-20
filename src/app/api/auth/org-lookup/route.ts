import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findOrganizationByInviteCode } from "@/lib/company";
import { rateLimit, clientKeyFromRequest } from "@/lib/rateLimit";

export async function GET(req: Request) {
  const ip = clientKeyFromRequest(req);
  const limit = rateLimit(`org-lookup-ip:${ip}`, 30, 10 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });

  const code = new URL(req.url).searchParams.get("code")?.trim();
  if (!code) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const org = await findOrganizationByInviteCode(code);
  if (!org) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const subsidiaries = await db.subsidiary.findMany({ where: { organizationId: org.id }, orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ name: org.name, subsidiaries });
}
