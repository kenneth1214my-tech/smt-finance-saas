// Singapore GST F5 breakdown — pure classification/aggregation of Xero invoice, bill and credit-note
// lines into IRAS GST F5 boxes. No I/O. It is an ESTIMATE built from Xero tax codes, not a certified
// return: the by-tax-code table and the per-document list exist so a human can double-check every
// number against Xero's own GST report before filing.

// Where a document comes from in Xero. The F5 must cover everything that carries GST in the ledger, not only the invoices and
// bills: spend/receive-money transactions, manual journals (ledger adjustments) and expense claims all carry input / output tax.
export type GstDocKind = "Invoice" | "CreditNote" | "BankTransaction" | "ManualJournal" | "ExpenseClaim";

/** The five places GST can be recorded; each one is reported as included, unavailable (missing Xero permission) or failed. */
export type GstSourceKey = "invoices" | "credit_notes" | "bank" | "manual_journals" | "expense_claims";
export const GST_SOURCE_LABEL: Record<GstSourceKey, { en: string; zh: string }> = {
  invoices: { en: "Sales invoices & purchase bills", zh: "销售发票与采购账单" },
  credit_notes: { en: "Credit notes", zh: "贷项通知单" },
  bank: { en: "Spend / receive money (bank transactions)", zh: "收付款（银行交易）" },
  manual_journals: { en: "Manual journals (ledger adjustments)", zh: "手工日记账（账务调整）" },
  expense_claims: { en: "Expense claims (staff purchase claims)", zh: "费用报销（员工采购报销）" },
};
export function gstSourceOf(kind: GstDocKind): GstSourceKey {
  return kind === "Invoice" ? "invoices" : kind === "CreditNote" ? "credit_notes" : kind === "BankTransaction" ? "bank" : kind === "ManualJournal" ? "manual_journals" : "expense_claims";
}
export interface GstCoverageItem {
  source: GstSourceKey;
  status: "included" | "missing_scope" | "error" | "truncated";
  message?: string;
}
export type GstDirection = "SALES" | "PURCHASE";

export interface GstRawLine {
  taxType: string;
  lineAmount: number;
  taxAmount: number;
}

export interface GstRawDoc {
  kind: GstDocKind;
  direction: GstDirection;
  number: string;
  contact: string;
  date: string; // ISO date (yyyy-mm-dd)
  status: string;
  currency: string;
  currencyRate: number; // foreign units per 1 base unit; 1 for base currency
  lineAmountTypes: string; // Exclusive | Inclusive | NoTax
  lines: GstRawLine[];
}

export type GstClass =
  | "SR" // standard-rated supply            -> Box 1
  | "ZR" // zero-rated supply                -> Box 2
  | "ES" // exempt supply                    -> Box 3
  | "TX" // standard-rated purchase, GST claimable -> Box 5 + 7
  | "ZP" // zero-rated purchase              -> Box 5
  | "BDR" // bad debt relief (tax code BADDEBTRELIEF*) -> Box 11, and included in Box 7; NOT a Box 1/6 reduction
  | "BL" // blocked / non-claimable input tax -> excluded
  | "OUT" // out of scope / exempt purchase / no GST -> excluded
  | "UNK"; // 0% tax with a code this module doesn't recognise -> flagged, excluded

export const GST_CLASS_LABEL: Record<GstClass, { en: string; zh: string }> = {
  SR: { en: "Standard-rated supplies (Box 1)", zh: "标准税率销售 (Box 1)" },
  ZR: { en: "Zero-rated supplies (Box 2)", zh: "零税率销售 (Box 2)" },
  ES: { en: "Exempt supplies (Box 3)", zh: "豁免销售 (Box 3)" },
  TX: { en: "Taxable purchases, GST claimed (Box 5 & 7)", zh: "应税采购，进项税可抵扣 (Box 5 & 7)" },
  ZP: { en: "Zero-rated purchases (Box 5)", zh: "零税率采购 (Box 5)" },
  BDR: { en: "Bad debt relief (Box 11, included in Box 7)", zh: "坏账减免 (Box 11，并计入 Box 7)" },
  BL: { en: "Blocked / non-claimable input tax (excluded)", zh: "不可抵扣进项税 (不计入)" },
  OUT: { en: "Out of scope / exempt purchase (excluded)", zh: "不在范围 / 豁免采购 (不计入)" },
  UNK: { en: "UNCLASSIFIED 0% code — check manually (excluded)", zh: "未识别的0%税码 — 请人工核对 (不计入)" },
};

