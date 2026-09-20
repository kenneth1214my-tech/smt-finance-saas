import { db } from "@/lib/db";
import { arCustomerSchema } from "@/lib/validation";
import { itemHandlers } from "@/lib/admin/crudHandlers";

export const { PUT, DELETE } = itemHandlers(db.aRCustomer, arCustomerSchema.partial());
