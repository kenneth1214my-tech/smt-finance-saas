import { db } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { corporateTaxProvisionSchema } from "@/lib/validation";
import { listCreateHandlers } from "@/lib/admin/crudHandlers";
import { HK_CORPORATE_RATE_PCT } from "@/lib/jurisdiction";

const handlers = listCreateHandlers(db.corporateTaxProvision, corporateTaxProvisionSchema, {
  include: { subsidiary: true },
  orderBy: { year: "desc" },
});

export const GET = handlers.GET;

// A new row without an explicit rate gets the jurisdiction's standard corporate rate: 17% (Singapore, the schema default)
// or 16.5% (Hong Kong profits tax). Everything else is handled by the shared create handler.
export async function POST(req: Request) {
  const user = await requireUser();
  const org = await db.organization.findUnique({ where: { id: user.organizationId }, select: { jurisdiction: true } });
  const raw = await req.json().catch(() => null);
  if (raw && typeof raw === "object" && org?.jurisdiction === "HK" && (raw.taxRatePct === undefined || raw.taxRatePct === "" || raw.taxRatePct === null)) {
    raw.taxRatePct = HK_CORPORATE_RATE_PCT;
  }
  return handlers.POST(new Request(req.url, { method: "POST", headers: req.headers, body: JSON.stringify(raw) }));
}