// Xero tax-type codes vary by org and era — seen in production: OUTPUTY24, INPUTY24, BADDEBTRELIEFY24
// and NONE; Xero's Singapore templates also use short codes (SR, ZR, ES33, OS, TX, ZP, EP, BL …).
// So: lines carrying real tax are classified by direction (and bad-debt-relief / blocked codes are
// pulled out first); 0%-tax lines fall back to matching the code by prefix or keyword. A code this
// doesn't recognise is never guessed into a box — it lands in UNK so it shows up as a warning, and
// the by-tax-code table in the UI exists so a human can see exactly how each code was treated.
export function classifyGstLine(direction: GstDirection, taxType: string, taxAmount: number): GstClass {
  const code = (taxType || "").toUpperCase().trim();
  if (code.startsWith("BADDEBTRELIEF")) return "BDR";
  const zero = code.startsWith("ZR") || code.startsWith("ZP") || code.includes("ZERO");
  const exempt = code.startsWith("ES") || code.startsWith("EP") || code.includes("EXEMPT");
  const outOfScope = code === "" || code === "NONE" || code.startsWith("OS") || code.startsWith("OP") || code.startsWith("NP") || code.startsWith("ME") || code.includes("OUTOFSCOPE") || code.includes("NOTAX");
  if (direction === "SALES") {
    if (taxAmount !== 0) return "SR";
    if (zero) return "ZR";
    if (exempt) return "ES";
    return outOfScope ? "OUT" : "UNK";
  }
  if (code.startsWith("BL") || code.includes("BLOCK")) return "BL";
  if (taxAmount !== 0) return "TX";
  if (zero) return "ZP";
  return exempt || outOfScope ? "OUT" : "UNK";
}

export interface GstTaxTypeRow {
  direction: GstDirection;
  taxType: string;
  cls: GstClass;
  net: number;
  tax: number;
  lines: number;
}

export interface GstDocumentRow {
  kind: GstDocKind;
  direction: GstDirection;
  number: string;
  contact: string;
  date: string;
  status: string;
  currency: string;
  net: number;
  tax: number;
  taxTypes: string;
}

export interface GstBoxRow {
  box: string;
  en: string;
  zh: string;
  value: number | null; // null = not computed by this estimate
}

export interface GstSourceRow {
  source: GstSourceKey;
  documents: number;
  purchasesNet: number;
  inputTax: number; // tax on purchase lines (what Box 7 draws on)
  salesNet: number;
  outputTax: number;
}

