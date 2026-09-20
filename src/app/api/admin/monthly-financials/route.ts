import { db } from "@/lib/db";
import { monthlyFinancialSchema } from "@/lib/validation";
import { listCreateHandlers } from "@/lib/admin/crudHandlers";

export const { GET, POST } = listCreateHandlers(db.monthlyFinancial, monthlyFinancialSchema, {
  include: { subsidiary: true },
  orderBy: [{ year: "desc" }, { month: "desc" }],
});
