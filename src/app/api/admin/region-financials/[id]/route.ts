import { db } from "@/lib/db";
import { regionMonthlyFinancialSchema } from "@/lib/validation";
import { itemHandlers } from "@/lib/admin/crudHandlers";

export const { PUT, DELETE } = itemHandlers(db.regionMonthlyFinancial, regionMonthlyFinancialSchema.partial());
