// Jurisdiction ("country edition") of an organization: which accounting framework, tax regime, registry and
// compliance calendar the platform follows. Chosen when the company is registered and stored on
// Organization.jurisdiction; everything country-specific (labels, tax maths, filing types, statutory-report
// wording) reads from here instead of being hard-coded per page.
//
// Pure — no I/O. Sources for the Hong Kong rules (checked against the authorities' own pages):
//  - Profits tax rates and the two-tiered regime: IRD FAQ on the Two-tiered Profits Tax Rates Regime
//    (https://www.ird.gov.hk/eng/faq/2tr.htm)
//  - Return due dates / Block Extension Scheme: GovHK "Profits Tax Return" page and IRD BES circulars
//  - Employer's Return (BIR56A): IRD "Employers" pages — issued 1 April, filed within one month with the IR56B forms
//  - Annual Return (NAR1): Companies Registry — within 42 days after each incorporation anniversary, no extension
//  - MPF: MPFA — 5% each side on relevant income between HK$7,100 and HK$30,000 (employer max HK$1,500 / month),
//    paid on or before the 10th of the following month
//  - Accounting frameworks: HKICPA — HKFRS Accounting Standards, HKFRS for Private Entities, and SME-FRF & SME-FRS
//    (Companies Ordinance Cap. 622 s.359 reporting exemption)
// Figures that change by Budget or circular are stored as editable defaults, never as silent constants.

export type JurisdictionCode = "SG" | "HK";
export const JURISDICTION_CODES: JurisdictionCode[] = ["SG", "HK"];

export type FrameworkId = "SFRS_I" | "SFRS_SE" | "HKFRS" | "HKFRS_PE" | "SME_FRF";

export interface FrameworkInfo {
  id: FrameworkId;
  short: string;
  nameEn: string;
  nameZh: string;
  issuerEn: string;
  issuerZh: string;
  noteEn: string;
  noteZh: string;
}

export const FRAMEWORKS: Record<FrameworkId, FrameworkInfo> = {
  SFRS_I: {
    id: "SFRS_I",
    short: "SFRS(I)",
    nameEn: "Singapore Financial Reporting Standards (International) — SFRS(I)",
    nameZh: "新加坡财务报告准则（国际）— SFRS(I)",
    issuerEn: "Accounting Standards Council (ASC) Singapore",
    issuerZh: "新加坡会计准则理事会 (ASC)",
    noteEn: "Identical to IFRS Accounting Standards; true and fair view required.",
    noteZh: "与国际财务报告准则（IFRS）一致；须呈报真实而公允的反映。",
  },
  SFRS_SE: {
    id: "SFRS_SE",
    short: "SFRS for SE",
    nameEn: "Singapore Financial Reporting Standard for Small Entities — SFRS for SE",
    nameZh: "新加坡小型实体财务报告准则 — SFRS for SE",
    issuerEn: "Accounting Standards Council (ASC) Singapore",
    issuerZh: "新加坡会计准则理事会 (ASC)",
    noteEn: "Simplified framework for qualifying small entities.",
    noteZh: "适用于符合条件的小型实体的简化框架。",
  },
  HKFRS: {
    id: "HKFRS",
    short: "HKFRS",
    nameEn: "Hong Kong Financial Reporting Standards (HKFRS Accounting Standards)",
    nameZh: "香港财务报告准则（HKFRS）",
    issuerEn: "Hong Kong Institute of Certified Public Accountants (HKICPA)",
    issuerZh: "香港会计师公会 (HKICPA)",
    noteEn: "Fully converged with IFRS Accounting Standards; a true and fair view is required (Companies Ordinance s.380). Required for groups that consolidate and for entities with public accountability.",
    noteZh: "与国际财务报告准则（IFRS）全面趋同；须呈报真实而公允的反映（《公司条例》第380条）。编制合并报表的集团及具公共问责性的实体须采用。",
  },
  HKFRS_PE: {
    id: "HKFRS_PE",
    short: "HKFRS for PE",
    nameEn: "Hong Kong Financial Reporting Standard for Private Entities (HKFRS for Private Entities)",
    nameZh: "香港私营实体财务报告准则（HKFRS for Private Entities）",
    issuerEn: "Hong Kong Institute of Certified Public Accountants (HKICPA)",
    issuerZh: "香港会计师公会 (HKICPA)",
    noteEn: "Based on IFRS for SMEs, for entities without public accountability; a true and fair view is required.",
    noteZh: "以《国际财务报告准则（中小企业）》为基础，适用于无公共问责性的实体；须呈报真实而公允的反映。",
  },
  SME_FRF: {
    id: "SME_FRF",
    short: "SME-FRF & SME-FRS",
    nameEn: "Small and Medium-sized Entity Financial Reporting Framework and Standard (SME-FRF & SME-FRS)",
    nameZh: "中小型企业财务报告框架及准则（SME-FRF & SME-FRS）",
    issuerEn: "Hong Kong Institute of Certified Public Accountants (HKICPA)",
    issuerZh: "香港会计师公会 (HKICPA)",
    noteEn: "Only for private companies using the reporting exemption (Companies Ordinance s.359) — not for a company with subsidiaries or for consolidated statements. A compliance framework: no true and fair view is required.",
    noteZh: "仅适用于采用报告豁免的私人公司（《公司条例》第359条）；有附属公司的公司及合并报表不得使用。属合规性框架，无须呈报真实而公允的反映。",
  },
};

