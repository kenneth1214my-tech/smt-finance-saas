import { db } from "@/lib/db";
import { budgetSchema } from "@/lib/validation";
import { itemHandlers } from "@/lib/admin/crudHandlers";

export const { PUT, DELETE } = itemHandlers(db.budget, budgetSchema.partial());