export interface GstBreakdown {
  /** Per Xero source: how many documents, and how much input / output tax each contributed. */
  sources: GstSourceRow[];
  coverage: GstCoverageItem[];
  boxes: GstBoxRow[];
  taxTypes: GstTaxTypeRow[];
  documents: GstDocumentRow[];
  warnings: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildGstBreakdown(docs: GstRawDoc[], coverage: GstCoverageItem[] = [], opts: { periodRevenue?: number | null } = {}): GstBreakdown {
  // Sales-side credit notes coded "No Tax" / out of scope: they reduce supplies but land in no box, so they are tracked to be flagged.
  const noTaxCredit = { net: 0, lines: 0 };
  const bySource = new Map<GstSourceKey, GstSourceRow>();
  const byType = new Map<string, GstTaxTypeRow>();
  const documents: GstDocumentRow[] = [];
  const totals: Record<GstClass, { net: number; tax: number }> = {
    SR: { net: 0, tax: 0 }, ZR: { net: 0, tax: 0 }, ES: { net: 0, tax: 0 }, TX: { net: 0, tax: 0 },
    ZP: { net: 0, tax: 0 }, BDR: { net: 0, tax: 0 }, BL: { net: 0, tax: 0 }, OUT: { net: 0, tax: 0 }, UNK: { net: 0, tax: 0 },
  };

  for (const doc of docs) {
    // Credit notes reverse the original supply/purchase, so they subtract.
    const sign = doc.kind === "CreditNote" ? -1 : 1;
    const rate = doc.currencyRate > 0 ? doc.currencyRate : 1;
    let docNet = 0;
    let docTax = 0;
    const docTypes = new Set<string>();
    const srcKey = gstSourceOf(doc.kind);
    const srcRow = bySource.get(srcKey) ?? { source: srcKey, documents: 0, purchasesNet: 0, inputTax: 0, salesNet: 0, outputTax: 0 };
    srcRow.documents += 1;
    bySource.set(srcKey, srcRow);
    for (const line of doc.lines) {
      const tax = (sign * line.taxAmount) / rate;
      const gross = line.lineAmount;
      const netForeign = doc.lineAmountTypes === "Inclusive" ? gross - line.taxAmount : gross;
      const net = (sign * netForeign) / rate;
      const cls = classifyGstLine(doc.direction, line.taxType, line.taxAmount);
      totals[cls].net += net;
      totals[cls].tax += tax;
      if (doc.direction === "SALES" && doc.kind === "CreditNote" && cls === "OUT") {
        noTaxCredit.net += net;
        noTaxCredit.lines += 1;
      }
      if (doc.direction === "PURCHASE") {
        srcRow.purchasesNet += net;
        srcRow.inputTax += tax;
      } else {
        srcRow.salesNet += net;
        srcRow.outputTax += tax;
      }
      const key = `${doc.direction}|${line.taxType || "(none)"}|${cls}`;
      const row = byType.get(key) ?? { direction: doc.direction, taxType: line.taxType || "(none)", cls, net: 0, tax: 0, lines: 0 };
      row.net += net;
      row.tax += tax;
      row.lines += 1;
      byType.set(key, row);
      docNet += net;
      docTax += tax;
      docTypes.add(line.taxType || "(none)");
    }
    documents.push({
      kind: doc.kind, direction: doc.direction, number: doc.number, contact: doc.contact, date: doc.date,
      status: doc.status, currency: doc.currency, net: round2(docNet), tax: round2(docTax), taxTypes: [...docTypes].join(", "),
    });
  }

  const box1 = totals.SR.net;
  const box2 = totals.ZR.net;
  const box3 = totals.ES.net;
  const box4 = box1 + box2 + box3;
  const box5 = totals.TX.net + totals.ZP.net;
  const box6 = totals.SR.tax;
  // Bad-debt-relief credit notes carry negative sign here (credit note), so relief claimed = -tax.
  const box11 = -totals.BDR.tax;
  const box7 = totals.TX.tax + box11;
  const boxes: GstBoxRow[] = [
    { box: "1", en: "Total value of standard-rated supplies", zh: "标准税率销售总额", value: round2(box1) },
    { box: "2", en: "Total value of zero-rated supplies", zh: "零税率销售总额", value: round2(box2) },
    { box: "3", en: "Total value of exempt supplies", zh: "豁免销售总额", value: round2(box3) },
    { box: "4", en: "Total value of (1) + (2) + (3)", zh: "(1)+(2)+(3) 合计", value: round2(box4) },
    { box: "5", en: "Total value of taxable purchases", zh: "应税采购总额", value: round2(box5) },
    { box: "6", en: "Output tax due", zh: "应缴销项税", value: round2(box6) },
    { box: "7", en: "Input tax and refunds claimed", zh: "可抵扣进项税", value: round2(box7) },
    { box: "8", en: "Net GST to be paid to / claimed from IRAS (6 − 7)", zh: "应缴 / 应退 GST 净额 (6 − 7)", value: round2(box6 - box7) },
    { box: "9", en: "Goods imported under a GST suspension scheme (MES / A-GRS / ...)", zh: "暂缓GST计划下进口货物价值", value: null },
    { box: "10", en: "Tourist refund claimed", zh: "游客退税", value: null },
    { box: "11", en: "Bad debt relief claimed (also included in Box 7)", zh: "坏账减免 (已计入 Box 7)", value: round2(box11) },
    { box: "12", en: "Pre-registration input tax claimed", zh: "注册前进项税", value: null },
    typeof opts.periodRevenue === "number"
      ? { box: "13", en: "Revenue for the accounting period (profit & loss revenue for the quarter)", zh: "会计期间营业收入（本季度利润表营业收入）", value: round2(opts.periodRevenue) }
      : { box: "13", en: "Revenue for the accounting period (approximated by Box 4 — no profit & loss for this quarter on file)", zh: "会计期间营业收入 (以 Box 4 近似——本季度暂无利润表数据)", value: round2(box4) },
    { box: "14-15", en: "Reverse charge / overseas vendor registration (OVR) items", zh: "反向征税 / 海外供应商注册项目", value: null },
  ];

  const warnings: string[] = [];
  if (totals.UNK.net !== 0 || [...byType.values()].some((r) => r.cls === "UNK")) {
    const codes = [...new Set([...byType.values()].filter((r) => r.cls === "UNK").map((r) => `${r.taxType} (${r.direction === "SALES" ? "sales" : "purchases"})`))];
    warnings.push(`Tax codes with 0% tax this estimate could not classify (excluded from every box): ${codes.join(", ")} — check them against Xero's GST report.`);
  }
  if (totals.BL.tax !== 0) warnings.push(`Blocked / non-claimable input tax of ${round2(totals.BL.tax)} was excluded from Box 7.`);
  if (noTaxCredit.lines > 0) {
    warnings.push(
      `${noTaxCredit.lines} sales credit-note line(s) coded "No Tax" total ${round2(noTaxCredit.net)}: they reduce supplies but fall in no GST box. If they cancel zero-rated supplies already reported in Box 2, Box 2 should be ${round2(totals.ZR.net + noTaxCredit.net)} instead of ${round2(totals.ZR.net)} (Box 4 ${round2(box4 + noTaxCredit.net)}) — a tax decision to confirm; Boxes 1 and 6 are not affected.`,
    );
  }
  for (const c of coverage) {
    const label = GST_SOURCE_LABEL[c.source].en;
    if (c.status === "missing_scope") warnings.push(`NOT INCLUDED — ${label}: this Xero connection has no permission to read them, so any GST on them is missing from Boxes 5–7. Reconnect Xero with full GST access to include them.`);
    else if (c.status === "error") warnings.push(`NOT INCLUDED — ${label}: Xero returned an error (${c.message ?? "unknown"}), so any GST on them is missing from Boxes 5–7. Try again.`);
    else if (c.status === "truncated") warnings.push(`PARTLY INCLUDED — ${label}: ${c.message ?? "the scan stopped early to stay within Xero's call limits"}.`);
  }
  warnings.push("Boxes 9, 10, 12 and 14–15 (suspension-scheme imports, tourist refund, pre-registration claims, reverse charge / OVR) are not derived from Xero and must be checked/entered manually if applicable. Box 11 only covers documents coded BADDEBTRELIEF*.");
  warnings.push("Basis: document date (accrual). Invoices / bills / credit notes: AUTHORISED + PAID only; bank transactions: AUTHORISED spend / receive money (prepayments and overpayments are left out because their GST is counted again when allocated to the bill / invoice); manual journals: POSTED; expense claims: from the ledger journals. Drafts, voided and deleted are excluded; credit notes netted; foreign currency converted with each document's Xero rate.");

  const taxTypes = [...byType.values()]
    .map((r) => ({ ...r, net: round2(r.net), tax: round2(r.tax) }))
    .sort((a, b) => a.direction.localeCompare(b.direction) || a.taxType.localeCompare(b.taxType));
  documents.sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));

  const sources = [...bySource.values()].map((r) => ({ ...r, purchasesNet: round2(r.purchasesNet), inputTax: round2(r.inputTax), salesNet: round2(r.salesNet), outputTax: round2(r.outputTax) }));
  return { sources, coverage, boxes, taxTypes, documents, warnings };
}
