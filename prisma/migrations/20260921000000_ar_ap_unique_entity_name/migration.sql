-- One row per (organization, entity, contact name) for ARCustomer/Payable — re-importing or
-- re-adding the same contact should update their balance/aging, never create a duplicate.
-- Two partial indexes per model because Postgres never treats NULL = NULL in a plain unique
-- index (same nullable-subsidiaryId pattern already used elsewhere in this schema).
CREATE UNIQUE INDEX "ARCustomer_org_sub_name_key" ON "ARCustomer"("organizationId", "subsidiaryId", "nameZh") WHERE "subsidiaryId" IS NOT NULL;
CREATE UNIQUE INDEX "ARCustomer_org_name_hq_key" ON "ARCustomer"("organizationId", "nameZh") WHERE "subsidiaryId" IS NULL;

CREATE UNIQUE INDEX "Payable_org_sub_name_key" ON "Payable"("organizationId", "subsidiaryId", "nameZh") WHERE "subsidiaryId" IS NOT NULL;
CREATE UNIQUE INDEX "Payable_org_name_hq_key" ON "Payable"("organizationId", "nameZh") WHERE "subsidiaryId" IS NULL;
