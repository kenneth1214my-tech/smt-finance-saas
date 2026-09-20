// Client-safe metadata describing what CSV import supports — used by both the admin upload UI
// (to build the type picker, template download, and header validation) and the API route (to
// know which columns to expect). No DB/server-only imports here.
//
// A `subsidiaryKey` column's own header must be present when `required: true` (see the API
// route's header check), but individual cell VALUES in that column may be left blank — a blank
// cell means the row is a group/HQ-level entry, not tied to any subsidiary. This is the manual
// fallback for anything Xero would otherwise sync, so it has to be able to represent HQ too.

export type ImportTypeId = "monthlyFinancial" | "regionMonthlyFinancial" | "budget" | "bankAccount" | "cashflow" | "arCustomer" | "payable" | "balanceSheet";

export interface ImportColumn {
  key: string;
  required: boolean;
  example: string;
}

export interface ImportTypeConfig {
  id: ImportTypeId;
  labelZh: string;
  labelEn: string;
  columns: ImportColumn[];
}

export const IMPORT_TYPES: ImportTypeConfig[] = [
  {
    id: "monthlyFinancial",
    labelZh: "子公司月度财务",
    labelEn: "Subsidiary Monthly Financials",
    columns: [
      { key: "subsidiaryKey", required: true, example: "mfg (留空 = 集团总部 / blank = Group HQ)" },
      { key: "year", required: true, example: "2026" },
      { key: "month", required: true, example: "1" },
      { key: "revenue", required: true, example: "1200.5" },
      { key: "netProfit", required: true, example: "150.2" },
      { key: "grossMarginPct", required: true, example: "22.5" },
      { key: "opCost", required: true, example: "900.3" },
      { key: "sellExp", required: false, example: "80.5" },
      { key: "adminExp", required: false, example: "50.2" },
      { key: "rndExp", required: false, example: "30.1" },
      { key: "financeExp", required: false, example: "15.0" },
      { key: "headcount", required: false, example: "42" },
    ],
  },
  {
    id: "regionMonthlyFinancial",
    labelZh: "区域月度财务",
    labelEn: "Region Monthly Financials",
    columns: [
      { key: "regionKey", required: true, example: "east" },
      { key: "year", required: true, example: "2026" },
      { key: "month", required: true, example: "1" },
      { key: "revenue", required: true, example: "800.0" },
      { key: "netProfit", required: true, example: "90.0" },
    ],
  },
  {
    id: "budget",
    labelZh: "年度预算",
    labelEn: "Annual Budget",
    columns: [
      { key: "subsidiaryKey", required: true, example: "mfg (留空 = 集团总部 / blank = Group HQ)" },
      { key: "year", required: true, example: "2026" },
      { key: "revenueBudget", required: true, example: "15000" },
      { key: "costBudgetRate", required: true, example: "85.0" },
      { key: "expenseBudgetRate", required: true, example: "90.0" },
    ],
  },
  {
    id: "bankAccount",
    labelZh: "银行账户",
    labelEn: "Bank Accounts",
    columns: [
      { key: "bankZh", required: true, example: "中国银行" },
      { key: "bankEn", required: true, example: "Bank of China" },
      { key: "acctType", required: true, example: "main" },
      { key: "balance", required: true, example: "500.0" },
      { key: "currency", required: false, example: "CNY" },
      { key: "subsidiaryKey", required: false, example: "mfg (留空 = 集团总部 / blank = Group HQ)" },
    ],
  },
  {
    id: "cashflow",
    labelZh: "月度现金流",
    labelEn: "Monthly Cash Flow",
    columns: [
      { key: "year", required: true, example: "2026" },
      { key: "month", required: true, example: "1" },
      { key: "ocf", required: true, example: "120.0" },
      { key: "icf", required: true, example: "-30.0" },
      { key: "fcf", required: true, example: "-10.0" },
    ],
  },
  {
    id: "arCustomer",
    labelZh: "应收账款客户",
    labelEn: "AR Customers",
    columns: [
      { key: "nameZh", required: true, example: "客户A" },
      { key: "nameEn", required: true, example: "Customer A" },
      { key: "subsidiaryKey", required: true, example: "mfg (留空 = 集团总部 / blank = Group HQ)" },
      { key: "balance", required: true, example: "300.0" },
      { key: "agingDays", required: true, example: "45" },
      { key: "status", required: true, example: "GOOD" },
    ],
  },
  {
    id: "payable",
    labelZh: "应付账款供应商",
    labelEn: "AP Vendors",
    columns: [
      { key: "nameZh", required: true, example: "供应商A" },
      { key: "nameEn", required: true, example: "Vendor A" },
      { key: "subsidiaryKey", required: true, example: "mfg (留空 = 集团总部 / blank = Group HQ)" },
      { key: "balance", required: true, example: "200.0" },
      { key: "agingDays", required: true, example: "30" },
      { key: "status", required: true, example: "GOOD" },
    ],
  },
  {
    id: "balanceSheet",
    labelZh: "资产负债表",
    labelEn: "Balance Sheet",
    columns: [
      { key: "subsidiaryKey", required: false, example: "mfg (留空 = 集团总部 / blank = Group HQ)" },
      { key: "totalAssets", required: true, example: "50000" },
      { key: "totalLiabilities", required: true, example: "20000" },
      { key: "totalEquity", required: true, example: "30000" },
    ],
  },
];

