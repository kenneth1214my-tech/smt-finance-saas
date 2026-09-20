-- Current headcount snapshot per entity (a company-profile fact, distinct from
-- MonthlyFinancial.headcount which is a per-month historical value for the Revenue per
-- Employee trend). Visible/editable in Subsidiary master data and Group Settings.
ALTER TABLE "Subsidiary" ADD COLUMN "headcount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Organization" ADD COLUMN "headcount" INTEGER NOT NULL DEFAULT 0;
