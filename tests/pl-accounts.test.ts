// Run with: npm test
// The Xero profit-and-loss account lines kept for the KPI drill-down: the parser keeps every line, and the helper groups them per KPI so each
// figure re-adds from its accounts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXeroPnl } from "../src/lib/xero-pnl-parser.ts";
import { plAccountFn, type PlLineRow } from "../src/lib/pl-accounts.ts";

const c = (v: string | number) => ({ Value: String(v) });
const row = (label: string, v: number) => ({ RowType: "Row", Cells: [c(label), c(v)] });
const summary = (v: number) => ({ RowType: "SummaryRow", Cells: [c("Total"), c(v)] });
// A Xero-shaped monthly profit and loss.
const report = { Rows: [
  { RowType: "Section", Title: "Income", Rows: [row("Course fee", 100000), row("Registration fee", 5000), summary(105000)] },
  { RowType: "Section", Title: "Less Cost of Sales", Rows: [row("Lecturer fees", 30000), row("Depreciation - classroom", 2000), summary(32000)] },
  { RowType: "Section", Title: "Operating Expenses", Rows: [row("Salaries", 40000), row("Advertising", 6000), row("Interest on bank loan", 1500), row("Bank charges", 200), row("Depreciation - equipment", 800), summary(48500)] },
  { RowType: "Section", Title: "Other Income", Rows: [row("Government grant", 3000), summary(3000)] },
  { RowType: "Row", Cells: [c("Net Profit"), c(27500)] },
] } as never;

test("the parser keeps every account line with its kind", () => {
  const r = parseXeroPnl(report);
  const kinds = (k: string) => r.lines.filter((l) => l.kind === k).map((l) => l.label);
  assert.deepEqual(kinds("revenue"), ["Course fee", "Registration fee"]);
  assert.deepEqual(kinds("cost"), ["Lecturer fees", "Depreciation - classroom"]);
  assert.deepEqual(kinds("expense"), ["Salaries", "Advertising", "Interest on bank loan", "Bank charges", "Depreciation - equipment"]);
  assert.deepEqual(kinds("other"), ["Government grant"]);
  assert.ok(!r.lines.some((l) => /net profit/i.test(l.label)), "the Net Profit total is not an account line");
});

test("the kept lines add up to the totals the sync stores", () => {
  const r = parseXeroPnl(report);
  const sum = (k: string) => r.lines.filter((l) => l.kind === k).reduce((s, l) => s + l.value, 0);
  assert.equal(sum("revenue"), r.revenue);
  assert.equal(sum("cost"), r.costOfSales);
  assert.equal(sum("revenue") + sum("other") - sum("cost") - sum("expense"), r.netProfit);
});

const lines: PlLineRow[] = [
  { subsidiaryId: null, group: "PL_revenue", section: "", accountName: "Course fee", balance: 100000 },
  { subsidiaryId: "kic", group: "PL_revenue", section: "", accountName: "Course fee", balance: 50000 },
  { subsidiaryId: null, group: "PL_cost", section: "", accountName: "Lecturer fees", balance: 30000 },
  { subsidiaryId: null, group: "PL_cost", section: "", accountName: "Depreciation - classroom", balance: 2000 },
  { subsidiaryId: null, group: "PL_expense", section: "ADMIN", accountName: "Salaries", balance: 40000 },
  { subsidiaryId: null, group: "PL_expense", section: "SELLING", accountName: "Advertising", balance: 6000 },
  { subsidiaryId: null, group: "PL_expense", section: "FINANCE", accountName: "Interest on bank loan", balance: 1500 },
  { subsidiaryId: null, group: "PL_expense", section: "FINANCE", accountName: "Bank charges", balance: 200 },
  { subsidiaryId: null, group: "PL_expense", section: "UNMAPPED", accountName: "Depreciation - equipment", balance: 800 },
  { subsidiaryId: null, group: "PL_other", section: "", accountName: "Government grant", balance: 3000 },
];
const fn = plAccountFn([{ id: null }, { id: "kic" }], lines, true, false);

test("revenue lists each account per entity with a group total column", () => {
  const a = fn("revenue")!;
  assert.deepEqual(a.map((x) => [x.name, x.values]), [["Course fee", [100000, 50000, 150000]]]);
});

test("expense categories use the stored category", () => {
  assert.deepEqual(fn("admin")!.map((x) => x.name), ["Salaries"]);
  assert.deepEqual(fn("sell")!.map((x) => x.name), ["Advertising"]);
  assert.deepEqual(fn("fin")!.map((x) => x.name).sort(), ["Bank charges", "Interest on bank loan"]);
  assert.equal(fn("rnd"), undefined);
});

test("interest and depreciation are found by account name, in expenses and in cost of sales", () => {
  assert.deepEqual(fn("interest")!.map((x) => x.name), ["Interest on bank loan"]);
  assert.deepEqual(fn("dna")!.map((x) => x.name).sort(), ["Depreciation - classroom", "Depreciation - equipment"]);
});

