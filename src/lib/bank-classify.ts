// Xero's Bank Summary lists every account of type "bank" — which in practice includes loan and
// clearing accounts people set up as bank-type accounts (e.g. "Commercial Property Term Loan-Non
// Current" at -1.2M, "DBS Bridging Loan", "Contra Account"). Summing all of them as "cash" turned a
// healthy ~420k cash position into -509k. Classify by name: only "cash" counts toward cash balance.
// Debt accounts are real money owed (shown as borrowings); clearing accounts aren't real money.
export type BankKind = "cash" | "debt" | "clearing";

export function classifyBankAccount(name: string): BankKind {
  const n = (name || "").toLowerCase();
  if (/\bcontra\b|clearing|suspense/.test(n)) return "clearing";
  if (/loan|mortgage|overdraft|borrowing|credit\s*card|\bfacility\b|financing/.test(n)) return "debt";
  return "cash";
}

// Two accounts for the same entity whose names reduce to the same thing are very likely one real
// account recorded twice (a manual/imported row plus the Xero-synced one under a slightly
// different name — the sync matches on exact name, so it never replaces the older row).
export function normalizeBankName(name: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\buob\b/g, "united overseas bank")
    .replace(/[-–]\s*\d[\d\s-]*$/g, " ")
    .replace(/\d{4,}/g, " ")
    .replace(/\bbank\b|\bpte\b|\bltd\b|\blimited\b|[^a-z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
