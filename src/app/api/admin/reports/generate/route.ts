import { NextResponse } from "next/server";
import { requireUser, canApprove } from "@/lib/dal";
import { db } from "@/lib/db";
import { getServerLocale } from "@/lib/i18n/locale";
import { computeConsolidatedIncomeStatement, computeConsolidatedBalanceSheet, computeConsolidatedCashFlow } from "@/lib/consolidated-report";
import { computeARAgingReport, computeMonthlyRiskReport } from "@/lib/special-report";
import { computeAuditReport } from "@/lib/audit";
import { z } from "zod";

const REPORT_KEYS = ["consolidated_income_statement", "consolidated_balance_sheet", "consolidated_cash_flow", "ar_aging", "monthly_risk", "audit_report"] as const;

const generateSchema = z.object({
  reportKey: z.enum(REPORT_KEYS),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!canApprove(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const raw = await req.json().catch(() => null);
  const parsed = generateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { reportKey, year, month } = parsed.data;
  if (reportKey === "monthly_risk" && !month) return NextResponse.json({ error: "month_required" }, { status: 400 });
  const locale = await getServerLocale();

  const names: Record<(typeof REPORT_KEYS)[number], { nameZh: string; nameEn: string }> = {
    consolidated_income_statement: { nameZh: `合并利润表 - ${year}年`, nameEn: `Consolidated Income Statement - ${year}` },
    consolidated_balance_sheet: { nameZh: `合并资产负债表 - ${year}年`, nameEn: `Consolidated Balance Sheet - ${year}` },
    consolidated_cash_flow: { nameZh: `合并现金流量表 - ${year}年`, nameEn: `Consolidated Cash Flow Statement - ${year}` },
    ar_aging: { nameZh: `应收账龄分析报告 - ${year}年`, nameEn: `AR Aging Analysis Report - ${year}` },
    monthly_risk: { nameZh: `月度风险预警报告 - ${year}年${month}月`, nameEn: `Monthly Risk Report - ${year}-${String(month).padStart(2, "0")}` },
    audit_report: { nameZh: `内部审计报告 - ${year}年`, nameEn: `Internal Audit Report - ${year}` },
  };

  if (reportKey === "consolidated_income_statement") await computeConsolidatedIncomeStatement(user.organizationId, year, locale);
  else if (reportKey === "consolidated_balance_sheet") await computeConsolidatedBalanceSheet(user.organizationId, year, locale);
  else if (reportKey === "consolidated_cash_flow") await computeConsolidatedCashFlow(user.organizationId, year);
  else if (reportKey === "ar_aging") await computeARAgingReport(user.organizationId, year, locale);
  else if (reportKey === "monthly_risk") await computeMonthlyRiskReport(user.organizationId, year, month!, locale);
  else if (reportKey === "audit_report") await computeAuditReport(user.organizationId, year);
  else return NextResponse.json({ error: "invalid_type" }, { status: 400 });

  const periodMonth = reportKey === "monthly_risk" ? month! : null;
  const period = reportKey === "monthly_risk" ? `${year}-${String(month).padStart(2, "0")}` : String(year);
  const type = reportKey === "ar_aging" || reportKey === "monthly_risk" || reportKey === "audit_report" ? "SPECIAL" : "MANAGEMENT";

  // Manual find-then-create/update rather than a Prisma compound-unique upsert — see the
  // periodMonth comment in schema.prisma for why this table has no single @@unique that could
  // back one.
  const existing = await db.reportDoc.findFirst({ where: { organizationId: user.organizationId, reportKey, periodYear: year, periodMonth } });
  const row = existing
    ? await db.reportDoc.update({ where: { id: existing.id }, data: { generatedAt: new Date(), status: "GENERATED" } })
    : await db.reportDoc.create({
        data: { organizationId: user.organizationId, ...names[reportKey], type, status: "GENERATED", period, generatedAt: new Date(), reportKey, periodYear: year, periodMonth },
      });
  return NextResponse.json({ row });
}
