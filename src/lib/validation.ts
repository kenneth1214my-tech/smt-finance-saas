import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

// Join-an-existing-company flow: the invite code resolves which organization the
// request is for. Goes through the normal admin-approval queue.
export const registerSchema = z.object({
  inviteCode: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(60),
  email: z.string().trim().email(),
  phone: z.string().trim().min(4).max(30),
  subsidiaryId: z.string().trim().min(1).nullable(),
  requestedRole: z.enum(["FINANCE", "MANAGER", "VIEWER"]),
  reason: z.string().trim().max(500).default(""),
});

// Create-a-new-company flow: no approval needed — this person becomes that company's
// first ADMIN immediately, since there's no existing admin to approve them.
export const createOrganizationSchema = z.object({
  companyName: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(60),
  email: z.string().trim().email(),
  password: z.string().min(8).max(100),
});

export const decideRequestSchema = z.object({
  requestId: z.string().min(1),
  approve: z.boolean(),
});

export const toggleUserStatusSchema = z.object({
  userId: z.string().min(1),
});

// Admin-initiated user creation — a direct alternative to the public self-registration +
// approval flow (registerSchema above), gated by canApprove() on the route itself. Unlike
// self-registration, an admin may assign any role including ADMIN/DIRECTOR.
export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.string().trim().email(),
  role: z.enum(["ADMIN", "DIRECTOR", "FINANCE", "MANAGER", "VIEWER"]),
  subsidiaryId: z.string().trim().min(1).nullable().optional(),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.string().trim().email(),
  role: z.enum(["ADMIN", "DIRECTOR", "FINANCE", "MANAGER", "VIEWER"]),
  subsidiaryId: z.string().trim().min(1).nullable().optional(),
});

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.string().trim().email(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

/* ============================================================
   Admin master-data CRUD schemas
   ============================================================ */

// Only nameZh is truly required — everything else (key, the other 4 language names, the 5
// segment names, color) has a sensible auto-derived fallback so a single-entity company can
// add itself with one field. Kept as separate fields (not collapsed into fewer DB columns) so a
// real multi-subsidiary group can still fill in per-language names/segments individually later.
const COLOR_PALETTE = ["#2a78d6", "#1baf7a", "#eb6834", "#8956d6", "#d6a12a", "#2ab6c9"];
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function slugify(s: string): string {
  const slug = s
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, "")
    .slice(0, 20);
  return slug || `sub${hashCode(s) % 10000}`;
}

export const subsidiaryBaseSchema = z.object({
  key: z.string().trim().max(20).optional(),
  nameZh: z.string().trim().min(1).max(60),
  nameZhTw: z.string().trim().max(60).optional(),
  nameEn: z.string().trim().max(60).optional(),
  nameMs: z.string().trim().max(60).optional(),
  nameId: z.string().trim().max(60).optional(),
  segmentZh: z.string().trim().max(40).optional(),
  segmentZhTw: z.string().trim().max(40).optional(),
  segmentEn: z.string().trim().max(40).optional(),
  segmentMs: z.string().trim().max(40).optional(),
  segmentId: z.string().trim().max(40).optional(),
  colorHex: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sortOrder: z.coerce.number().int().default(0),
  equity: z.coerce.number().default(0),
  debtRatio: z.coerce.number().default(0),
  riskRating: z.enum(["GOOD", "WARNING", "SERIOUS", "CRITICAL"]).default("GOOD"),
  fyeMonth: z.coerce.number().int().min(1).max(12).default(12),
  headcount: z.coerce.number().int().min(0).default(0),
});

export const subsidiarySchema = subsidiaryBaseSchema.transform((data) => {
  const segment = data.segmentZh || data.nameZh;
  return {
    ...data,
    key: data.key || slugify(data.nameZh),
    nameZhTw: data.nameZhTw || data.nameZh,
    nameEn: data.nameEn || data.nameZh,
    nameMs: data.nameMs || data.nameZh,
    nameId: data.nameId || data.nameZh,
    segmentZh: segment,
    segmentZhTw: data.segmentZhTw || segment,
    segmentEn: data.segmentEn || segment,
    segmentMs: data.segmentMs || segment,
    segmentId: data.segmentId || segment,
    colorHex: data.colorHex || COLOR_PALETTE[hashCode(data.nameZh) % COLOR_PALETTE.length],
  };
});

export const regionSchema = z.object({
  key: z.string().trim().min(1).max(20),
  nameZh: z.string().trim().min(1).max(60),
  nameZhTw: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().min(1).max(60),
  nameMs: z.string().trim().min(1).max(60),
  nameId: z.string().trim().min(1).max(60),
  sortOrder: z.coerce.number().int().default(0),
});

export const monthlyFinancialSchema = z.object({
  // null = group/HQ-level P&L, not tied to any single subsidiary — see BankAccount.subsidiaryId.
  subsidiaryId: z.preprocess((v) => (v === "" ? null : v), z.string().trim().min(1).nullable().optional()),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  revenue: z.coerce.number(),
  netProfit: z.coerce.number(),
  grossMarginPct: z.coerce.number(),
  opCost: z.coerce.number(),
  sellExp: z.coerce.number().default(0),
  adminExp: z.coerce.number().default(0),
  rndExp: z.coerce.number().default(0),
  financeExp: z.coerce.number().default(0),
  headcount: z.coerce.number().int().min(0).default(0),
});

