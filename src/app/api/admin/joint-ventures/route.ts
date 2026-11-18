import { db } from "@/lib/db";
import { jointVentureSchema } from "@/lib/validation";
import { listCreateHandlers } from "@/lib/admin/crudHandlers";

export const { GET, POST } = listCreateHandlers(db.jointVenture, jointVentureSchema, { orderBy: { createdAt: "asc" } });
