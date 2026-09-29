import { db } from "@/lib/db";
import { taxFilingSchema } from "@/lib/validation";
import { listCreateHandlers } from "@/lib/admin/crudHandlers";

export const { GET, POST } = listCreateHandlers(db.taxFiling, taxFilingSchema, {
  include: { subsidiary: true },
  orderBy: { dueDate: "asc" },
});