export function findImportType(id: string): ImportTypeConfig | undefined {
  return IMPORT_TYPES.find((t) => t.id === id);
}

// The API only ever needs to know the base ImportTypeId (see /api/admin/import — it branches on
// config.id, never reads columns) and already resolves a blank subsidiaryKey cell to Group HQ.
// What was missing was DISCOVERABILITY: the "leave the cell blank for HQ" convention only showed
// up as a parenthetical in the column example text, easy to miss in a bulk file with many rows.
// IMPORT_VARIANTS makes HQ vs. Subsidiary an explicit, separate dropdown entry per data type
// instead of a per-row convention — for types with a subsidiaryKey column, the Subsidiary variant
// requires it (every row must name a real subsidiary) and the HQ variant omits it entirely from
// the template (every row is implicitly Group HQ). Both variants still POST the same underlying
// `id`, so the API route needs no changes.
export type ImportScope = "hq" | "subsidiary" | "none";

export interface ImportVariant {
  key: string; // unique dropdown value, e.g. "monthlyFinancial:hq" — never sent to the API
  id: ImportTypeId; // the actual type sent to /api/admin/import
  scope: ImportScope;
  labelZh: string;
  labelEn: string;
  columns: ImportColumn[];
}

function withoutSubsidiaryKey(columns: ImportColumn[]): ImportColumn[] {
  return columns.filter((c) => c.key !== "subsidiaryKey");
}
function withRequiredSubsidiaryKey(columns: ImportColumn[]): ImportColumn[] {
  return columns.map((c) => (c.key === "subsidiaryKey" ? { ...c, required: true, example: "mfg" } : c));
}

export const IMPORT_VARIANTS: ImportVariant[] = IMPORT_TYPES.flatMap((t): ImportVariant[] => {
  const hasSubsidiaryKey = t.columns.some((c) => c.key === "subsidiaryKey");
  if (!hasSubsidiaryKey) {
    return [{ key: `${t.id}:none`, id: t.id, scope: "none", labelZh: t.labelZh, labelEn: t.labelEn, columns: t.columns }];
  }
  return [
    { key: `${t.id}:subsidiary`, id: t.id, scope: "subsidiary", labelZh: `${t.labelZh}（子公司）`, labelEn: `${t.labelEn} (Subsidiary)`, columns: withRequiredSubsidiaryKey(t.columns) },
    { key: `${t.id}:hq`, id: t.id, scope: "hq", labelZh: `${t.labelZh}（集团总部）`, labelEn: `${t.labelEn} (Group HQ)`, columns: withoutSubsidiaryKey(t.columns) },
  ];
});

export function findImportVariant(key: string): ImportVariant | undefined {
  return IMPORT_VARIANTS.find((v) => v.key === key);
}
