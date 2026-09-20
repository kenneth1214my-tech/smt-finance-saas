import { db } from "@/lib/db";
import { regionSchema } from "@/lib/validation";
import { itemHandlers } from "@/lib/admin/crudHandlers";

export const { PUT, DELETE } = itemHandlers(db.region, regionSchema.partial());
