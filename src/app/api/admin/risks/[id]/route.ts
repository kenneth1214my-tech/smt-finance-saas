import { db } from "@/lib/db";
import { riskAlertSchema } from "@/lib/validation";
import { itemHandlers } from "@/lib/admin/crudHandlers";

export const { PUT, DELETE } = itemHandlers(db.riskAlert, riskAlertSchema.partial());
