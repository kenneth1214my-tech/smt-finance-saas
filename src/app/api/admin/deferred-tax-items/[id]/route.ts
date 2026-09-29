import { db } from "@/lib/db";
import { deferredTaxItemSchema } from "@/lib/validation";
import { itemHandlers } from "@/lib/admin/crudHandlers";

export const { PUT, DELETE } = itemHandlers(db.deferredTaxItem, deferredTaxItemSchema.partial());
