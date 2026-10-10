import { classifyBankAccount } from "@/lib/bank-classify";
import type { XeroReport } from "@/lib/xero";

// Derived (indirect-method) cash-flow statement — pure maths, no I/O. Xero has no cash-flow report
// an app can read (the Finance API one needs partner certification), so each month's operating /
// investing / financing flows are built from the month-end balance sheets plus the month's P&L net
// profit and depreciation. By the balance-sheet identity the three flows sum exactly to the change
// in cash, so the result is tied out to the real bank movement.
//
// Classification is by ACCOUNT NAME, not Xero's section heading: real charts of accounts put
// furniture and ROU accumulated depreciation under "Current Assets" and loans under "Bank".

type Kind = "cash" | "clearing" | "loan" | "opAsset" | "fixed" | "finAsset" | "opLiab" | "finLiab" | "equity";

const FIXED_RE = /accum|depreciat|\bat cost\b|\bcost\b|renovation|furniture|fitting|equipment|building|property|plant|machinery|vehicle|computer|software|intangible|goodwill|right[\s-]*of[\s-]*use|\brou\b|investment|leasehold|improvement|fixed asset/i;
const FIN_LIAB_RE = /lease liabilit|\bloans?\b|borrowing|hire[\s-]*purchase|debenture|\bbonds?\b|notes? payable|mortgage|overdraft/i;
const INTERCO_RE = /\bdue\s+(to|from)\s+(holding|subsidiar|director|related|group|associate|parent)/i;
const DEPRECIATION_RE = /depreciat|amortis|amortiz/i;

function sectionKind(title: string): "bank" | "asset" | "liability" | "equity" | null {
  if (/^bank$/i.test(title)) return "bank";
  if (/equity/i.test(title)) return "equity";
  if (/liabilit|payable/i.test(title)) return "liability";
  if (/asset|inventory|receivable|prepay/i.test(title)) return "asset";
  return null;
}

function classifyLine(section: "bank" | "asset" | "liability" | "equity", label: string): Kind {
  if (section === "equity") return "equity";
  if (section === "bank") {
    const k = classifyBankAccount(label);
    return k === "cash" ? "cash" : k === "debt" ? "loan" : "clearing";
  }
  if (INTERCO_RE.test(label)) return section === "asset" ? "finAsset" : "finLiab";
  if (section === "asset") return FIXED_RE.test(label) ? "fixed" : "opAsset";
  return FIN_LIAB_RE.test(label) ? "finLiab" : "opLiab";
}

export type MonthBalances = Record<Kind, number>;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// One report with N period columns -> balances per month-end column, keyed "yyyy-m".
export function parseBalanceSheetSeries(report: XeroReport): { byMonth: Map<string, MonthBalances>; warnings: string[] } {
  const rows = report.Rows ?? [];
  const warnings: string[] = [];
  const header = rows.find((r) => r.RowType === "Header");
  const keys: (string | null)[] = (header?.Cells ?? []).slice(1).map((c) => {
    const m = /(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})/.exec(c.Value ?? "");
    if (!m) return null;
    const mi = MONTHS.indexOf(m[2].toLowerCase());
    return mi < 0 ? null : `${m[3]}-${mi + 1}`;
  });
  const blank = (): MonthBalances => ({ cash: 0, clearing: 0, loan: 0, opAsset: 0, fixed: 0, finAsset: 0, opLiab: 0, finLiab: 0, equity: 0 });
  const byMonth = new Map<string, MonthBalances>();
  keys.forEach((k) => k && byMonth.set(k, blank()));

  for (const section of rows) {
    if (section.RowType !== "Section" || !section.Title) continue;
    const kind = sectionKind(section.Title);
    const lines = (section.Rows ?? []).filter((r) => r.RowType === "Row");
    if (!kind) {
      if (lines.length > 0) warnings.push(`Balance sheet section "${section.Title}" was not recognised and is excluded from the derived cash flow`);
      continue;
    }
    for (const line of lines) {
      const label = (line.Cells?.[0]?.Value ?? "").trim();
      const cls = classifyLine(kind, label);
      keys.forEach((k, i) => {
        if (!k) return;
        const v = parseFloat(line.Cells?.[i + 1]?.Value ?? "");
        if (!Number.isNaN(v)) byMonth.get(k)![cls] += v;
      });
    }
  }
  return { byMonth, warnings };
}

export interface PnlMonth {
  netProfit: number;
  depreciation: number;
}
export function depreciationOf(expenseLineItems: { label: string; value: number }[]): number {
  return expenseLineItems.filter((i) => DEPRECIATION_RE.test(i.label)).reduce((a, i) => a + i.value, 0);
}

export interface DerivedFlow {
  ocf: number;
  icf: number;
  fcf: number;
  deltaCash: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100 + 0; // + 0 turns -0 into 0

// Flows for one month from its opening (prev) and closing (cur) balances plus P&L.
export function deriveMonth(prev: MonthBalances, cur: MonthBalances, pnl: PnlMonth): DerivedFlow {
  const d = (k: Kind) => cur[k] - prev[k];
  // NP and depreciation cancel across the three sections (they only decide WHICH section a movement
  // lands in); the sum is always the change in cash by the balance-sheet identity.
  const ocf = pnl.netProfit + pnl.depreciation - d("opAsset") + d("opLiab") - d("clearing");
  const icf = -(d("fixed") + pnl.depreciation);
  // Loan accounts live in Xero's Bank section as negative balances, so a more-negative balance is
  // more debt: financing inflow = -(change in the signed balance).
  const fcf = d("finLiab") - d("loan") - d("finAsset") + (d("equity") - pnl.netProfit);
  return { ocf: r2(ocf), icf: r2(icf), fcf: r2(fcf), deltaCash: r2(d("cash")) };
}