export const regionMonthlyFinancialSchema = z.object({
  regionId: z.string().trim().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  revenue: z.coerce.number(),
  netProfit: z.coerce.number(),
});

export const budgetSchema = z.object({
  // null = group/HQ-level budget, not tied to any single subsidiary — see BankAccount.subsidiaryId.
  subsidiaryId: z.preprocess((v) => (v === "" ? null : v), z.string().trim().min(1).nullable().optional()),
  year: z.coerce.number().int().min(2000).max(2100),
  revenueBudget: z.coerce.number(),
  costBudgetRate: z.coerce.number(),
  expenseBudgetRate: z.coerce.number(),
});

export const bankAccountSchema = z.object({
  bankZh: z.string().trim().min(1).max(60),
  bankEn: z.string().trim().min(1).max(60),
  acctType: z.enum(["main", "general", "fx"]),
  balance: z.coerce.number(),
  currency: z.string().trim().min(1).max(10).default("CNY"),
  // Empty string (the "Group HQ" option in the subsidiary select) must become null, not fail
  // min(1) — the form can't submit an actual null through a <select>, only "".
  subsidiaryId: z.preprocess((v) => (v === "" ? null : v), z.string().trim().min(1).nullable().optional()),
});

export const cashFlowMonthlySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  ocf: z.coerce.number(),
  icf: z.coerce.number(),
  fcf: z.coerce.number(),
});

export const arCustomerSchema = z.object({
  nameZh: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().min(1).max(60),
  // null = a group/HQ-level receivable, not tied to any single subsidiary.
  subsidiaryId: z.preprocess((v) => (v === "" ? null : v), z.string().trim().min(1).nullable().optional()),
  balance: z.coerce.number(),
  agingDays: z.coerce.number().int().min(0),
  status: z.enum(["GOOD", "WARNING", "SERIOUS", "CRITICAL"]),
});

export const payableSchema = z.object({
  nameZh: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().min(1).max(60),
  // null = a group/HQ-level payable, not tied to any single subsidiary.
  subsidiaryId: z.preprocess((v) => (v === "" ? null : v), z.string().trim().min(1).nullable().optional()),
  balance: z.coerce.number(),
  agingDays: z.coerce.number().int().min(0),
  status: z.enum(["GOOD", "WARNING", "SERIOUS", "CRITICAL"]),
});

export const balanceSheetSchema = z.object({
  // null = group/HQ-level balance sheet, not tied to any single subsidiary.
  subsidiaryId: z.preprocess((v) => (v === "" ? null : v), z.string().trim().min(1).nullable().optional()),
  totalAssets: z.coerce.number(),
  totalLiabilities: z.coerce.number(),
  totalEquity: z.coerce.number(),
});

export const projectSchema = z.object({
  nameZh: z.string().trim().min(1).max(80),
  nameEn: z.string().trim().min(1).max(80),
  subsidiaryId: z.string().trim().min(1),
  budget: z.coerce.number(),
  spent: z.coerce.number(),
  progressPct: z.coerce.number().int().min(0).max(100),
  status: z.enum(["ON_TRACK", "AHEAD", "DELAYED"]),
  owner: z.string().trim().min(1).max(40),
});

export const riskAlertSchema = z.object({
  severity: z.enum(["GOOD", "WARNING", "SERIOUS", "CRITICAL"]),
  category: z.enum(["opRisk", "costRisk", "creditRisk", "marketRisk", "liquidityRisk", "complianceRisk"]),
  tag: z.string().trim().min(1).max(40),
  subsidiaryId: z.string().trim().min(1).nullable().optional(),
  entityLabel: z.string().trim().min(1).max(80),
  textZh: z.string().trim().min(1).max(500),
  textZhTw: z.string().trim().min(1).max(500),
  textEn: z.string().trim().min(1).max(500),
  textMs: z.string().trim().min(1).max(500),
  textId: z.string().trim().min(1).max(500),
  occurredAt: z.coerce.date(),
});

export const reportDocSchema = z.object({
  nameZh: z.string().trim().min(1).max(80),
  nameEn: z.string().trim().min(1).max(80),
  type: z.enum(["MANAGEMENT", "SPECIAL", "STATUTORY"]),
  status: z.enum(["GENERATED", "GENERATING", "ARCHIVED"]),
  period: z.string().trim().min(1).max(20),
  generatedAt: z.coerce.date().nullable().optional(),
});

export const currencySettingSchema = z.object({
  baseCurrency: z.string().trim().length(3),
});

export const fyeSettingSchema = z.object({
  fyeMonth: z.coerce.number().int().min(1).max(12),
});

export const companyNameSchema = z.object({
  companyName: z.string().trim().min(1).max(80),
});

export const hqBalanceSheetSchema = z.object({
  equity: z.coerce.number(),
  debtRatio: z.coerce.number(),
});

export const hqHeadcountSchema = z.object({
  headcount: z.coerce.number().int().min(0),
});

export const exchangeRateSchema = z.object({
  currency: z.string().trim().length(3),
  rateToBase: z.coerce.number().positive(),
});

export const expenseCategoryMappingSchema = z.object({
  accountLabel: z.string().trim().min(1).max(120),
  category: z.enum(["SELLING", "ADMIN", "RND", "FINANCE"]),
});
