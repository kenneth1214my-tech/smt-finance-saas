import { db } from "@/lib/db";
import { projectSchema } from "@/lib/validation";
import { listCreateHandlers } from "@/lib/admin/crudHandlers";

export const { GET, POST } = listCreateHandlers(db.project, projectSchema, { include: { subsidiary: true }, orderBy: { createdAt: "desc" } });
