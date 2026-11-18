// Run with: npm test   (Node's built-in test runner; no extra dependencies)
// The equity-method schedule is the one piece of the joint-venture feature where a wrong number changes the Group statements, so its
// behaviour is pinned here — first to the FY2025 audited figures, then to the edge cases a later year will hit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeJvRollForward, validateJvInputs, type JvPeriodInput } from "../src/lib/joint-venture.ts";

const P = (o: Partial<JvPeriodInput>): JvPeriodInput => ({
  year: 2025, capitalAdded: 0, jvNetResult: 0, jvNetAssets: null, dividendsReceived: 0, translation: 0, impairment: 0, hqLedgerCarrying: null, hqLedgerExpense: 0, ...o,
});

// FY2025 audited statements of Kingston International College: 50% of Kingston International Training Centre Company Limited.
const FY2025 = P({ capitalAdded: 13657.35, translation: -1396.21, jvNetResult: -32208, jvNetAssets: -6771, hqLedgerCarrying: 0, hqLedgerExpense: 12261.14 });

test("reproduces the audited FY2025 figures", () => {
  const [r] = computeJvRollForward(50, [FY2025]);
  assert.equal(r.shareOfResult, -16104);
  assert.equal(r.recognised, -12261.14); // the audited share of loss, capped at the carrying amount
  assert.equal(r.closing, 0); // investment in joint venture: nil
  assert.equal(r.unrecognisedCarriedForward, 3842.86);
  assert.equal(r.shareOfNetAssets, -3385.5);
});

test("HQ's ledger already carrying the equity-method result means no Group adjustment", () => {
  const [r] = computeJvRollForward(50, [FY2025]);
  assert.equal(r.balanceAdjustment, 0);
  assert.equal(r.profitAdjustment, 0);
  assert.ok(r.flags.includes("ledger-matches"));
});

test("with HQ's ledger at cost the Group is adjusted down to the equity-method amount", () => {
  const [r] = computeJvRollForward(50, [{ ...FY2025, hqLedgerCarrying: 13657.35, hqLedgerExpense: 0 }]);
  assert.equal(r.balanceAdjustment, -13657.35);
  assert.equal(r.profitAdjustment, -12261.14);
  assert.equal(Math.round((r.balanceAdjustment - r.profitAdjustment) * 100) / 100, -1396.21); // the translation goes to the reserve, not profit
});

test("a later profit first makes good the unrecognised losses", () => {
  const r = computeJvRollForward(50, [FY2025, P({ year: 2026, jvNetResult: 10000 })]);
  assert.equal(r[1].unrecognisedBroughtForward, 3842.86);
  assert.equal(r[1].recognised, 1157.14);
  assert.equal(r[1].unrecognisedCarriedForward, 0);
  assert.equal(r[1].closing, 1157.14);
});

test("a further loss at a nil carrying amount recognises nothing", () => {
  const r = computeJvRollForward(50, [FY2025, P({ year: 2026, jvNetResult: -20000 })]);
  assert.equal(r[1].recognised, 0);
  assert.equal(r[1].closing, 0);
  assert.equal(r[1].unrecognisedCarriedForward, 13842.86);
});

test("new capital makes room for losses again", () => {
  const r = computeJvRollForward(50, [FY2025, P({ year: 2026, capitalAdded: 5000, jvNetResult: -20000 })]);
  assert.equal(r[1].recognised, -5000);
  assert.equal(r[1].closing, 0);
  assert.equal(r[1].unrecognisedCarriedForward, 8842.86);
});

test("dividends reduce the carrying amount and are removed from the Group profit", () => {
  const [r] = computeJvRollForward(50, [P({ capitalAdded: 20000, jvNetResult: 8000, dividendsReceived: 1000 })]);
  assert.equal(r.closing, 23000);
  assert.equal(r.profitAdjustment, 3000);
});

test("impairment cannot take the carrying amount below nil", () => {
  const [r] = computeJvRollForward(50, [P({ capitalAdded: 10000, impairment: 99999 })]);
  assert.equal(r.impairment, 10000);
  assert.equal(r.closing, 0);
});

test("carrying amount is never negative even when dividends exceed it", () => {
  const [r] = computeJvRollForward(50, [P({ capitalAdded: 1000, dividendsReceived: 5000 })]);
  assert.ok(r.flags.includes("carrying-negative"));
});

test("years given out of order are worked out in order", () => {
  const r = computeJvRollForward(50, [P({ year: 2026, jvNetResult: 10000 }), FY2025]);
  assert.deepEqual(r.map((x) => x.year), [2025, 2026]);
  assert.equal(r[1].unrecognisedBroughtForward, 3842.86);
});

test("no periods gives no results", () => {
  assert.deepEqual(computeJvRollForward(50, []), []);
});

// ---- input checks
test("a clean FY2025 row raises no issue", () => {
  const rows = [FY2025];
  assert.deepEqual(validateJvInputs(50, rows, computeJvRollForward(50, rows)), []);
});

test("a missing year between rows is reported", () => {
  const rows = [FY2025, P({ year: 2027, jvNetResult: 1000 })];
  const issues = validateJvInputs(50, rows, computeJvRollForward(50, rows));
  assert.ok(issues.some((i) => i.code === "year-gap" && i.year === 2026));
});

test("HQ's ledger written down with no HQ charge entered is reported (the double-count trap)", () => {
  const rows = [{ ...FY2025, hqLedgerExpense: 0 }];
  const issues = validateJvInputs(50, rows, computeJvRollForward(50, rows));
  assert.ok(issues.some((i) => i.code === "ledger-written-down-no-charge"));
});

test("a charge entered in an earlier year is not reported again in a later year", () => {
  const rows = [FY2025, P({ year: 2026, hqLedgerCarrying: 0, jvNetResult: 0 })];
  const issues = validateJvInputs(50, rows, computeJvRollForward(50, rows));
  assert.equal(issues.filter((i) => i.code === "ledger-written-down-no-charge").length, 0);
});

test("an HQ charge larger than the schedule recognises is reported", () => {
  const rows = [{ ...FY2025, hqLedgerExpense: 20000 }];
  const issues = validateJvInputs(50, rows, computeJvRollForward(50, rows));
  assert.ok(issues.some((i) => i.code === "hq-charge-exceeds-schedule"));
});

test("negative capital and out-of-range ownership are reported", () => {
  const rows = [P({ capitalAdded: -5 })];
  const codes = validateJvInputs(150, rows, computeJvRollForward(150, rows)).map((i) => i.code);
  assert.ok(codes.includes("negative-input"));
  assert.ok(codes.includes("ownership-out-of-range"));
});
