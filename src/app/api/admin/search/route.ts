import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, canApprove } from "@/lib/dal";

// The app has no per-entity detail pages (subsidiaries/customers/etc. are all shown on one
// shared list page per category, not /sub/[id]), so a match can only jump to that category's
// page — not scroll to or highlight the specific row.
export async function GET(req: Request) {
  const user = await requireUser();
  if (!canApprove(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });

  const organizationId = user.organizationId;
  const nameMatch = (a: string, b: string) => [{ [a]: { contains: q, mode: "insensitive" as const } }, { [b]: { contains: q, mode: "insensitive" as const } }];

  const [subs, ar, ap, projects, risks] = await Promise.all([
    db.subsidiary.findMany({ where: { organizationId, OR: nameMatch("nameZh", "nameEn") }, take: 5 }),
    db.aRCustomer.findMany({ where: { organizationId, OR: nameMatch("nameZh", "nameEn") }, take: 5 }),
    db.payable.findMany({ where: { organizationId, OR: nameMatch("nameZh", "nameEn") }, take: 5 }),
    db.project.findMany({ where: { organizationId, OR: nameMatch("nameZh", "nameEn") }, take: 5 }),
    db.riskAlert.findMany({ where: { organizationId, OR: [{ tag: { contains: q, mode: "insensitive" } }, { entityLabel: { contains: q, mode: "insensitive" } }] }, take: 5 }),
  ]);

  const results = [
    ...subs.map((s) => ({ id: s.id, label: s.nameZh, category: "subsidiary", href: "/sub" })),
    ...ar.map((c) => ({ id: c.id, label: c.nameZh, category: "ar", href: "/ar" })),
    ...ap.map((v) => ({ id: v.id, label: v.nameZh, category: "ap", href: "/ap" })),
    ...projects.map((p) => ({ id: p.id, label: p.nameZh, category: "project", href: "/project" })),
    ...risks.map((r) => ({ id: r.id, label: r.tag, category: "risk", href: "/risk" })),
  ];

  return NextResponse.json({ results });
}
