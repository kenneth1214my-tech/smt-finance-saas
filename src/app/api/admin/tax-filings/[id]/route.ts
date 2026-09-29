import { db } from "@/lib/db";
import { taxFilingSchema } from "@/lib/validation";
import { itemHandlers } from "@/lib/admin/crudHandlers";

export const { PUT, DELETE } = itemHandlers(db.taxFiling, taxFilingSchema.partial());
