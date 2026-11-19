// The Xero profit-and-loss accounts behind a P&L-based KPI. Pure: takes the stored account lines (AccountBalanceMonthly rows whose group starts
// with "PL_") and returns, per kind of figure, each account with its amount per entity (plus the group total), ready for the breakdown tables.
//
// Stored groups: PL_revenue, PL_cost (cost of sales), PL_expense (operating expenses; `section` holds the expense category SELLING / ADMIN /
// RND / FINANCE, or UNMAPPED when no mapping exists yet), PL_other (other income). Amounts are as Xero prints them, summed over the months of
// the period.

export type PlKind = "net" | "revenue" | "cost" | "sell" | "admin" | "rnd" | "fin" | "interest" | "dna" | "employment";

export interface PlLineRow {
  subsidiaryId: string | null;
  group: string;
  section: string;
  accountName: string;
  balance: number;
}

export interface PlAccount {
  name: string;
  values: (number | null)[];
  note?: string;
}

export type PlAccountFn = (kind: PlKind) => PlAccount[] | undefined;

// Same patterns the sync uses to pick these accounts out of the P&L (xero-pnl-parser.ts / cashflow-derive.ts) — kept identical on purpose.
const DEPRECIATION_RE = /depreciat|amortis|amortiz/i;
const INTEREST_RE = /\binterest\b|finance\s+(costs?|charges?)|borrowing\s+costs?/i;
const EMPLOYMENT_RE = /salar|wage|payroll|\bcpf\b|\bsdl\b|skills development|bonus|remunerat|director'?s?\s*fee|\bstaff\b|employee|worker levy|\bfwl\b|overtime|\bepf\b|\bsocso\b|\bperkeso\b|\bbpjs\b|\bmpf\b|provident fund/i;

const r2 = (n: number) => Math.round(n * 100) / 100 + 0;
const SUBTOTAL_RE = /^(gross\s+(profit|loss)|operating\s+(profit|loss)|net\s+(profit|loss|income)|profit\s+before\s+tax|total\b.*|.*\bsubtotal\b.*)$/i;
// A stored section is "CATEGORY|sign|heading" (newer rows) or just the category (rows stored before the sign was kept).
const categoryOf = (section: string) => section.split("|")[0];
const signOfSection = (section: string): 1 | -1 | null => {
  const p = section.split("|");
  return p.length >= 3 ? (p[1] === "+" ? 1 : p[1] === "-" ? -1 : null) : null;
};
const titleOf = (section: string) => (section.split("|").length >= 3 ? section.split("|").slice(2).join("|") : "");
/** Does this line ADD to profit? Revenue and other income do; costs and expenses do not. Xero's own heading decides, the account name only when there is none. */
const addsToProfit = (l: PlLineRow): boolean => {
  const stored = signOfSection(l.section);
  if (stored !== null) return stored > 0; // worked out from Xero's own totals when the line was stored
  if (l.group === "PL_revenue" || l.group === "PL_other") return true;
  if (l.group === "PL_cost") return false;
  const text = titleOf(l.section) || l.accountName;
  return /income|revenue|sales|gain|grant|credit scheme|wage credit|job credit/i.test(text) && !/expense|cost|loss/i.test(text);
};

export function plAccountFn(entities: { id: string | null }[], allLines: PlLineRow[], multi: boolean, isZh: boolean): PlAccountFn {
  const t = (zh: string, en: string) => (isZh ? zh : en);
  const lines = allLines.filter((l) => !SUBTOTAL_RE.test(l.accountName));
  const pick: Record<PlKind, (l: PlLineRow) => boolean> = {
    net: () => true, // every line, signed (see below)
    revenue: (l) => l.group === "PL_revenue",
    cost: (l) => l.group === "PL_cost",
    sell: (l) => l.group === "PL_expense" && categoryOf(l.section) === "SELLING",
    admin: (l) => l.group === "PL_expense" && categoryOf(l.section) === "ADMIN",
    rnd: (l) => l.group === "PL_expense" && categoryOf(l.section) === "RND",
    fin: (l) => l.group === "PL_expense" && categoryOf(l.section) === "FINANCE",
    interest: (l) => (l.group === "PL_expense" || l.group === "PL_cost") && INTEREST_RE.test(l.accountName),
    dna: (l) => (l.group === "PL_expense" || l.group === "PL_cost") && DEPRECIATION_RE.test(l.accountName),
    employment: (l) => l.group === "PL_expense" && EMPLOYMENT_RE.test(l.accountName),
  };
  const groupLabel = (g: string) => (g === "PL_revenue" ? t("收入", "Revenue") : g === "PL_cost" ? t("销售成本", "Cost of sales") : g === "PL_other" ? t("其他收入", "Other income") : t("费用", "Expense"));
  return (kind) => {
    const chosen = lines.filter(pick[kind]);
    if (chosen.length === 0) return undefined;
    if (kind === "net") {
      // Net profit = revenue + other income − cost of sales − expenses: every line, with the sign it has in the profit.
      const sign = (l: PlLineRow) => (addsToProfit(l) ? 1 : -1);
      const byKey = new Map<string, PlLineRow[]>();
      for (const l of chosen) byKey.set(l.group + "|" + l.accountName, [...(byKey.get(l.group + "|" + l.accountName) ?? []), l]);
      return [...byKey.entries()]
        .map(([key, rows]) => {
          const per = entities.map((e) => r2(rows.filter((r) => r.subsidiaryId === e.id).reduce((s, r) => s + r.balance, 0) * sign(rows[0])));
          const total = r2(per.reduce((s, v) => s + v, 0));
          return { name: rows[0].accountName, values: multi ? [...per, total] : per, note: groupLabel(rows[0].group) };
        })
        .sort((a, b) => Math.abs(b.values[b.values.length - 1] ?? 0) - Math.abs(a.values[a.values.length - 1] ?? 0));
    }
    const byName = new Map<string, PlLineRow[]>();
    for (const l of chosen) byName.set(l.accountName, [...(byName.get(l.accountName) ?? []), l]);
    return [...byName.entries()]
      .map(([name, rows]) => {
        const per = entities.map((e) => r2(rows.filter((r) => r.subsidiaryId === e.id).reduce((s, r) => s + r.balance, 0)));
        const total = r2(per.reduce((s, v) => s + v, 0));
        const section = rows[0].group === "PL_expense" ? categoryOf(rows[0].section) : "";
        return {
          name,
          values: multi ? [...per, total] : per,
          note: section === "UNMAPPED" ? t("尚未归类（未计入销售/管理/研发/财务）", "Not categorised yet (left out of selling / admin / R&D / finance)") : undefined,
        };
      })
      .sort((a, b) => Math.abs(b.values[b.values.length - 1] ?? 0) - Math.abs(a.values[a.values.length - 1] ?? 0));
  };
}
