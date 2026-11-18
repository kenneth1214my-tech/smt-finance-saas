import { db } from "@/lib/db";
import { jointVenturePeriodSchema } from "@/lib/validation";
import { listCreateHandlers } from "@/lib/admin/crudHandlers";

export const { GET, POST } = listCreateHandlers(db.jointVenturePeriod, jointVenturePeriodSchema, { orderBy: [{ year: "desc" }] });
