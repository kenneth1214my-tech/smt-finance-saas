import { db } from "@/lib/db";
import { jointVenturePeriodSchema } from "@/lib/validation";
import { itemHandlers } from "@/lib/admin/crudHandlers";

export const { PUT, DELETE } = itemHandlers(db.jointVenturePeriod, jointVenturePeriodSchema.partial());
