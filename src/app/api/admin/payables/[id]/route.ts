import { db } from "@/lib/db";
import { payableSchema } from "@/lib/validation";
import { itemHandlers } from "@/lib/admin/crudHandlers";

export const { PUT, DELETE } = itemHandlers(db.payable, payableSchema.partial());
