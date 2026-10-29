-- Interest expense per month (EBIT adds back interest only, not bank charges). NULL = not captured yet.
ALTER TABLE "MonthlyFinancial" ADD COLUMN "interestExp" DECIMAL(14,2);
