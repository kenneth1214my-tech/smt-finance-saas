import { db } from "@/lib/db";
import { projectSchema } from "@/lib/validation";
import { itemHandlers } from "@/lib/admin/crudHandlers";

export const { PUT, DELETE } = itemHandlers(db.project, projectSchema.partial());
