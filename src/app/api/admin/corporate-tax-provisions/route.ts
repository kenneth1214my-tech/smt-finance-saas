import { db } from "@/lib/db";
import { corporateTaxProvisionSchema } from "@/lib/validation";
import { listCreateHandlers } from "@/lib/admin/crudHandlers";

export const { GET, POST } = listCreateHandlers(db.corporateTaxProvision, corporateTaxProvisionSchema, {
  include: { subsidiary: true },
  orderBy: { year: "desc" },
});
