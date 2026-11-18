// Equity-method schedule for a joint venture (SFRS(I) 1-28 / HKAS 28), the way the FY2025 audited statements apply it: the investment starts
// at cost, moves with the Group's share of the joint venture's result, falls with dividends, and the share of losses stops once the carrying
// amount reaches zero — the excess is tracked and set against later profits before any profit is recognised again. Pure.
//
// Inputs are the yearly figures on JointVenturePeriod; everything else (carrying amount, recognised share, unrecognised losses, and the
// adjustments that take HQ's ledger to the equity-method figures) is worked out here and never stored.

export interface JvPeriodInput {
  year: number;
  capitalAdded: number;
  /** The joint venture's net profit / (loss) for the year, 100% basis. */
  jvNetResult: number;
  /** The joint venture's net assets / (liabilities) at year-end, 100% basis. */
  jvNetAssets: number | null;
  dividendsReceived: number;
  translation: number;
  impairment: number;
  /** HQ's own ledger carrying amount at year-end; null = cost (cumulative capital added). */
  hqLedgerCarrying: number | null;
  /** A charge for the investment HQ already booked in its own P&L. */
  hqLedgerExpense: number;
}

export interface JvYearResult {
  year: number;
  opening: number;
  capitalAdded: number;
  dividendsReceived: number;
  translation: number;
  /** The Group's share of the joint venture's result before the loss cap: pct × jvNetResult. */
  shareOfResult: number;
  /** What is actually recognised (signed): a loss is capped at the carrying amount; a profit first makes good unrecognised losses. */
  recognised: number;
  impairment: number;
  closing: number;
  unrecognisedBroughtForward: number;
  unrecognisedCarriedForward: number;
  /** The Group's share of the joint venture's net assets / (liabilities) at 100% × pct, for the note (null if not given). */
  shareOfNetAssets: number | null;
  cumulativeCost: number;
  /** HQ's ledger carrying amount used (input, or cost). */
  hqLedgerCarrying: number;
  /** Result recognised in the Group P&L for the year: share of result less impairment. */
  groupResult: number;
  /** Closing carrying amount less HQ's ledger carrying amount: what to add to the Group balance sheet. */
  balanceAdjustment: number;
  /** What to add to the Group profit: groupResult, plus any charge HQ already booked, less dividends HQ booked as income. */
  profitAdjustment: number;
  /** The charge for this investment HQ's own ledger already carries in its expenses (input echoed back). */
  hqLedgerExpense: number;
  flags: JvFlag[];
}

export type JvFlag =
  | "carrying-negative" // dividends / translation took the carrying amount below zero
  | "losses-unrecognised" // part of the share of losses was not recognised (cap reached)
  | "net-liabilities" // the joint venture's net assets are negative
  | "ledger-adjusted" // HQ's ledger does not carry the equity-method amount, so the Group statements are adjusted
  | "ledger-matches"; // HQ's own ledger already carries the equity-method result (e.g. audit adjustment journals) — no Group adjustment

const r2 = (n: number) => Math.round(n * 100) / 100 + 0;
const recognisedOrCost = (recognised: number, capitalAdded: number) => recognised !== 0 || capitalAdded !== 0;

