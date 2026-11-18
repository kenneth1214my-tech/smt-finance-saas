// Run with: npm test
// The deferred revenue / prepayment / accrual checks, the draft correcting journals and the Excel / CSV shapes built from them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runLedgerChecks, type LedgerAccountSeries, type LedgerEntityInput } from "../src/lib/ledger-audit.ts";
import { buildCorrections } from "../src/lib/ledger-corrections.ts";
import { buildLedgerSheets, rowsToCsv } from "../src/lib/ledger-export.ts";

const months = ["2026-1", "2026-2", "2026-3", "2026-4", "2026-5", "2026-6", "2026-7", "2026-8", "2026-9"];
const series = (vals: number[]) => Object.fromEntries(months.map((k, i) => [k, vals[i]]));
const flat = (v: number) => Object.fromEntries(months.map((k) => [k, v]));
const entity = (accounts: LedgerAccountSeries[], over: Partial<LedgerEntityInput> = {}): LedgerEntityInput => ({
  id: null, label: "HQ", accounts, revenue: flat(100000), opex: flat(90000), opLiabilities: flat(1_000_000), opAssets: flat(1_000_000), ...over,
});
const acct = (group: LedgerAccountSeries["group"], name: string, section: "asset" | "liability", vals: number[]): LedgerAccountSeries => ({ group, name, section, balances: series(vals) });
const status = (res: ReturnType<typeof runLedgerChecks>, group: string, id: string) => res[0].groups.find((g) => g.group === group)?.checks.find((c) => c.id === id)?.status ?? "MISSING";
const run = (a: LedgerAccountSeries, over: Partial<LedgerEntityInput> = {}) => runLedgerChecks([entity([a], over)], false);

test("healthy books raise no warning or failure", () => {
  const res = runLedgerChecks([entity([
    acct("DEFERRED_REVENUE", "Deferred Income", "liability", [400000, 420000, 380000, 410000, 430000, 400000, 390000, 420000, 410000]),
    acct("PREPAYMENT", "Prepayments", "asset", [50000, 48000, 52000, 47000, 50000, 49000, 51000, 48000, 50000]),
    acct("ACCRUAL", "Accruals", "liability", [20000, 5000, 25000, 8000, 22000, 6000, 24000, 7000, 21000]),
  ])], false);
  const all = res[0].groups.flatMap((g) => g.checks.map((c) => c.status));
  assert.equal(all.filter((s) => s === "warn" || s === "fail").length, 0);
  assert.ok(all.filter((s) => s === "pass").length >= 6);
});

test("wrong-side balance fails", () => {
  assert.equal(status(run(acct("DEFERRED_REVENUE", "DI", "liability", [400000, 420000, 380000, 410000, 430000, 400000, 390000, 420000, -5000])), "DEFERRED_REVENUE", "sign"), "fail");
});
test("frozen deferred revenue warns", () => {
  assert.equal(status(run(acct("DEFERRED_REVENUE", "DI", "liability", Array(9).fill(400000))), "DEFERRED_REVENUE", "release"), "warn");
});
test("deferred revenue above a year of revenue warns", () => {
  assert.equal(status(run(acct("DEFERRED_REVENUE", "DI", "liability", [2e6, 2e6, 2e6, 2e6, 2e6, 2e6, 2e6, 2.1e6, 2.2e6])), "DEFERRED_REVENUE", "size"), "warn");
});
test("prepayment that only grows warns", () => {
  assert.equal(status(run(acct("PREPAYMENT", "PP", "asset", [10000, 12000, 14000, 16000, 18000, 20000, 22000, 24000, 26000])), "PREPAYMENT", "grow-only"), "warn");
});
test("accrual that never reverses warns", () => {
  assert.equal(status(run(acct("ACCRUAL", "AC", "liability", [50000, 50000, 52000, 50000, 51000, 50000, 50000, 52000, 51000])), "ACCRUAL", "reverse"), "warn");
});
test("accounts larger than the balance-sheet total fail the tie-out", () => {
  assert.equal(status(run(acct("ACCRUAL", "AC", "liability", Array(9).fill(2e6))), "ACCRUAL", "tie"), "fail");
});
test("no accounts gives an information note, never a pass", () => {
  const res = runLedgerChecks([entity([])], true);
  assert.ok(res[0].groups.every((g) => g.checks.length === 1 && g.checks[0].status === "info"));
});

