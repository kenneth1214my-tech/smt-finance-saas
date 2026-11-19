import "server-only";
import { db } from "@/lib/db";
import { plAccountFn, type PlAccountFn, type PlLineRow } from "@/lib/pl-accounts";

/**
 * The Xero P&L accounts behind the P&L KPIs for exactly the months the page is summing (`rows` are the monthly P&L rows the KPI tiles use).
 * Returns a function that finds nothing until the next Xero sync has stored the account lines; never throws, so a missing table only means
 * "no drill-down".
 */
export async function loadPlAccountFn(organizationId: string, entities: { id: string | null }[], rows: { subsidiaryId: string | null; year: number; month: number }[], isZh: boolean): Promise<PlAccountFn> {
  const none: PlAccountFn = () => undefined;
  try {
    const seen = new Set<string>();
    const wanted = rows.filter((r) => {
      const key = `${r.subsidiaryId ?? "HQ"}|${r.year}|${r.month}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (wanted.length === 0) return none;
    const stored = await db.accountBalanceMonthly.findMany({
      where: { organizationId, group: { startsWith: "PL_" }, OR: wanted.map((r) => ({ subsidiaryId: r.subsidiaryId, year: r.year, month: r.month })) },
    });
    if (stored.length === 0) return none;
    const lines: PlLineRow[] = stored.map((s) => ({ subsidiaryId: s.subsidiaryId, group: s.group, section: s.section, accountName: s.accountName, balance: Number(s.balance) }));
    return plAccountFn(entities, lines, entities.length > 1, isZh);
  } catch {
    return none;
  }
}
