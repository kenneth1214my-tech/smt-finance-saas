import { db } from "@/lib/db";
import { cashFlowMonthlySchema } from "@/lib/validation";
import { listCreateHandlers } from "@/lib/admin/crudHandlers";

export const { GET, POST } = listCreateHandlers(db.cashFlowMonthly, cashFlowMonthlySchema, { orderBy: [{ year: "desc" }, { month: "desc" }] });
