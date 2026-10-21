import { NextResponse } from "next/server";
import { requireUser, canApprove } from "@/lib/dal";
import { db } from "@/lib/db";
import { jurisdictionSettingsSchema } from "@/lib/validation";
import { isFrameworkAllowed, getJurisdictionConfig } from "@/lib/jurisdiction";

// The organization's country edition (Singapore / Hong Kong), accounting framework, incorporation date and registration
// number. Changing the edition switches the Tax Center, filing calendar and statutory-report wording; existing tax
// records are kept, and the base currency is NOT touched (it has its own setting).
export async function PUT(req: Request) {
  const user = await requireUser();
  if (!canApprove(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const raw = await req.json().catch(() => null);
  const parsed = jurisdictionSettingsSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { jurisdiction, accountingFramework, incorporationDate, registrationNo } = parsed.data;
  const cfg = getJurisdictionConfig(jurisdiction);
  const framework = accountingFramework && isFrameworkAllowed(cfg.code, accountingFramework) ? accountingFramework : cfg.defaultFramework;
  const row = await db.organization.update({
    where: { id: user.organizationId },
    data: { jurisdiction: cfg.code, accountingFramework: framework, incorporationDate, registrationNo },
  });
  return NextResponse.json({ jurisdiction: row.jurisdiction, accountingFramework: row.accountingFramework });
}
