import { db } from "@/lib/db";
import { subsidiaryBaseSchema } from "@/lib/validation";
import { itemHandlers } from "@/lib/admin/crudHandlers";

export const { PUT, DELETE } = itemHandlers(db.subsidiary, subsidiaryBaseSchema.partial());
