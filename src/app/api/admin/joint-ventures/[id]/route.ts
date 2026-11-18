import { db } from "@/lib/db";
import { jointVentureSchema } from "@/lib/validation";
import { itemHandlers } from "@/lib/admin/crudHandlers";

export const { PUT, DELETE } = itemHandlers(db.jointVenture, jointVentureSchema.partial());