export interface AuthorityInfo {
  abbr: string;
  nameEn: string;
  nameZh: string;
}

export interface JurisdictionConfig {
  code: JurisdictionCode;
  nameEn: string;
  nameZh: string;
  flag: string;
  baseCurrency: string;
  taxAuthority: AuthorityInfo;
  registry: AuthorityInfo;
  accountantBody: AuthorityInfo;
  companiesLawEn: string;
  companiesLawZh: string;
  corporateTaxEn: string;
  corporateTaxZh: string;
  retirement: AuthorityInfo; // CPF / MPF
  hasGst: boolean;
  frameworks: FrameworkId[];
  defaultFramework: FrameworkId;
  defaultFyeMonth: number;
  /** Tax / compliance filing types this jurisdiction uses (matches the TaxFilingType enum). */
  filingTypes: { value: string; label: string }[];
  /** Matches AuditJurisdiction in audit-jurisdiction.ts. */
  auditCode: "SG" | "HK";
  taglineEn: string;
  taglineZh: string;
}

export const JURISDICTION_CONFIG: Record<JurisdictionCode, JurisdictionConfig> = {
  SG: {
    code: "SG",
    nameEn: "Singapore",
    nameZh: "新加坡",
    flag: "🇸🇬",
    baseCurrency: "SGD",
    taxAuthority: { abbr: "IRAS", nameEn: "Inland Revenue Authority of Singapore", nameZh: "新加坡税务局" },
    registry: { abbr: "ACRA", nameEn: "Accounting and Corporate Regulatory Authority", nameZh: "会计与企业管制局" },
    accountantBody: { abbr: "ISCA", nameEn: "Institute of Singapore Chartered Accountants", nameZh: "新加坡特许会计师协会" },
    companiesLawEn: "Companies Act 1967",
    companiesLawZh: "《公司法》(Companies Act 1967)",
    corporateTaxEn: "Corporate income tax",
    corporateTaxZh: "企业所得税",
    retirement: { abbr: "CPF", nameEn: "Central Provident Fund", nameZh: "中央公积金" },
    hasGst: true,
    frameworks: ["SFRS_I", "SFRS_SE"],
    defaultFramework: "SFRS_I",
    defaultFyeMonth: 12,
    filingTypes: [
      { value: "ECI", label: "ECI" },
      { value: "FORM_C_S", label: "Form C-S/C" },
      { value: "GST_F5", label: "GST F5" },
    ],
    auditCode: "SG",
    taglineEn: "SFRS · IRAS tax (ECI, Form C-S/C, GST F5) · ACRA · CPF · SGD",
    taglineZh: "SFRS · IRAS 税务（ECI、Form C-S/C、GST F5）· ACRA · CPF · 新加坡元",
  },
  HK: {
    code: "HK",
    nameEn: "Hong Kong",
    nameZh: "中国香港",
    flag: "🇭🇰",
    baseCurrency: "HKD",
    taxAuthority: { abbr: "IRD", nameEn: "Inland Revenue Department", nameZh: "税务局" },
    registry: { abbr: "CR", nameEn: "Companies Registry", nameZh: "公司注册处" },
    accountantBody: { abbr: "HKICPA", nameEn: "Hong Kong Institute of Certified Public Accountants", nameZh: "香港会计师公会" },
    companiesLawEn: "Companies Ordinance (Cap. 622)",
    companiesLawZh: "《公司条例》(第622章)",
    corporateTaxEn: "Profits tax",
    corporateTaxZh: "利得税",
    retirement: { abbr: "MPF", nameEn: "Mandatory Provident Fund", nameZh: "强制性公积金" },
    hasGst: false, // Hong Kong has no GST / VAT / sales tax
    frameworks: ["HKFRS", "HKFRS_PE", "SME_FRF"],
    defaultFramework: "HKFRS",
    defaultFyeMonth: 12,
    filingTypes: [
      { value: "PROFITS_TAX_RETURN", label: "Profits Tax Return (BIR51)" },
      { value: "PROVISIONAL_TAX", label: "Provisional Profits Tax" },
      { value: "EMPLOYERS_RETURN", label: "Employer's Return (BIR56A / IR56B)" },
      { value: "ANNUAL_RETURN", label: "Annual Return (NAR1)" },
      { value: "BR_RENEWAL", label: "Business Registration renewal" },
    ],
    auditCode: "HK",
    taglineEn: "HKFRS · IRD profits tax · Companies Registry · MPF · HKD · no GST",
    taglineZh: "HKFRS · 税务局利得税 · 公司注册处 · 强积金 · 港元 · 无 GST",
  },
};

