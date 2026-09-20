import "server-only";
import { db } from "@/lib/db";

export { CURRENCY_OPTIONS } from "@/lib/currency-options";

export async function getBaseCurrency(organizationId: string): Promise<string> {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  return org.baseCurrency;
}

export async function setBaseCurrency(organizationId: string, currency: string) {
  return db.organization.update({ where: { id: organizationId }, data: { baseCurrency: currency } });
}

export async function getFyeMonth(organizationId: string): Promise<number> {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  return org.fyeMonth;
}

export async function setFyeMonth(organizationId: string, fyeMonth: number) {
  return db.organization.update({ where: { id: organizationId }, data: { fyeMonth } });
}

export async function getExchangeRates(organizationId: string): Promise<Record<string, number>> {
  const rows = await db.exchangeRate.findMany({ where: { organizationId } });
  const map: Record<string, number> = {};
  for (const r of rows) map[r.currency] = Number(r.rateToBase);
  return map;
}

/**
 * Converts `amount` (in `currency`) into the base currency, given a currency->rate map
 * (1 unit of `currency` = rate units of base). Returns null when the currency isn't the
 * base and no rate has been entered yet — callers should surface that instead of guessing.
 */
export function convertToBase(amount: number, currency: string, baseCurrency: string, rates: Record<string, number>): number | null {
  if (currency === baseCurrency) return amount;
  const rate = rates[currency];
  if (rate === undefined) return null;
  return amount * rate;
}
