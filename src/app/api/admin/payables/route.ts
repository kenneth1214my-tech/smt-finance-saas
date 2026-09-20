import { db } from "@/lib/db";
import { payableSchema } from "@/lib/validation";
import { listCreateHandlers } from "@/lib/admin/crudHandlers";

export const { GET, POST } = listCreateHandlers(db.payable, payableSchema, { include: { subsidiary: true }, orderBy: { balance: "desc" } });
