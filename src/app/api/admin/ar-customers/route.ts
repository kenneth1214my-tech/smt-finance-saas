import { db } from "@/lib/db";
import { arCustomerSchema } from "@/lib/validation";
import { listCreateHandlers } from "@/lib/admin/crudHandlers";

export const { GET, POST } = listCreateHandlers(db.aRCustomer, arCustomerSchema, { include: { subsidiary: true }, orderBy: { balance: "desc" } });
