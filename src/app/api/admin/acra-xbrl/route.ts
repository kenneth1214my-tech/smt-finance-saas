import { NextResponse } from "next/server";
import { requireUser, canApprove } from "@/lib/dal";
import { getServerLocale } from "@/lib/i18n/locale";
import { loadAcraPack } from "@/lib/acra-xbrl-data";
import { acraFileBase, buildAcraCsv, buildAcraInstanceXml, type AcraScope, type AcraTemplate } from "@/lib/acra-xbrl";
import { db } from "@/lib/db";

// ACRA XBRL pack for one financial year: JSON for the Tax Center tab, or the downloadable .xbrl instance / CSV breakdown.
export async function GET(req: Request) {
  const user = await requireUser();
  if (!canApprove(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const org = await db.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { jurisdiction: true, accountingFramework: true } });
  if (org.jurisdiction !== "SG") return NextResponse.json({ error: "singapore_only" }, { status: 400 });

  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return NextResponse.json({ error: "invalid_year" }, { status: 400 });
  const scope: AcraScope = url.searchParams.get("scope") === "group" ? "group" : "company";
  const tpl = url.searchParams.get("template");
  const template: AcraTemplate | undefined = tpl === "full" ? "Full XBRL" : tpl === "simplified" ? "Simplified XBRL" : undefined;
  const format = url.searchParams.get("format") ?? "json";
  const locale = await getServerLocale();
  const isZh = locale === "zh" || locale === "zh-Hant";

  const pack = await loadAcraPack({ organizationId: user.organizationId, year, scope, template, isZh });
  if (format === "json") return NextResponse.json(pack);

  if (!pack.uen || !/^[0-9]{9}[A-Za-z]$/.test(pack.uen)) return NextResponse.json({ error: "uen_required" }, { status: 422 });
  if (!pack.readyForInstance) return NextResponse.json({ error: "data_missing" }, { status: 422 });
  const base = acraFileBase(pack);
  if (format === "csv") {
    return new NextResponse(buildAcraCsv(pack), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}-breakdown.csv"` } });
  }
  if (format === "xbrl") {
    const xml = buildAcraInstanceXml(pack, { accountingFramework: org.accountingFramework === "SFRS_SE" ? "SFRS_SE" : "SFRS_I" });
    return new NextResponse(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.xbrl"` } });
  }
  return NextResponse.json({ error: "invalid_format" }, { status: 400 });
}
