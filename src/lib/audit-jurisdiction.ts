// Jurisdictional framing for the Internal Audit Report — deliberately limited to which local
// INTERNAL AUDIT / corporate-governance framework the report references and how it's labeled.
// This must never be dressed up as a statutory external "Independent Auditor's Report" (e.g.
// under SSA 700 in Singapore, HKSA in Hong Kong, or China's CSA) — that requires a licensed
// public accountant performing actual assurance procedures and forming an opinion on financial
// statements, none of which this system does. Every jurisdiction option below stays an internal
// management report; only the cited framework, title suffix, and disclaimer wording change.
export type AuditJurisdiction = "SG" | "HK" | "CN" | "MY" | "ID" | "GENERIC";

export const JURISDICTIONS: { code: AuditJurisdiction; labelZh: string; labelEn: string }[] = [
  { code: "SG", labelZh: "新加坡", labelEn: "Singapore" },
  { code: "HK", labelZh: "中国香港", labelEn: "Hong Kong" },
  { code: "CN", labelZh: "中国大陆", labelEn: "China (Mainland)" },
  { code: "MY", labelZh: "马来西亚", labelEn: "Malaysia" },
  { code: "ID", labelZh: "印度尼西亚", labelEn: "Indonesia" },
  { code: "GENERIC", labelZh: "通用/国际", labelEn: "Generic / International" },
];

// Default jurisdiction inferred from the organization's own base currency — "follow the country
// according to the currency in the system," per Kenneth's request — with a manual override
// always available on the report page itself.
export function defaultJurisdictionForCurrency(baseCurrency: string): AuditJurisdiction {
  switch (baseCurrency) {
    case "SGD":
      return "SG";
    case "HKD":
      return "HK";
    case "CNY":
      return "CN";
    case "MYR":
      return "MY";
    case "IDR":
      return "ID";
    default:
      return "GENERIC";
  }
}

export interface JurisdictionText {
  titleZh: string;
  titleEn: string;
  frameworkZh: string;
  frameworkEn: string;
  disclaimerZh: string;
  disclaimerEn: string;
}

