import { db } from "@/lib/db";
import { taxAdjustmentSchema } from "@/lib/validation";
import { itemHandlers } from "@/lib/admin/crudHandlers";

// provisionId is not editable after creation (it would let a row be re-pointed at another organization's provision).
export const { PUT, DELETE } = itemHandlers(db.taxAdjustment, taxAdjustmentSchema.omit({ provisionId: true }).partial());
