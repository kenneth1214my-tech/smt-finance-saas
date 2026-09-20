import { db } from "@/lib/db";
import { regionMonthlyFinancialSchema } from "@/lib/validation";
import { listCreateHandlers } from "@/lib/admin/crudHandlers";

export const { GET, POST } = listCreateHandlers(db.regionMonthlyFinancial, regionMonthlyFinancialSchema, {
  include: { region: true },
  orderBy: [{ year: "desc" }, { month: "desc" }],
});
