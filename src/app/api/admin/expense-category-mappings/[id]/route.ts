import { db } from "@/lib/db";
import { expenseCategoryMappingSchema } from "@/lib/validation";
import { itemHandlers } from "@/lib/admin/crudHandlers";

export const { PUT, DELETE } = itemHandlers(db.expenseCategoryMapping, expenseCategoryMappingSchema.partial());
