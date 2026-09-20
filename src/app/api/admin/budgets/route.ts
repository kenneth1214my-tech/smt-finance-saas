import { db } from "@/lib/db";
import { budgetSchema } from "@/lib/validation";
import { listCreateHandlers } from "@/lib/admin/crudHandlers";

export const { GET, POST } = listCreateHandlers(db.budget, budgetSchema, { include: { subsidiary: true }, orderBy: { year: "desc" } });
