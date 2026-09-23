// A real P&L export's "Expenses"/"Operating Expenses" section is a flat list of arbitrary
// line-item labels (Salaries, Depreciation, Bank Charges, ...) — there's no reliable way to
// guess which of MonthlyFinancial's 4 named categories (Selling/Admin/R&D/Finance) each one
// belongs to from the label alone, since a real chart of accounts varies org to org. Getting
// this wrong would misrepresent real numbers, so it's never guessed except for the narrow
// exception below. Instead an admin classifies each real label once (ExpenseCategoryMapping),
// and every future Smart P&L Import or Xero sync reuses that mapping automatically.
export type ExpenseCategory = "SELLING" | "ADMIN" | "RND" | "FINANCE";

export interface ExpenseLineItem {
  label: string;
  value: number;
}

export interface CategorizedExpenses {
  sellExp: number;
  adminExp: number;
  rndExp: number;
  financeExp: number;
  // Line items with no mapping entry and no safe auto-suggestion — excluded from the 4 totals
  // above rather than dumped into a guessed bucket. The UI surfaces these for the admin to
  // classify; once mapped, they're included from the next import/sync onward.
  unmapped: ExpenseLineItem[];
}

// Terms that mean the same real-world thing regardless of whose chart of accounts they're in —
// unlike "Salaries" or "Travel and Marketing Fee" (genuinely ambiguous between Admin/Selling),
// "interest" and "bank charges/fees" are unambiguously finance costs everywhere. This is the one
// safe place to auto-classify rather than requiring a manual mapping.
const FINANCE_KEYWORDS = /\binterest\b|\bbank\s*(charges?|fees?)\b/i;

export function suggestCategory(label: string): ExpenseCategory | null {
  return FINANCE_KEYWORDS.test(label) ? "FINANCE" : null;
}

export function applyCategoryMapping(lineItems: ExpenseLineItem[], mapping: Record<string, ExpenseCategory>): CategorizedExpenses {
  const result: CategorizedExpenses = { sellExp: 0, adminExp: 0, rndExp: 0, financeExp: 0, unmapped: [] };
  for (const item of lineItems) {
    const category = mapping[item.label] ?? suggestCategory(item.label);
    if (!category) {
      result.unmapped.push(item);
      continue;
    }
    if (category === "SELLING") result.sellExp += item.value;
    else if (category === "ADMIN") result.adminExp += item.value;
    else if (category === "RND") result.rndExp += item.value;
    else result.financeExp += item.value;
  }
  return result;
}
