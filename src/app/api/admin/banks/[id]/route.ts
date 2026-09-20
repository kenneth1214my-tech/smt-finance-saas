import { db } from "@/lib/db";
import { bankAccountSchema } from "@/lib/validation";
import { itemHandlers } from "@/lib/admin/crudHandlers";

export const { PUT, DELETE } = itemHandlers(db.bankAccount, bankAccountSchema.partial());
