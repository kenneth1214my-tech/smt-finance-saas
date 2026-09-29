import { db } from "@/lib/db";
import { corporateTaxProvisionSchema } from "@/lib/validation";
import { itemHandlers } from "@/lib/admin/crudHandlers";

export const { PUT, DELETE } = itemHandlers(db.corporateTaxProvision, corporateTaxProvisionSchema.partial());