export function computeJvRollForward(ownershipPct: number, periods: JvPeriodInput[]): JvYearResult[] {
  const sorted = [...periods].sort((a, b) => a.year - b.year);
  const out: JvYearResult[] = [];
  let prev: JvYearResult | null = null;
  for (const p of sorted) {
    const opening = prev ? prev.closing : 0;
    const bf = prev ? prev.unrecognisedCarriedForward : 0;
    const cumulativeCost = r2((prev ? prev.cumulativeCost : 0) + p.capitalAdded);

    const preResult = r2(opening + p.capitalAdded - p.dividendsReceived + p.translation);
    const shareOfResult = r2((ownershipPct / 100) * p.jvNetResult);

    let recognised: number;
    let unrecognisedCf: number;
    if (shareOfResult < 0) {
      const loss = -shareOfResult;
      const room = Math.max(preResult, 0);
      const taken = Math.min(loss, room);
      recognised = -taken;
      unrecognisedCf = bf + (loss - taken);
    } else {
      const offset = Math.min(shareOfResult, bf);
      recognised = shareOfResult - offset;
      unrecognisedCf = bf - offset;
    }
    recognised = r2(recognised);
    unrecognisedCf = r2(unrecognisedCf);

    const afterShare = r2(preResult + recognised);
    const impairment = r2(Math.min(p.impairment, Math.max(afterShare, 0)));
    const closing = r2(afterShare - impairment);

    const hqLedgerCarrying = p.hqLedgerCarrying ?? cumulativeCost;
    const groupResult = r2(recognised - impairment);
    const flags: JvFlag[] = [];
    if (closing < 0) flags.push("carrying-negative");
    if (unrecognisedCf > bf + 0.005) flags.push("losses-unrecognised");
    if (p.jvNetAssets !== null && p.jvNetAssets < 0) flags.push("net-liabilities");
    const balanceAdjustment = r2(closing - hqLedgerCarrying);
    const profitAdjustment = r2(groupResult + p.hqLedgerExpense - p.dividendsReceived);
    if (Math.abs(balanceAdjustment) > 0.5 || Math.abs(profitAdjustment) > 0.5) flags.push("ledger-adjusted");
    else if (recognisedOrCost(recognised, p.capitalAdded)) flags.push("ledger-matches");

    const result: JvYearResult = {
      year: p.year, opening, capitalAdded: p.capitalAdded, dividendsReceived: p.dividendsReceived, translation: p.translation,
      shareOfResult, recognised, impairment, closing,
      unrecognisedBroughtForward: bf, unrecognisedCarriedForward: unrecognisedCf,
      shareOfNetAssets: p.jvNetAssets === null ? null : r2((ownershipPct / 100) * p.jvNetAssets),
      cumulativeCost, hqLedgerCarrying, groupResult,
      balanceAdjustment,
      profitAdjustment,
      hqLedgerExpense: p.hqLedgerExpense,
      flags,
    };
    out.push(result);
    prev = result;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Input checks: problems in the yearly figures that would silently produce a wrong Group statement.
// ---------------------------------------------------------------------------------------------

export type JvIssueCode =
  | "year-gap" // a financial year is missing between two schedule rows: the missing year's result is not recognised
  | "negative-input" // capital or dividends entered as a negative number
  | "hq-charge-exceeds-schedule" // HQ's ledger carries a bigger charge for the investment than the schedule recognises
  | "ledger-written-down-no-charge" // HQ's ledger is below cost but no HQ charge was entered: the Group profit would double count
  | "ownership-out-of-range";

export interface JvIssue {
  code: JvIssueCode;
  year: number | null;
  /** The figure the message is about, where there is one. */
  amount: number | null;
}

export function validateJvInputs(ownershipPct: number, periods: JvPeriodInput[], results: JvYearResult[]): JvIssue[] {
  const issues: JvIssue[] = [];
  if (!(ownershipPct > 0 && ownershipPct <= 100)) issues.push({ code: "ownership-out-of-range", year: null, amount: ownershipPct });
  const sorted = [...periods].sort((a, b) => a.year - b.year);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].year - sorted[i - 1].year > 1) issues.push({ code: "year-gap", year: sorted[i - 1].year + 1, amount: null });
  }
  for (const p of sorted) {
    if (p.capitalAdded < 0 || p.dividendsReceived < 0 || p.impairment < 0) issues.push({ code: "negative-input", year: p.year, amount: Math.min(p.capitalAdded, p.dividendsReceived, p.impairment) });
  }
  let chargesEntered = 0; // HQ charges entered on this and every earlier year
  for (const r of [...results].sort((x, y) => x.year - y.year)) {
    chargesEntered += r.hqLedgerExpense;
    const written = r.recognised < 0 ? -r.recognised : 0;
    if (r.hqLedgerExpense > written + r.impairment + 0.5) issues.push({ code: "hq-charge-exceeds-schedule", year: r.year, amount: r2(r.hqLedgerExpense - written - r.impairment) });
    // HQ's own ledger holds the investment below cost, yet no charge for it was entered: the schedule would adjust the Group profit by the
    // full loss on top of a charge HQ already booked.
    if (r.hqLedgerCarrying < r.cumulativeCost - 0.5 && chargesEntered <= 0.5 && r.cumulativeCost > 0) {
      issues.push({ code: "ledger-written-down-no-charge", year: r.year, amount: r2(r.cumulativeCost - r.hqLedgerCarrying) });
    }
  }
  return issues;
}
