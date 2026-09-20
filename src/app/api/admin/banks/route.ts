import { db } from "@/lib/db";
import { bankAccountSchema } from "@/lib/validation";
import { listCreateHandlers } from "@/lib/admin/crudHandlers";

export const { GET, POST } = listCreateHandlers(db.bankAccount, bankAccountSchema, { orderBy: { balance: "desc" } });
