import { db } from "@/lib/db";
import { reportDocSchema } from "@/lib/validation";
import { listCreateHandlers } from "@/lib/admin/crudHandlers";

export const { GET, POST } = listCreateHandlers(db.reportDoc, reportDocSchema, { orderBy: { createdAt: "desc" } });