test("employment cost picks the payroll accounts only", () => {
  assert.deepEqual(fn("employment")!.map((x) => x.name), ["Salaries"]);
});

test("an uncategorised expense is flagged, not hidden", () => {
  const dna = fn("dna")!.find((x) => x.name === "Depreciation - equipment")!;
  assert.ok(dna.note && /categorised/i.test(dna.note));
});

test("net profit lists every line with its sign and re-adds to the profit", () => {
  const net = fn("net")!;
  const total = Math.round(net.reduce((s, a) => s + (a.values[a.values.length - 1] ?? 0), 0) * 100) / 100;
  // revenue 150000 + other 3000 − cost 32000 − expenses 48500
  assert.equal(total, 72500);
  assert.ok(net.every((a) => a.note));
});

test("a kind with no stored lines returns nothing, so no drill-down is shown", () => {
  assert.equal(plAccountFn([{ id: null }], [], false, false)("revenue"), undefined);
});

// ---- direction of each line in net profit, worked out from the report's own totals
const report2 = { Rows: [
  { RowType: "Section", Title: "Income", Rows: [row("Course fee", 100000), summary(100000)] },
  { RowType: "Section", Title: "Less Cost of Sales", Rows: [row("Lecturer fees", 30000), summary(30000)] },
  { RowType: "Row", Cells: [c("Gross Profit"), c(70000)] },
  { RowType: "Section", Title: "Less Operating Expenses", Rows: [row("Salaries", 40000), row("Office Rental (87000)", 6088), summary(46088)] },
  { RowType: "Section", Title: "Non-operating Income", Rows: [row("Miscellaneous Income", 10000), summary(10000)] },
  { RowType: "Section", Title: "Taxation", Rows: [row("Taxation", -2000), summary(-2000)] },
  { RowType: "Row", Cells: [c("Net Profit"), c(35912)] },
] } as never;

test("a section whose heading is not 'Other Income' still counts the right way, solved from the net profit", () => {
  const r = parseXeroPnl(report2);
  const sign = (label: string) => r.lines.find((l) => l.label === label)!.sign;
  assert.equal(sign("Course fee"), 1);
  assert.equal(sign("Lecturer fees"), -1);
  assert.equal(sign("Salaries"), -1);
  assert.equal(sign("Miscellaneous Income"), 1); // income-type section under another heading
  assert.equal(sign("Taxation"), -1); // a negative taxation line (a credit) therefore adds 2,000 to profit
});

test("the signed lines add up to the report's net profit, and the subtotal rows are not accounts", () => {
  const r = parseXeroPnl(report2);
  assert.ok(!r.lines.some((l) => /gross profit/i.test(l.label)));
  const net = r.lines.reduce((s, l) => s + l.sign * l.value, 0);
  assert.equal(net, r.netProfit);
});

test("a stored sign decides the net profit list; rows stored before it was kept fall back to the heading and name", () => {
  const stored: PlLineRow[] = [
    { subsidiaryId: null, group: "PL_revenue", section: "|+|Income", accountName: "Course fee", balance: 100 },
    { subsidiaryId: null, group: "PL_expense", section: "UNMAPPED|+|Non-operating Income", accountName: "Office Rental (87000)", balance: 10 },
    { subsidiaryId: null, group: "PL_expense", section: "ADMIN|-|Less Operating Expenses", accountName: "Salaries", balance: 40 },
    { subsidiaryId: null, group: "PL_expense", section: "UNMAPPED", accountName: "Miscellaneous Income", balance: 5 }, // old format: name decides
    { subsidiaryId: null, group: "PL_expense", section: "UNMAPPED", accountName: "Gross Profit", balance: 999 }, // old stored subtotal: ignored
  ];
  const net = plAccountFn([{ id: null }], stored, false, false)("net")!;
  assert.equal(net.reduce((s, a) => s + (a.values[0] ?? 0), 0), 100 + 10 - 40 + 5);
});

test("the expense category is still read from the first part of the stored section", () => {
  const stored: PlLineRow[] = [{ subsidiaryId: null, group: "PL_expense", section: "ADMIN|-|Less Operating Expenses", accountName: "Salaries", balance: 40 }];
  assert.deepEqual(plAccountFn([{ id: null }], stored, false, false)("admin")!.map((a) => a.name), ["Salaries"]);
});

test("an income line is labelled as income, not as an uncategorised expense", () => {
  const stored: PlLineRow[] = [
    { subsidiaryId: null, group: "PL_expense", section: "INCOME|+|Plus Other Income", accountName: "Miscellaneous Income", balance: 5 },
    { subsidiaryId: null, group: "PL_expense", section: "UNMAPPED|-|Less Operating Expenses", accountName: "Depreciation", balance: 3 },
  ];
  const fn = plAccountFn([{ id: null }], stored, false, false);
  const dna = fn("dna")!;
  assert.ok(/not categorised/i.test(dna[0].note ?? ""));
  assert.equal(fn("net")!.reduce((s, a) => s + (a.values[0] ?? 0), 0), 5 - 3);
});
