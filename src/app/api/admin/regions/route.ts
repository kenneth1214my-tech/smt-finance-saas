import { db } from "@/lib/db";
import { regionSchema } from "@/lib/validation";
import { listCreateHandlers } from "@/lib/admin/crudHandlers";

export const { GET, POST } = listCreateHandlers(db.region, regionSchema, { orderBy: { sortOrder: "asc" } });