export function getJurisdictionConfig(code: string | null | undefined): JurisdictionConfig {
  return code === "HK" ? JURISDICTION_CONFIG.HK : JURISDICTION_CONFIG.SG;
}

export function isFrameworkAllowed(code: JurisdictionCode, framework: string): framework is FrameworkId {
  return (JURISDICTION_CONFIG[code].frameworks as string[]).includes(framework);
}

/** The accounting framework in force: the one chosen for the organization, else the jurisdiction's default. */
export function effectiveFramework(code: string | null | undefined, chosen: string | null | undefined): FrameworkInfo {
  const cfg = getJurisdictionConfig(code);
  return FRAMEWORKS[chosen && isFrameworkAllowed(cfg.code, chosen) ? chosen : cfg.defaultFramework];
}

// ---------------------------------------------------------------------------------------------
// Hong Kong: Profits tax
// ---------------------------------------------------------------------------------------------

/** Standard profits tax rate for corporations; the two-tiered regime halves it on the first HK$2m. */
export const HK_CORPORATE_RATE_PCT = 16.5;
/** First tier of assessable profits taxed at half the standard rate (two-tiered profits tax rates regime). */
export const HK_LOWER_TIER_CAP = 2_000_000;

export interface HkProfitsTaxComputation {
  chargeableIncome: number; // assessable profits (estimate)
  tier1Profits: number; // taxed at half the standard rate
  tier2Profits: number; // taxed at the standard rate
  tier1Tax: number;
  tier2Tax: number;
  exemptAmount: number; // always 0 — Hong Kong has no partial exemption; kept so the shape matches the Singapore computation
  grossTax: number;
  rebateAmount: number; // Budget one-off reduction (entered per row — it changes every year)
  netTaxPayable: number;
  effectiveRatePct: number;
}

