import { db } from "@/lib/db";
import { exchangeRateSchema } from "@/lib/validation";
import { itemHandlers } from "@/lib/admin/crudHandlers";

export const { PUT, DELETE } = itemHandlers(db.exchangeRate, exchangeRateSchema.partial());