test("the monthly breakdown rolls forward correctly", () => {
  const ks: string[] = [];
  for (let y = 2025; y <= 2026; y++) for (let m = 1; m <= 12; m++) ks.push(`${y}-${m}`);
  const upto = ks.slice(0, 21);
  const rec = (f: (i: number) => number) => Object.fromEntries(upto.map((k, i) => [k, f(i)]));
  const res = runLedgerChecks([{ id: null, label: "HQ",
    accounts: [
      { group: "DEFERRED_REVENUE", name: "A", section: "liability", balances: rec((i) => 1000 * (i + 1)) },
      { group: "DEFERRED_REVENUE", name: "B", section: "liability", balances: rec(() => 500) },
    ],
    revenue: rec(() => 10000), opex: rec(() => 8000), opLiabilities: rec(() => 100000), opAssets: rec(() => 100000) }], false);
  const g = res[0].groups[0];
  assert.equal(g.detail.length, 12);
  const last = g.detail[11];
  assert.deepEqual(last.balances, [21000, 500]);
  assert.equal(last.total, 21500);
  assert.equal(last.movement, 1000);
  assert.equal(last.shareOfBs, 21.5);
  assert.equal(last.months, 2.15);
});

// ---- draft correcting journals and exports
const stuck = () => runLedgerChecks([{ id: null, label: "Group HQ",
  accounts: [
    { group: "ACCRUAL", name: "Accrual", section: "liability", balances: series([20000, 20000, 20000, 20000, 20000, 20000, 20000, -32868.62, -32868.62]) },
    { group: "ACCRUAL", name: "Accrued Salary", section: "liability", balances: flat(50000) },
  ],
  revenue: flat(240000), opex: flat(300000), opLiabilities: flat(2e6), opAssets: flat(2e6) }], false);

test("a wrong-side accrual gets a balanced draft journal for the absolute balance", () => {
  const d = buildCorrections(stuck(), false, "2026-11-04");
  const s = d.find((x) => x.trigger === "sign");
  assert.ok(s);
  assert.equal(s!.amount, 32868.62);
  assert.equal(s!.primary.lines.reduce((a, l) => a + l.debit - l.credit, 0), 0);
  assert.ok(s!.primary.lines[0].pick); // the P&L account is left for a person to choose
  assert.ok(s!.alternative);
});

test("healthy accounts produce no draft", () => {
  assert.equal(buildCorrections(runLedgerChecks([entity([acct("DEFERRED_REVENUE", "DI", "liability", [400000, 420000, 380000, 410000, 430000, 400000, 390000, 420000, 410000])])], false), false, "2026-11-04").length, 0);
});

test("the Xero journal file balances, uses dd/mm/yyyy and debit-positive signs", () => {
  const res = stuck();
  const sheets = buildLedgerSheets(res, buildCorrections(res, false, "2026-11-04"), false);
  const xj = sheets["xero-journal"];
  const net: Record<string, number> = {};
  for (const r of xj) net[String(r["*Narration"])] = Math.round(((net[String(r["*Narration"])] ?? 0) + Number(r["*Amount"])) * 100) / 100;
  assert.ok(Object.values(net).every((v) => v === 0));
  assert.equal(xj[0]["*Date"], "04/11/2026");
  assert.equal(xj[0]["*Amount"], 32868.62);
  assert.equal(xj[1]["*Amount"], -32868.62);
});

test("the CSV starts with a byte-order mark so Excel reads Chinese text", () => {
  const res = stuck();
  const csv = rowsToCsv(buildLedgerSheets(res, [], false).checks);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.split("\r\n").length > 2);
});

test("an empty sheet still downloads with its header row, and the headers match the rows", async () => {
  const { ledgerHeaders } = await import("../src/lib/ledger-export.ts");
  for (const zh of [false, true]) {
    const heads = ledgerHeaders(zh);
    assert.ok(rowsToCsv([], heads.corrections).length > 10);
    const res = stuck();
    const sheets = buildLedgerSheets(res, buildCorrections(res, zh, "2026-11-04"), zh);
    for (const key of ["checks", "breakdown", "corrections", "xero-journal"] as const) {
      assert.deepEqual(Object.keys(sheets[key][0]), heads[key], `${key} headers (zh=${zh})`);
    }
  }
});