// Two-tiered profits tax rates regime: for a corporation, the first HK$2m of assessable profits is taxed at 8.25% (half of
// the 16.5% standard rate) and the rest at 16.5% — but only ONE entity in a group of connected entities may elect the lower
// rate for a given year of assessment (the election is irrevocable). `lowerRateElected = false` taxes everything at the
// standard rate. A loss gives nil tax (losses carry forward without time limit — not modelled here).
// `rebatePct` / `rebateCap` carry the Budget's one-off reduction of final tax (e.g. YA 2025/26 proposed: 100% capped at
// HK$3,000 per case; YA 2024/25: capped at HK$1,500) — a per-row input because it differs every year. It reduces FINAL tax
// only, not provisional tax.
export function computeHkProfitsTax(
  assessableProfits: number,
  standardRatePct: number,
  lowerRateElected: boolean,
  rebatePct: number,
  rebateCap: number
): HkProfitsTaxComputation {
  const profits = Math.max(0, assessableProfits);
  const lowerRate = standardRatePct / 2;
  const tier1Profits = lowerRateElected ? Math.min(profits, HK_LOWER_TIER_CAP) : 0;
  const tier2Profits = profits - tier1Profits;
  const tier1Tax = (tier1Profits * lowerRate) / 100;
  const tier2Tax = (tier2Profits * standardRatePct) / 100;
  const grossTax = tier1Tax + tier2Tax;
  const rebateAmount = Math.min((grossTax * rebatePct) / 100, rebateCap);
  const netTaxPayable = Math.max(0, grossTax - rebateAmount);
  return {
    chargeableIncome: assessableProfits,
    tier1Profits,
    tier2Profits,
    tier1Tax,
    tier2Tax,
    exemptAmount: 0,
    grossTax,
    rebateAmount,
    netTaxPayable,
    effectiveRatePct: assessableProfits > 0 ? (netTaxPayable / assessableProfits) * 100 : 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Hong Kong: filing calendar
// ---------------------------------------------------------------------------------------------

/** First year of the Year of Assessment (1 Apr – 31 Mar) that a financial year ending in (fyeYear, fyeMonth) falls in. */
export function hkYearOfAssessmentStart(fyeYear: number, fyeMonth: number): number {
  return fyeMonth >= 4 ? fyeYear : fyeYear - 1;
}
export function hkYearOfAssessmentLabel(startYear: number): string {
  return `YA${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** Block Extension Scheme code from the financial year-end month: N = 1 Apr–30 Nov, D = December, M = Jan–Mar. */
export function hkBlockExtensionCode(fyeMonth: number): "N" | "D" | "M" {
  if (fyeMonth === 12) return "D";
  return fyeMonth <= 3 ? "M" : "N";
}

// Typical ELECTRONIC extended due dates under the Block Extension Scheme, from the latest published scheme (YA 2025/26:
// N 4 Jun 2026, D 2 Oct 2026, M 16 Dec 2026). The IRD sets the exact dates by circular every year, so these are
// ESTIMATES that carry forward to the next year's calendar — the filing rows stay editable and say so in their notes.
const HK_BES_ESTIMATE: Record<"N" | "D" | "M", { month: number; day: number }> = {
  N: { month: 6, day: 4 },
  D: { month: 10, day: 2 },
  M: { month: 12, day: 16 },
};

export function hkProfitsTaxReturnDue(yaStart: number, fyeMonth: number): Date {
  const { month, day } = HK_BES_ESTIMATE[hkBlockExtensionCode(fyeMonth)];
  return new Date(Date.UTC(yaStart + 1, month - 1, day));
}

/** Employer's Return (BIR56A) for the year ended 31 March `issueYear`: issued 1 April, due within one month. */
export function hkEmployerReturnDue(issueYear: number): Date {
  return new Date(Date.UTC(issueYear, 4, 1));
}

/** Annual Return (NAR1): within 42 days after the incorporation anniversary falling in `year` (no extension possible). */
export function hkAnnualReturnDue(incorporationDate: Date, year: number): Date {
  const anniversary = Date.UTC(year, incorporationDate.getUTCMonth(), incorporationDate.getUTCDate());
  return new Date(anniversary + 42 * 86_400_000);
}

export interface DraftFiling {
  type: "PROFITS_TAX_RETURN" | "EMPLOYERS_RETURN" | "ANNUAL_RETURN";
  periodLabel: string;
  dueDate: Date;
  notes: string;
}

// The Hong Kong obligations that are worth putting on the tracker automatically: filings whose due date falls between
// 120 days ago and 400 days ahead (older ones are history; further out is noise). Profits tax return and Employer's Return
// are per legal entity; the Annual Return only for the company whose incorporation date is on file.
export function hkDraftFilings(args: { now: Date; fyeMonth: number; incorporationDate: Date | null; includeAnnualReturn: boolean }): DraftFiling[] {
  const { now, fyeMonth, incorporationDate, includeAnnualReturn } = args;
  const from = now.getTime() - 120 * 86_400_000;
  const to = now.getTime() + 400 * 86_400_000;
  const inWindow = (d: Date) => d.getTime() >= from && d.getTime() <= to;
  const out: DraftFiling[] = [];
  const year = now.getUTCFullYear();

  for (let fyeYear = year - 2; fyeYear <= year + 1; fyeYear++) {
    const ya = hkYearOfAssessmentStart(fyeYear, fyeMonth);
    const due = hkProfitsTaxReturnDue(ya, fyeMonth);
    if (inWindow(due) && !out.some((o) => o.type === "PROFITS_TAX_RETURN" && o.periodLabel === hkYearOfAssessmentLabel(ya))) {
      out.push({
        type: "PROFITS_TAX_RETURN",
        periodLabel: hkYearOfAssessmentLabel(ya),
        dueDate: due,
        notes: `Auto-created. Due date is an ESTIMATE of the Block Extension Scheme electronic date for code ${hkBlockExtensionCode(fyeMonth)} — the IRD confirms it each year by circular, so check and edit. The return (BIR51) must be filed with the audited financial statements and a tax computation.`,
      });
    }
  }
  for (let issueYear = year - 1; issueYear <= year + 1; issueYear++) {
    const due = hkEmployerReturnDue(issueYear);
    if (inWindow(due)) {
      out.push({
        type: "EMPLOYERS_RETURN",
        periodLabel: `Year ended 31 Mar ${issueYear}`,
        dueDate: due,
        notes: "Auto-created. BIR56A is issued by the IRD on 1 April and must be filed within one month together with an IR56B for each employee over the reporting threshold — even if there are no employees (tick NO). Delete only if this entity is not registered for business.",
      });
    }
  }
  if (includeAnnualReturn && incorporationDate) {
    for (let y = year - 1; y <= year + 1; y++) {
      const due = hkAnnualReturnDue(incorporationDate, y);
      if (inWindow(due)) {
        out.push({
          type: "ANNUAL_RETURN",
          periodLabel: `Annual Return ${y}`,
          dueDate: due,
          notes: "Auto-created from the incorporation date. Form NAR1 is due within 42 days after the incorporation anniversary; the Registrar cannot extend this and late filing is an offence with higher fees.",
        });
      }
    }
  }
  return out;
}
