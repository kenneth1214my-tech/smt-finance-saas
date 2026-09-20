import { db } from "@/lib/db";
import { monthlyFinancialSchema } from "@/lib/validation";
import { itemHandlers } from "@/lib/admin/crudHandlers";

export const { PUT, DELETE } = itemHandlers(db.monthlyFinancial, monthlyFinancialSchema.partial());