// frameworkZh/En: which local internal-audit / corporate-governance framework this report's
// structure and terminology follow. disclaimerZh/En: explicit statement that this is NOT a
// statutory external audit opinion — required precisely because each jurisdiction's Companies
// Act / Auditors Act reserves that language for a licensed public accountant's signed opinion.
const TEXT: Record<AuditJurisdiction, JurisdictionText> = {
  SG: {
    titleZh: "内部审计报告（新加坡）",
    titleEn: "Internal Audit Report (Singapore)",
    frameworkZh:
      "本报告参照新加坡《公司治理准则》(Code of Corporate Governance) 中关于内部审计职能向审计委员会汇报的要求，并遵循国际内部审计执业准则框架 (International Professional Practices Framework, IPPF) 编制。",
    frameworkEn:
      "This report is prepared with reference to the internal audit function's reporting obligations to the Audit Committee under Singapore's Code of Corporate Governance, and follows the International Professional Practices Framework (IPPF) for internal auditing.",
    disclaimerZh:
      "本报告为内部管理报告，不构成《新加坡公司法》(Companies Act 1967) 项下的法定外部审计意见，未经执业会计师 (Public Accountant) 签署，不具备对外披露的法定审计效力。",
    disclaimerEn:
      "This is an internal management report, not a statutory external audit opinion under the Singapore Companies Act 1967. It is not signed by a Public Accountant and carries no statutory audit assurance for external disclosure purposes.",
  },
  HK: {
    titleZh: "内部审计报告（中国香港）",
    titleEn: "Internal Audit Report (Hong Kong)",
    frameworkZh:
      "本报告参照香港联合交易所《企业管治守则》(Corporate Governance Code, Appendix C1) 中关于内部审计职能的要求，并遵循国际内部审计执业准则框架 (IPPF) 编制。",
    frameworkEn:
      "This report is prepared with reference to the internal audit function requirements under the HKEX Corporate Governance Code (Appendix C1), and follows the International Professional Practices Framework (IPPF) for internal auditing.",
    disclaimerZh:
      "本报告为内部管理报告，不构成《公司条例》(Companies Ordinance) 项下的法定外部审计意见，未经执业会计师签署，不具备对外披露的法定审计效力。",
    disclaimerEn:
      "This is an internal management report, not a statutory external audit opinion under the Hong Kong Companies Ordinance. It is not signed by a Certified Public Accountant and carries no statutory audit assurance for external disclosure purposes.",
  },
  CN: {
    titleZh: "内部审计报告（中国大陆）",
    titleEn: "Internal Audit Report (China Mainland)",
    frameworkZh:
      "本报告参照财政部、证监会、审计署、银监会、保监会联合发布的《企业内部控制基本规范》及中国内部审计协会 (CIIA) 发布的《中国内部审计准则》编制。",
    frameworkEn:
      "This report is prepared with reference to the Basic Standard for Enterprise Internal Control (jointly issued by China's Ministry of Finance, CSRC, National Audit Office, CBRC and CIRC) and the China Internal Audit Standards issued by the China Institute of Internal Audit (CIIA).",
    disclaimerZh: "本报告为内部管理报告，不构成《中华人民共和国注册会计师法》项下的法定外部审计意见，未经注册会计师签署，不具备对外披露的法定审计效力。",
    disclaimerEn:
      "This is an internal management report, not a statutory external audit opinion under the PRC Certified Public Accountants Law. It is not signed by a Certified Public Accountant and carries no statutory audit assurance for external disclosure purposes.",
  },
  MY: {
    titleZh: "内部审计报告（马来西亚）",
    titleEn: "Internal Audit Report (Malaysia)",
    frameworkZh: "本报告参照马来西亚《公司治理准则》(Malaysian Code on Corporate Governance) 关于内部审计职能的要求，并遵循国际内部审计执业准则框架 (IPPF) 编制。",
    frameworkEn:
      "This report is prepared with reference to the internal audit function requirements under the Malaysian Code on Corporate Governance, and follows the International Professional Practices Framework (IPPF) for internal auditing.",
    disclaimerZh:
      "本报告为内部管理报告，不构成《2016年公司法》(Companies Act 2016) 项下的法定外部审计意见，未经执业会计师签署，不具备对外披露的法定审计效力。",
    disclaimerEn:
      "This is an internal management report, not a statutory external audit opinion under the Malaysian Companies Act 2016. It is not signed by an approved company auditor and carries no statutory audit assurance for external disclosure purposes.",
  },
  ID: {
    titleZh: "内部审计报告（印度尼西亚）",
    titleEn: "Internal Audit Report (Indonesia)",
    frameworkZh: "本报告参照印度尼西亚金融服务管理局 (OJK) 关于内部审计职能的相关规定，并遵循国际内部审计执业准则框架 (IPPF) 编制。",
    frameworkEn:
      "This report is prepared with reference to Indonesia's Financial Services Authority (OJK) regulations on the internal audit function, and follows the International Professional Practices Framework (IPPF) for internal auditing.",
    disclaimerZh: "本报告为内部管理报告，不构成法定外部审计意见，未经执业会计师 (Akuntan Publik) 签署，不具备对外披露的法定审计效力。",
    disclaimerEn:
      "This is an internal management report, not a statutory external audit opinion. It is not signed by a Public Accountant (Akuntan Publik) and carries no statutory audit assurance for external disclosure purposes.",
  },
  GENERIC: {
    titleZh: "内部审计报告",
    titleEn: "Internal Audit Report",
    frameworkZh: "本报告遵循国际内部审计执业准则框架 (International Professional Practices Framework, IPPF，由全球内部审计师协会 IIA 发布) 编制。",
    frameworkEn: "This report follows the International Professional Practices Framework (IPPF), issued by the global Institute of Internal Auditors (IIA).",
    disclaimerZh: "本报告为内部管理报告，不构成任何司法管辖区项下的法定外部审计意见，未经执业会计师签署，不具备对外披露的法定审计效力。",
    disclaimerEn: "This is an internal management report, not a statutory external audit opinion under any jurisdiction's companies/auditors law. It is not signed by a licensed public accountant and carries no statutory audit assurance for external disclosure purposes.",
  },
};

export function getJurisdictionText(code: AuditJurisdiction): JurisdictionText {
  return TEXT[code] ?? TEXT.GENERIC;
}
