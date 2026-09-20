import { db } from "@/lib/db";
import { reportDocSchema } from "@/lib/validation";
import { itemHandlers } from "@/lib/admin/crudHandlers";

export const { PUT, DELETE } = itemHandlers(db.reportDoc, reportDocSchema.partial());
