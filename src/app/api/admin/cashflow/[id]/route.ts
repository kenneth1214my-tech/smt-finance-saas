import { db } from "@/lib/db";
import { cashFlowMonthlySchema } from "@/lib/validation";
import { itemHandlers } from "@/lib/admin/crudHandlers";

export const { PUT, DELETE } = itemHandlers(db.cashFlowMonthly, cashFlowMonthlySchema.partial());
