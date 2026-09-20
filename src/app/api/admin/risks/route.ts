import { db } from "@/lib/db";
import { riskAlertSchema } from "@/lib/validation";
import { listCreateHandlers } from "@/lib/admin/crudHandlers";

export const { GET, POST } = listCreateHandlers(db.riskAlert, riskAlertSchema, { include: { subsidiary: true }, orderBy: { occurredAt: "desc" } });
