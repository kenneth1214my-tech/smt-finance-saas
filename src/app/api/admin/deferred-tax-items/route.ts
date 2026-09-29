import { db } from "@/lib/db";
import { deferredTaxItemSchema } from "@/lib/validation";
import { listCreateHandlers } from "@/lib/admin/crudHandlers";

export const { GET, POST } = listCreateHandlers(db.deferredTaxItem, deferredTaxItemSchema, {
  include: { subsidiary: true },
  orderBy: { year: "desc" },
});
