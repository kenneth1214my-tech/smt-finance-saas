import { db } from "@/lib/db";
import { expenseCategoryMappingSchema } from "@/lib/validation";
import { listCreateHandlers } from "@/lib/admin/crudHandlers";

export const { GET, POST } = listCreateHandlers(db.expenseCategoryMapping, expenseCategoryMappingSchema, { orderBy: { accountLabel: "asc" } });
