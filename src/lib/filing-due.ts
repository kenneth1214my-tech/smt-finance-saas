// Statutory due dates for tax filings, worked out from the filing type, the period label and the entity's financial year-end — so
// nobody types a due date. Pure (no I/O), shared by the form (live fill) and the API (authoritative, so a hand-typed date can never
// override the rule). Dates are built with Date.UTC and exchanged as yyyy-mm-dd, so server and browser time zones never shift the day.
//
// Singapore (IRAS):
//   GST F5        — by the end of the month after the accounting period (e.g. 2026 Q3, Jul–Sep → 31 Oct 2026). Payment is due the same day.
//   ECI           — within 3 months of the financial year-end (FYE 31 Dec 2026 → 31 Mar 2027; FYE 30 Jun → 30 Sep).
//   Form C-S / C  — 30 November of the Year of Assessment, i.e. of the year after the financial year ends (FYE 31 Dec 2025 → YA2026 → 30 Nov 2026).
// Hong Kong (IRD / Companies Registry): see jurisdiction.ts — Block Extension dates are estimates until the IRD circular is out.

import { hkProfitsTaxReturnDue, hkEmployerReturnDue, hkAnnualReturnDue, hkYearOfAssessmentStart } from "@/lib/jurisdiction";

export interface FilingDueInput {
  jurisdiction: "SG" | "HK";
  type: string;
  periodLabel: string;
  /** Month (1–12) the entity's financial year ends in. */
  fyeMonth: number;
  /** Hong Kong Annual Return (NAR1) is counted from the incorporation anniversary. */
  incorporationDate?: string | null;
}

export interface FilingDueResult {
  /** yyyy-mm-dd */
  date: string;
  ruleEn: string;
  ruleZh: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The financial year, named by the calendar year it ends in, that a period label refers to. Accepts "FY2026", "FYE 2026", "2026", "YA2027" (= FY2026). */
function basisYearOf(label: string): number | null {
  const ya = /Y\.?A\.?\s*-?\s*(\d{4})/i.exec(label);
  if (ya) return Number(ya[1]) - 1;
  const fy = /FY[E]?\s*-?\s*(\d{4})/i.exec(label);
  if (fy) return Number(fy[1]);
  const bare = /^\s*(\d{4})\s*$/.exec(label);
  return bare ? Number(bare[1]) : null;
}

export function computeFilingDueDate(input: FilingDueInput): FilingDueResult | null {
  const label = (input.periodLabel || "").trim();
  if (!label) return null;
  const fye = Math.min(12, Math.max(1, Math.trunc(input.fyeMonth) || 12));

  if (input.jurisdiction === "SG") {
    if (input.type === "GST_F5") {
      const m = /^(\d{4})\s*Q([1-4])$/i.exec(label);
      if (!m) return null;
      const year = Number(m[1]);
      const q = Number(m[2]);
      return { date: iso(new Date(Date.UTC(year, q * 3 + 1, 0))), ruleEn: "GST F5: due by the end of the month after the accounting period (IRAS)", ruleZh: "GST F5：会计期间结束后下一个月的月底前（IRAS）" };
    }
    const basis = basisYearOf(label);
    if (basis === null) return null;
    if (input.type === "ECI") {
      return { date: iso(new Date(Date.UTC(basis, fye + 3, 0))), ruleEn: "ECI: within 3 months of the financial year-end (IRAS)", ruleZh: "ECI：财政年度结束后 3 个月内（IRAS）" };
    }
    if (input.type === "FORM_C_S") {
      return { date: iso(new Date(Date.UTC(basis + 1, 10, 30))), ruleEn: `Form C-S / C: 30 November of the Year of Assessment (YA${basis + 1}) (IRAS)`, ruleZh: `Form C-S / C：评估年度（YA${basis + 1}）11 月 30 日（IRAS）` };
    }
    return null;
  }

  // Hong Kong
  if (input.type === "PROFITS_TAX_RETURN") {
    const ya = /YA\s*(\d{4})/i.exec(label);
    const basis = basisYearOf(label);
    const start = ya ? Number(ya[1]) : basis !== null ? hkYearOfAssessmentStart(basis, fye) : null;
    if (start === null) return null;
    return { date: iso(hkProfitsTaxReturnDue(start, fye)), ruleEn: "Profits Tax Return: Block Extension Scheme date for the year-end month (estimate until the IRD circular is published)", ruleZh: "利得税报税表：按结账月份适用分批延期日期（IRD 公布通告前为估算）" };
  }
  if (input.type === "EMPLOYERS_RETURN") {
    const y = /(\d{4})/.exec(label);
    if (!y) return null;
    return { date: iso(hkEmployerReturnDue(Number(y[1]))), ruleEn: "Employer's Return: issued 1 April, due within one month (IRD)", ruleZh: "雇主报税表：4 月 1 日发出，一个月内递交（IRD）" };
  }
  if (input.type === "ANNUAL_RETURN") {
    const y = /(\d{4})/.exec(label);
    const inc = input.incorporationDate ? new Date(input.incorporationDate) : null;
    if (!y || !inc || Number.isNaN(inc.getTime())) return null;
    return { date: iso(hkAnnualReturnDue(inc, Number(y[1]))), ruleEn: "Annual Return (NAR1): within 42 days after the incorporation anniversary (Companies Registry)", ruleZh: "周年申报表（NAR1）：成立周年日后 42 天内（公司注册处）" };
  }
  return null;
}
