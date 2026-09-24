import { requireUser, canApprove } from "@/lib/dal";
import { db } from "@/lib/db";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getBaseCurrency, getFyeMonth } from "@/lib/currency";
import { getCompanyName } from "@/lib/company";
import { isXeroConfigured } from "@/lib/xero";
import Topbar from "@/components/Topbar";
import SettingsClient from "@/components/settings/SettingsClient";

// Prisma Decimal / Date instances aren't plain-serializable across the server->client
// boundary; round-trip through JSON so every field becomes a plain string/number.
function toPlain<T>(rows: T): T {
  return JSON.parse(JSON.stringify(rows));
}

export default async function SettingsPage() {
  const user = await requireUser();
  const locale = await getServerLocale();
  const dict = getDictionary(locale);
  const isAdmin = canApprove(user.role);
  const organizationId = user.organizationId;

  const [
    pendingRequests,
    users,
    subsidiaries,
    regions,
    monthlyFinancials,
    regionFinancials,
    budgets,
    banks,
    cashflow,
    arCustomers,
    payables,
    projects,
    risks,
    reports,
    baseCurrency,
    fyeMonth,
    exchangeRates,
    importBatches,
    companyName,
    org,
    xeroConnections,
    xeroGroupConnection,
    expenseCategoryMappings,
  ] = await Promise.all([
    isAdmin ? db.accessRequest.findMany({ where: { status: "PENDING", organizationId }, include: { subsidiary: true }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
    isAdmin ? db.user.findMany({ where: { organizationId }, include: { subsidiary: true }, orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
    db.subsidiary.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" } }),
    isAdmin ? db.region.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" } }) : Promise.resolve([]),
    isAdmin ? db.monthlyFinancial.findMany({ where: { organizationId }, include: { subsidiary: true }, orderBy: [{ year: "desc" }, { month: "desc" }] }) : Promise.resolve([]),
    isAdmin ? db.regionMonthlyFinancial.findMany({ where: { organizationId }, include: { region: true }, orderBy: [{ year: "desc" }, { month: "desc" }] }) : Promise.resolve([]),
    isAdmin ? db.budget.findMany({ where: { organizationId }, include: { subsidiary: true }, orderBy: { year: "desc" } }) : Promise.resolve([]),
    isAdmin ? db.bankAccount.findMany({ where: { organizationId }, include: { subsidiary: true }, orderBy: { balance: "desc" } }) : Promise.resolve([]),
    isAdmin ? db.cashFlowMonthly.findMany({ where: { organizationId }, orderBy: [{ year: "desc" }, { month: "desc" }] }) : Promise.resolve([]),
    isAdmin ? db.aRCustomer.findMany({ where: { organizationId }, include: { subsidiary: true }, orderBy: { balance: "desc" } }) : Promise.resolve([]),
    isAdmin ? db.payable.findMany({ where: { organizationId }, include: { subsidiary: true }, orderBy: { balance: "desc" } }) : Promise.resolve([]),
    isAdmin ? db.project.findMany({ where: { organizationId }, include: { subsidiary: true }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
    isAdmin ? db.riskAlert.findMany({ where: { organizationId }, include: { subsidiary: true }, orderBy: { occurredAt: "desc" } }) : Promise.resolve([]),
    isAdmin ? db.reportDoc.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
    isAdmin ? getBaseCurrency(organizationId) : Promise.resolve("CNY"),
    isAdmin ? getFyeMonth(organizationId) : Promise.resolve(12),
    isAdmin ? db.exchangeRate.findMany({ where: { organizationId }, orderBy: { currency: "asc" } }) : Promise.resolve([]),
    isAdmin ? db.importBatch.findMany({ where: { organizationId }, include: { importedBy: true }, orderBy: { createdAt: "desc" }, take: 10 }) : Promise.resolve([]),
    isAdmin ? getCompanyName(organizationId) : Promise.resolve(""),
    isAdmin ? db.organization.findUniqueOrThrow({ where: { id: organizationId } }) : Promise.resolve(null),
    isAdmin ? db.xeroConnection.findMany({ where: { organizationId } }) : Promise.resolve([]),
    isAdmin ? db.xeroGroupConnection.findUnique({ where: { organizationId } }) : Promise.resolve(null),
    isAdmin ? db.expenseCategoryMapping.findMany({ where: { organizationId }, orderBy: { accountLabel: "asc" } }) : Promise.resolve([]),
  ]);

  return (
    <>
      <Topbar dict={dict} locale={locale} title={dict.nav.settings} user={user} />
      <div className="mx-auto w-full max-w-[1480px] flex-1 px-[26px] py-5">
        <SettingsClient
          dict={dict}
          locale={locale}
          isAdmin={isAdmin}
          currentUserId={user.id}
          currentUserName={user.name}
          currentUserEmail={user.email}
          pendingRequests={toPlain(pendingRequests)}
          users={toPlain(users)}
          subsidiaries={toPlain(subsidiaries)}
          regions={toPlain(regions)}
          monthlyFinancials={toPlain(monthlyFinancials)}
          regionFinancials={toPlain(regionFinancials)}
          budgets={toPlain(budgets)}
          banks={toPlain(banks)}
          cashflow={toPlain(cashflow)}
          arCustomers={toPlain(arCustomers)}
          payables={toPlain(payables)}
          projects={toPlain(projects)}
          risks={toPlain(risks)}
          reports={toPlain(reports)}
          baseCurrency={baseCurrency}
          fyeMonth={fyeMonth}
          exchangeRates={toPlain(exchangeRates)}
          importBatches={toPlain(importBatches)}
          companyName={companyName}
          inviteCode={org?.inviteCode ?? ""}
          hqEquity={org ? Number(org.equity) : 0}
          hqDebtRatio={org ? Number(org.debtRatio) : 0}
          hqInvestmentInSubsidiaries={org ? Number(org.investmentInSubsidiaries) : 0}
          hqDueToSubsidiaries={org ? Number(org.dueToSubsidiaries) : 0}
          hqHeadcount={org?.headcount ?? 0}
          xeroConnections={toPlain(xeroConnections)}
          xeroGroupConnected={Boolean(xeroGroupConnection?.connectedAt)}
          xeroGroupTenantName={xeroGroupConnection?.tenantName ?? null}
          xeroGroupLastSyncAt={xeroGroupConnection?.lastSyncAt ? xeroGroupConnection.lastSyncAt.toISOString() : null}
          xeroGroupLastSyncError={xeroGroupConnection?.lastSyncError ?? null}
          xeroConfigured={isXeroConfigured()}
          expenseCategoryMappings={toPlain(expenseCategoryMappings)}
        />
      </div>
    </>
  );
}
