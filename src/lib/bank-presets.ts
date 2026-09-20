// Bank presets for the Bank Accounts form: picking one auto-fills the bank name in both
// languages (and currency, where the bank is effectively single-currency) — mirrors the
// country-preset pattern already used on the Region form. Covers major banks across the
// platform's supported markets (China, Singapore, Malaysia) plus international banks with
// "Other" as a free-text fallback.
export const BANK_PRESETS: { value: string; label: string; fill: Record<string, string> }[] = [
  { value: "icbc", label: "中国工商银行 ICBC", fill: { bankZh: "中国工商银行", bankEn: "ICBC", currency: "CNY" } },
  { value: "ccb", label: "中国建设银行 CCB", fill: { bankZh: "中国建设银行", bankEn: "China Construction Bank", currency: "CNY" } },
  { value: "boc", label: "中国银行 Bank of China", fill: { bankZh: "中国银行", bankEn: "Bank of China", currency: "CNY" } },
  { value: "abc", label: "中国农业银行 ABC", fill: { bankZh: "中国农业银行", bankEn: "Agricultural Bank of China", currency: "CNY" } },
  { value: "bocom", label: "交通银行 Bank of Communications", fill: { bankZh: "交通银行", bankEn: "Bank of Communications", currency: "CNY" } },
  { value: "cmb", label: "招商银行 China Merchants Bank", fill: { bankZh: "招商银行", bankEn: "China Merchants Bank", currency: "CNY" } },
  { value: "dbs", label: "星展银行 DBS", fill: { bankZh: "星展银行", bankEn: "DBS Bank", currency: "SGD" } },
  { value: "uob", label: "大华银行 UOB", fill: { bankZh: "大华银行", bankEn: "United Overseas Bank", currency: "SGD" } },
  { value: "ocbc", label: "华侨银行 OCBC", fill: { bankZh: "华侨银行", bankEn: "OCBC Bank", currency: "SGD" } },
  { value: "maybank", label: "马来亚银行 Maybank", fill: { bankZh: "马来亚银行", bankEn: "Maybank", currency: "MYR" } },
  { value: "cimb", label: "联昌国际银行 CIMB", fill: { bankZh: "联昌国际银行", bankEn: "CIMB Bank", currency: "MYR" } },
  { value: "publicbank", label: "大众银行 Public Bank", fill: { bankZh: "大众银行", bankEn: "Public Bank", currency: "MYR" } },
  { value: "hsbc", label: "汇丰银行 HSBC", fill: { bankZh: "汇丰银行", bankEn: "HSBC" } },
  { value: "scb", label: "渣打银行 Standard Chartered", fill: { bankZh: "渣打银行", bankEn: "Standard Chartered" } },
  { value: "citibank", label: "花旗银行 Citibank", fill: { bankZh: "花旗银行", bankEn: "Citibank" } },
  // Digital/virtual banks — Singapore (MAS-licensed) and Malaysia (BNM-licensed) both issued
  // digital bank licenses in the last few years, and these are now common enough in daily use
  // that they shouldn't force a fall-through to "Other" free-text entry.
  { value: "trust", label: "Trust Bank", fill: { bankZh: "Trust Bank", bankEn: "Trust Bank", currency: "SGD" } },
  { value: "gxs", label: "GXS Bank", fill: { bankZh: "GXS Bank", bankEn: "GXS Bank", currency: "SGD" } },
  { value: "maribank", label: "MariBank", fill: { bankZh: "MariBank", bankEn: "MariBank", currency: "SGD" } },
  { value: "anext", label: "ANEXT Bank", fill: { bankZh: "ANEXT Bank", bankEn: "ANEXT Bank", currency: "SGD" } },
  { value: "greenlink", label: "Green Link Digital Bank", fill: { bankZh: "Green Link Digital Bank", bankEn: "Green Link Digital Bank", currency: "SGD" } },
  { value: "gxbank", label: "GXBank (Malaysia)", fill: { bankZh: "GXBank", bankEn: "GXBank", currency: "MYR" } },
  { value: "boostbank", label: "Boost Bank", fill: { bankZh: "Boost Bank", bankEn: "Boost Bank", currency: "MYR" } },
  { value: "aeonbank", label: "AEON Bank (Malaysia)", fill: { bankZh: "AEON Bank", bankEn: "AEON Bank", currency: "MYR" } },
  { value: "rytbank", label: "Ryt Bank", fill: { bankZh: "Ryt Bank", bankEn: "Ryt Bank", currency: "MYR" } },
  { value: "kafdigital", label: "KAF Digital Bank", fill: { bankZh: "KAF Digital Bank", bankEn: "KAF Digital Bank", currency: "MYR" } },
  { value: "webank", label: "微众银行 WeBank", fill: { bankZh: "微众银行", bankEn: "WeBank", currency: "CNY" } },
  { value: "mybank", label: "网商银行 MYbank", fill: { bankZh: "网商银行", bankEn: "MYbank", currency: "CNY" } },
  { value: "other", label: "其他 / Other (自定义)", fill: { bankZh: "", bankEn: "" } },
];
