import { NextResponse } from "next/server";
import { requireUser, canApprove } from "@/lib/dal";
import { db } from "@/lib/db";
import { findImportType } from "@/lib/import-types";
import {
  monthlyFinancialSchema,
  regionMonthlyFinancialSchema,
  budgetSchema,
  bankAccountSchema,
  cashFlowMonthlySchema,
  arCustomerSchema,
  payableSchema,
  balanceSheetSchema,
} from "@/lib/validation";

interface FailedRow {
  row: number;
  error: string;
}

// Blank/missing subsidiaryKey means a group/HQ-level row (not tied to any subsidiary) —
// otherwise it must resolve to a real subsidiary in this org.
function resolveSubsidiaryId(subsidiaryKey: string | undefined, subByKey: Map<string, string>): string | null {
  if (!subsidiaryKey) return null;
  const resolved = subByKey.get(subsidiaryKey);
  if (!resolved) throw new Error(`子公司代码不存在: ${subsidiaryKey}`);
  return resolved;
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!canApprove(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const organizationId = user.organizationId;

  const body = await req.json().catch(() => null);
  const type = body?.type;
  const fileName = typeof body?.fileName === "string" ? body.fileName : "import.csv";
  const rows: Record<string, string>[] = Array.isArray(body?.rows) ? body.rows : [];

  const config = findImportType(type);
  if (!config) return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  if (rows.length === 0) return NextResponse.json({ error: "no_rows" }, { status: 400 });

  const [subsidiaries, regions] = await Promise.all([
    db.subsidiary.findMany({ where: { organizationId } }),
    db.region.findMany({ where: { organizationId } }),
  ]);
  const subByKey = new Map(subsidiaries.map((s) => [s.key, s.id]));
  const regionByKey = new Map(regions.map((r) => [r.key, r.id]));

  let successCount = 0;
  const failed: FailedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const rowNum = i + 2; // header is row 1
    try {
      switch (config.id) {
        case "monthlyFinancial": {
          const subsidiaryId = resolveSubsidiaryId(raw.subsidiaryKey, subByKey);
          const parsed = monthlyFinancialSchema.safeParse({ ...raw, subsidiaryId });
          if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "invalid_input");
          const { subsidiaryId: sid, year, month } = parsed.data;
          if (sid) {
            await db.monthlyFinancial.upsert({
              where: { subsidiaryId_year_month: { subsidiaryId: sid, year, month } },
              create: { ...parsed.data, organizationId },
              update: parsed.data,
            });
          } else {
            // No compound-unique constraint covers (organizationId, year, month) WHERE
            // subsidiaryId IS NULL at the Prisma level (only a DB-side partial index), so the
            // HQ upsert is done by hand here instead of via a generated compound-unique upsert.
            const existing = await db.monthlyFinancial.findFirst({ where: { organizationId, subsidiaryId: null, year, month } });
            if (existing) await db.monthlyFinancial.update({ where: { id: existing.id }, data: parsed.data });
            else await db.monthlyFinancial.create({ data: { ...parsed.data, organizationId } });
          }
          break;
        }
        case "regionMonthlyFinancial": {
          const regionId = regionByKey.get(raw.regionKey);
          if (!regionId) throw new Error(`区域代码不存在: ${raw.regionKey}`);
          const parsed = regionMonthlyFinancialSchema.safeParse({ ...raw, regionId });
          if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "invalid_input");
          const { regionId: rid, year, month } = parsed.data;
          await db.regionMonthlyFinancial.upsert({
            where: { regionId_year_month: { regionId: rid, year, month } },
            create: { ...parsed.data, organizationId },
            update: parsed.data,
          });
          break;
        }
        case "budget": {
          const subsidiaryId = resolveSubsidiaryId(raw.subsidiaryKey, subByKey);
          const parsed = budgetSchema.safeParse({ ...raw, subsidiaryId });
          if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "invalid_input");
          const { subsidiaryId: sid, year } = parsed.data;
          if (sid) {
            await db.budget.upsert({
              where: { subsidiaryId_year: { subsidiaryId: sid, year } },
              create: { ...parsed.data, organizationId },
              update: parsed.data,
            });
          } else {
            // No compound-unique constraint covers (organizationId, year) WHERE subsidiaryId IS
            // NULL at the Prisma level (only a DB-side partial index), so the HQ upsert is done
            // by hand here instead of via a generated compound-unique upsert.
            const existing = await db.budget.findFirst({ where: { organizationId, subsidiaryId: null, year } });
            if (existing) await db.budget.update({ where: { id: existing.id }, data: parsed.data });
            else await db.budget.create({ data: { ...parsed.data, organizationId } });
          }
          break;
        }
        case "bankAccount": {
          const subsidiaryId = resolveSubsidiaryId(raw.subsidiaryKey, subByKey);
          const parsed = bankAccountSchema.safeParse({ ...raw, subsidiaryId });
          if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "invalid_input");
          await db.bankAccount.create({ data: { ...parsed.data, organizationId } });
          break;
        }
        case "cashflow": {
          const parsed = cashFlowMonthlySchema.safeParse(raw);
          if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "invalid_input");
          const { year, month } = parsed.data;
          await db.cashFlowMonthly.upsert({
            where: { organizationId_year_month: { organizationId, year, month } },
            create: { ...parsed.data, organizationId },
            update: parsed.data,
          });
          break;
        }
        case "arCustomer": {
          const subsidiaryId = resolveSubsidiaryId(raw.subsidiaryKey, subByKey);
          const parsed = arCustomerSchema.safeParse({ ...raw, subsidiaryId });
          if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "invalid_input");
          await db.aRCustomer.create({ data: { ...parsed.data, organizationId } });
          break;
        }
        case "payable": {
          const subsidiaryId = resolveSubsidiaryId(raw.subsidiaryKey, subByKey);
          const parsed = payableSchema.safeParse({ ...raw, subsidiaryId });
          if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "invalid_input");
          await db.payable.create({ data: { ...parsed.data, organizationId } });
          break;
        }
        case "balanceSheet": {
          const subsidiaryId = resolveSubsidiaryId(raw.subsidiaryKey, subByKey);
          const parsed = balanceSheetSchema.safeParse({ ...raw, subsidiaryId });
          if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "invalid_input");
          const { subsidiaryId: sid, totalAssets, totalLiabilities, totalEquity } = parsed.data;
          const debtRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;
          if (sid) await db.subsidiary.update({ where: { id: sid }, data: { equity: totalEquity, debtRatio } });
          else await db.organization.update({ where: { id: organizationId }, data: { equity: totalEquity, debtRatio } });
          break;
        }
      }
      successCount++;
    } catch (err) {
      failed.push({ row: rowNum, error: err instanceof Error ? err.message : "unknown_error" });
    }
  }

  if (successCount > 0) {
    await db.importBatch.create({ data: { organizationId, fileName, rowCount: successCount, importedById: user.id } });
  }

  return NextResponse.json({ successCount, failedCount: failed.length, failed });
}
