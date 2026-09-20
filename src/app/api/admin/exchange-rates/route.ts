import { db } from "@/lib/db";
import { exchangeRateSchema } from "@/lib/validation";
import { listCreateHandlers } from "@/lib/admin/crudHandlers";

export const { GET, POST } = listCreateHandlers(db.exchangeRate, exchangeRateSchema, { orderBy: { currency: "asc" } });
