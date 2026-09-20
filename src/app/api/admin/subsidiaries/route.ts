import { db } from "@/lib/db";
import { subsidiarySchema } from "@/lib/validation";
import { listCreateHandlers } from "@/lib/admin/crudHandlers";

export const { GET, POST } = listCreateHandlers(db.subsidiary, subsidiarySchema, { orderBy: { sortOrder: "asc" } });
