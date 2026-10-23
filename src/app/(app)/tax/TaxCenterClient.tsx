"use client";

import AcraXbrlPanel from "./AcraXbrlPanel";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ListChecks } from "lucide-react";
import type { Subsidiary, CorporateTaxProvision, TaxFiling, DeferredTaxItem } from "@prisma/client";
import type { Locale, DICTIONARIES } from "@/lib/i18n/dictionaries";
import { fmtMoney } from "@/lib/i18n/dictionaries";
import { localizedName } from "@/lib/localize";
import { computeCorporateTax, effectiveFilingStatus, type TaxFilingStatusComputed } from "@/lib/tax";
import { computeHkProfitsTax, JURISDICTION_CONFIG, HK_CORPORATE_RATE_PCT, HK_LOWER_TIER_CAP, hkYearOfAssessmentLabel, hkYearOfAssessmentStart, type JurisdictionCode } from "@/lib/jurisdiction";
import { HK_ADJUSTMENT_CATEGORIES, signedAdjustment, type HkScheduleRow } from "@/lib/hk-tax-schedule";
import KpiBreakdown from "@/components/ui/KpiBreakdown";
import type { BreakdownSection } from "@/lib/treasury-breakdown";
import Card from "@/components/ui/Card";
import CrudTable, { type FieldConfig } from "@/components/admin/CrudTable";
import GstBreakdownPanel, { type GstBreakdownView } from "./GstBreakdownPanel";

type Dict = (typeof DICTIONARIES)[Locale];
type Row = Record<string, unknown>;
type ProvisionRow = CorporateTaxProvision & { subsidiary: Subsidiary | null };
type FilingRow = TaxFiling & { subsidiary: Subsidiary | null };
type DeferredRow = DeferredTaxItem & { subsidiary: Subsidiary | null };
type AdjustmentRow = { id: string; provisionId: string; category: string; description: string; amount: unknown };

const STATUS_OPTIONS = [
  { value: "UPCOMING", label: "UPCOMING" },
  { value: "FILED", label: "FILED" },
  { value: "OVERDUE", label: "OVERDUE" },
  { value: "PAID", label: "PAID" },
];
const STATUS_TONE: Record<TaxFilingStatusComputed, string> = {
  UPCOMING: "var(--status-warning)",
  FILED: "var(--status-good)",
  PAID: "var(--status-good)",
  OVERDUE: "var(--status-critical)",
};

export default function TaxCenterClient({
  jurisdiction,
  adjustments,
  schedule,
  fyeByKey,
  locale,
  unit,
  dict,
  subsidiaries,
  provisions,
  filings,
  deferredItems,
  netProfitByEntity,
  acra,
}: {
  jurisdiction: JurisdictionCode;
  adjustments: AdjustmentRow[];
  schedule: Record<string, HkScheduleRow>;
  fyeByKey: Record<string, number>;
  locale: Locale;
  unit: string;
  dict: Dict;
  subsidiaries: Subsidiary[];
  provisions: ProvisionRow[];
  filings: FilingRow[];
  deferredItems: DeferredRow[];
  netProfitByEntity: Record<string, Record<number, number>>;
  /** Singapore only: ACRA XBRL tab settings (financial years offered, default year, stored UEN). */
  acra?: { years: number[]; defaultYear: number; registrationNo: string | null };
}) {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const cfg = JURISDICTION_CONFIG[jurisdiction];
  const isHk = jurisdiction === "HK";
  const [tab, setTab] = useState<"provision" | "filing" | "adjust" | "deferred" | "xbrl">("provision");
  const fmtM = (n: number) => fmtMoney(n, locale);
  const router = useRouter();
  const [genYear, setGenYear] = useState(String(new Date().getFullYear()));
  const [genBusy, setGenBusy] = useState(false);
  const [genMessage, setGenMessage] = useState("");
  const [estimatingId, setEstimatingId] = useState<string | null>(null);
  const [estimateError, setEstimateError] = useState("");

  const [breakdown, setBreakdown] = useState<GstBreakdownView | null>(null);
  const [breakdownLoadingId, setBreakdownLoadingId] = useState<string | null>(null);

  function explainGstError(body: { error?: string; message?: string }): string {
    return body.error === "xero_not_connected"
      ? isZh
        ? "该主体尚未连接Xero，或需要重新连接以授权新增的发票读取权限"
        : "Xero isn't connected for this entity, or needs reconnecting to grant the new invoices permission"
      : body.error === "insufficient_scope"
        ? isZh
          ? "该主体的 Xero 连接权限不足（建立于新增发票读取权限之前）— 请在「数据导入与ERP」中断开并重新连接该主体的 Xero"
          : "This entity's Xero connection predates the invoices-read permission — disconnect and reconnect it under Data Import & ERP"
        : body.error === "unrecognized_period"
          ? isZh
            ? "期间格式无法识别（非自动生成的\"YYYY QN\"格式），无法自动估算"
            : "Period label isn't in the auto-generated \"YYYY QN\" format, so it can't be auto-estimated"
          : body.message || (isZh ? "估算失败" : "Estimate failed");
  }

  async function estimateGst(filingId: string, refresh: () => void) {
    setEstimatingId(filingId);
    setEstimateError("");
    try {
      const res = await fetch(`/api/admin/tax-filings/${filingId}/estimate-gst`, { method: "POST" });
      if (res.ok) {
        refresh();
        return;
      }
      setEstimateError(explainGstError(await res.json().catch(() => ({}))));
    } catch {
      setEstimateError(isZh ? "请求超时或网络错误，请稍后重试" : "Request timed out or network error — try again");
    } finally {
      setEstimatingId(null);
    }
  }

  async function viewBreakdown(filingId: string) {
    setBreakdownLoadingId(filingId);
    setEstimateError("");
    try {
      const res = await fetch(`/api/admin/tax-filings/${filingId}/gst-breakdown`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEstimateError(explainGstError(body));
        return;
      }
      setBreakdown({ entityName: body.entityName, periodLabel: body.periodLabel, quarterStart: body.quarterStart, quarterEnd: body.quarterEnd, data: body.breakdown });
    } catch {
      setEstimateError(isZh ? "请求超时或网络错误，请稍后重试" : "Request timed out or network error — try again");
    } finally {
      setBreakdownLoadingId(null);
    }
  }

  async function generateDraftProvisions() {
    const year = Number(genYear);
    if (!Number.isInteger(year)) return;
    setGenBusy(true);
    setGenMessage("");
    const entities = [{ subsidiaryId: null as string | null }, ...subsidiaries.map((s) => ({ subsidiaryId: s.id }))];
    const existingKeys = new Set(provisions.filter((p) => p.year === year).map((p) => p.subsidiaryId ?? "HQ"));
    let created = 0;
    let skippedNoData = 0;
    for (const e of entities) {
      const key = e.subsidiaryId ?? "HQ";
      if (existingKeys.has(key)) continue;
      const netProfit = netProfitByEntity[key]?.[year];
      if (netProfit === undefined) {
        skippedNoData++;
        continue;
      }
      const res = await fetch("/api/admin/corporate-tax-provisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subsidiaryId: e.subsidiaryId ?? "",
          year,
          chargeableIncome: netProfit,
          ...(isHk ? { taxRatePct: HK_CORPORATE_RATE_PCT } : {}),
          notes: isHk
            ? isZh
              ? "根据Xero已同步的净利润(税前)自动生成草稿；应评税利润须另行调整（离岸/境外来源收入、资本性收益、折旧免税额等），请核对后再确认"
              : "Draft generated from Xero-synced net profit before tax — assessable profits need further adjustment (offshore / non-taxable income, capital items, depreciation allowances) before relying on this figure"
            : isZh
              ? "根据Xero已同步的净利润(税前)自动生成草稿，请核对税务调整项后再确认"
              : "Draft generated from Xero-synced net profit before tax — review tax adjustments before relying on this figure",
        }),
      });
      if (res.ok) created++;
    }
    setGenBusy(false);
    setGenMessage(
      isZh
        ? `已生成 ${created} 条草稿记录${skippedNoData > 0 ? `，${skippedNoData} 个主体暂无该年度的Xero同步数据` : ""}`
        : `Generated ${created} draft row(s)${skippedNoData > 0 ? `; ${skippedNoData} entit${skippedNoData === 1 ? "y has" : "ies have"} no Xero-synced data for that year` : ""}`
    );
    if (created > 0) router.refresh();
  }

  // null subsidiaryId = a group/HQ-level filing obligation (Singapore doesn't allow a group
  // tax return — every entity, HQ included, files its own).
  const subsidiaryOrHqOptions = [{ value: "", label: dict.m.taxGroupHQ }, ...subsidiaries.map((s) => ({ value: s.id, label: localizedName(s, locale) }))];
  const subsidiaryOrHqLabel = (row: Row) => {
    const s = row.subsidiary as Subsidiary | null | undefined;
    return s ? localizedName(s, locale) : dict.m.taxGroupHQ;
  };

  const provisionFields: FieldConfig[] = [
    { key: "subsidiaryId", label: dict.m.taxEntity, type: "select", options: subsidiaryOrHqOptions, displayValue: subsidiaryOrHqLabel },
    { key: "year", label: dict.m.taxYear, type: "number" },
    { key: "chargeableIncome", label: isHk ? `${isZh ? "会计税前利润(估算)" : "Accounting profit before tax (est.)"} (${unit})` : `${dict.m.taxChargeableIncome} (${unit})`, type: "number", step: "0.01" },
    { key: "taxRatePct", label: isHk ? (isZh ? "标准税率 %（公司 16.5%）" : "Standard rate % (corporations 16.5%)") : isZh ? "税率 %" : "Tax Rate %", type: "number", step: "0.01" },
    ...(isHk
      ? [
          {
            key: "lowerRateElected",
            label: isZh ? "选用两级制税率（首200万港元按8.25%）" : "Elect two-tiered rate (8.25% on first HK$2m)",
            type: "select" as const,
            options: [
              { value: "true", label: isZh ? "是" : "Yes" },
              { value: "false", label: isZh ? "否" : "No" },
            ],
            displayValue: (row: Row) => (row.lowerRateElected === false ? (isZh ? "否" : "No") : isZh ? "是" : "Yes"),
          },
        ]
      : []),
    ...(isHk ? [{ key: "lossesBroughtForward", label: `${isZh ? "承前亏损（本系统启用前）" : "Losses brought forward (before this system)"} (${unit})`, type: "number" as const, step: "0.01" }] : []),
    { key: "rebatePct", label: isHk ? (isZh ? "利得税宽减比例 %" : "Profits tax reduction %") : isZh ? "回扣比例 %" : "Rebate %", type: "number", step: "0.01" },
    { key: "rebateCap", label: `${isHk ? (isZh ? "宽减上限" : "Reduction cap") : isZh ? "回扣上限" : "Rebate Cap"} (${unit})`, type: "number", step: "0.01" },
    { key: "notes", label: isZh ? "备注" : "Notes", type: "textarea" },
  ];
  const provisionTableKeys = isHk ? ["subsidiaryId", "year", "chargeableIncome", "taxRatePct", "lowerRateElected", "rebatePct", "rebateCap"] : ["subsidiaryId", "year", "chargeableIncome", "taxRatePct", "rebatePct", "rebateCap"];

  const filingFieldsAll: FieldConfig[] = [
    { key: "subsidiaryId", label: dict.m.taxEntity, type: "select", options: subsidiaryOrHqOptions, displayValue: subsidiaryOrHqLabel },
    { key: "type", label: isZh ? "类型" : "Type", type: "select", options: cfg.filingTypes },
    { key: "periodLabel", label: isZh ? "期间" : "Period", type: "text" },
    { key: "dueDate", label: isZh ? "到期日" : "Due Date", type: "date" },
    { key: "filedAt", label: isZh ? "申报日期" : "Filed At", type: "date" },
    { key: "outputTax", label: `${isZh ? "销项税额" : "Output Tax"} (${unit})`, type: "number", step: "0.01" },
    { key: "inputTax", label: `${isZh ? "进项税额" : "Input Tax"} (${unit})`, type: "number", step: "0.01" },
    { key: "amount", label: `${isZh ? "应缴/应退金额" : "Amount"} (${unit})`, type: "number", step: "0.01" },
    { key: "paidAt", label: isZh ? "缴款日期" : "Paid At", type: "date" },
    {
      key: "status",
      label: isZh ? "状态" : "Status",
      type: "select",
      options: STATUS_OPTIONS,
      displayValue: (row) => {
        const status = (row.status as TaxFilingStatusComputed) ?? "UPCOMING";
        const dueDate = row.dueDate ? new Date(row.dueDate as string) : new Date();
        const eff = effectiveFilingStatus(status, dueDate);
        return (
          <span className="font-bold" style={{ color: STATUS_TONE[eff] }}>
            {eff}
          </span>
        );
      },
    },
    { key: "notes", label: isZh ? "备注" : "Notes", type: "textarea" },
  ];
  // Hong Kong has no GST, so its filings carry no output / input tax columns.
  const filingFields = cfg.hasGst ? filingFieldsAll : filingFieldsAll.filter((f) => f.key !== "outputTax" && f.key !== "inputTax");
  const filingTableKeys = cfg.hasGst ? ["subsidiaryId", "type", "periodLabel", "dueDate", "outputTax", "inputTax", "amount", "status"] : ["subsidiaryId", "type", "periodLabel", "dueDate", "amount", "status"];

  const deferredFields: FieldConfig[] = [
    { key: "subsidiaryId", label: dict.m.taxEntity, type: "select", options: subsidiaryOrHqOptions, displayValue: subsidiaryOrHqLabel },
    { key: "year", label: dict.m.taxYear, type: "number" },
    { key: "description", label: isZh ? "项目说明" : "Description", type: "text" },
    { key: "temporaryDifference", label: `${isZh ? "暂时性差异" : "Temporary Difference"} (${unit})`, type: "number", step: "0.01" },
    { key: "deferredTaxAmount", label: `${isZh ? "递延所得税金额" : "Deferred Tax Amount"} (${unit})`, type: "number", step: "0.01" },
    { key: "notes", label: isZh ? "备注" : "Notes", type: "textarea" },
  ];

  const tabs: { id: typeof tab; label: string }[] = [
    { id: "provision", label: dict.m.taxProvisionCard },
    { id: "filing", label: dict.m.taxFilingCard },
    ...(isHk ? [{ id: "adjust" as const, label: isZh ? "税务调整" : "Tax adjustments" }] : []),
    { id: "deferred", label: dict.m.taxDeferredCard },
    ...(acra ? [{ id: "xbrl" as const, label: isZh ? "XBRL（ACRA 申报）" : "XBRL (ACRA filing)" }] : []),
  ];

  const currentYear = new Date().getFullYear();
  const latestYear = provisions.length > 0 ? Math.max(...provisions.map((p) => p.year)) : currentYear;
  const breakdownRows = provisions
    .filter((p) => p.year === latestYear)
    .map((p) => ({
      id: p.id,
      name: p.subsidiary ? localizedName(p.subsidiary, locale) : dict.m.taxGroupHQ,
      tier1Profits: 0,
      tier2Profits: 0,
      lowerRateElected: p.lowerRateElected,
      ...(isHk
        ? computeHkProfitsTax(Number(p.chargeableIncome), Number(p.taxRatePct), p.lowerRateElected, Number(p.rebatePct), Number(p.rebateCap))
        : computeCorporateTax(Number(p.chargeableIncome), Number(p.taxRatePct), Number(p.rebatePct), Number(p.rebateCap))),
    }))
    .sort((a, b) => b.netTaxPayable - a.netTaxPayable);
  const groupTotal = breakdownRows.reduce((sum, r) => sum + r.netTaxPayable, 0);
  // Only ONE entity in a group of connected entities may elect the lower rate for a year of assessment.
  const lowerRateElections = isHk ? breakdownRows.filter((r) => r.lowerRateElected && r.chargeableIncome > 0).length : 0;

  // ---- Hong Kong: schedule rows for the latest year, and the pro forma computation behind each ----
  const catLabel = (key: string) => {
    const c = HK_ADJUSTMENT_CATEGORIES.find((x) => x.key === key);
    return c ? (isZh ? c.labelZh : c.labelEn) : key;
  };
  const entityKeyOf = (p: ProvisionRow) => p.subsidiaryId ?? "HQ";
  const yaOf = (p: ProvisionRow) => hkYearOfAssessmentLabel(hkYearOfAssessmentStart(p.year, fyeByKey[entityKeyOf(p)] ?? 12));
  const entityNameOf = (p: ProvisionRow) => (p.subsidiary ? localizedName(p.subsidiary, locale) : dict.m.taxGroupHQ);
  const hkRows = isHk
    ? provisions
        .filter((p) => p.year === latestYear)
        .map((p) => {
          const sch = schedule[p.id];
          const accounting = Number(p.chargeableIncome);
          const fallbackTax = computeHkProfitsTax(accounting, Number(p.taxRatePct), p.lowerRateElected, Number(p.rebatePct), Number(p.rebateCap));
          return {
            id: p.id,
            name: entityNameOf(p),
            ya: yaOf(p),
            accounting,
            adjustmentsNet: sch?.adjustmentsNet ?? 0,
            lossesUtilised: sch?.lossesUtilised ?? 0,
            lossesClosing: sch?.lossesClosing ?? 0,
            assessable: sch?.assessableProfits ?? Math.max(0, accounting),
            tax: sch?.tax ?? fallbackTax,
          };
        })
        .sort((a, b) => b.tax.netTaxPayable - a.tax.netTaxPayable)
    : [];
  const proFormaSections: BreakdownSection[] = isHk
    ? provisions
        .filter((p) => p.year === latestYear)
        .map((p) => {
          const sch = schedule[p.id];
          const accounting = Number(p.chargeableIncome);
          const t = sch?.tax ?? computeHkProfitsTax(accounting, Number(p.taxRatePct), p.lowerRateElected, Number(p.rebatePct), Number(p.rebateCap));
          const rows: BreakdownSection["rows"] = [
            { label: isZh ? "会计税前利润" : "Accounting profit before tax", values: [accounting] },
            {
              label: isZh ? "＋ 会计折旧加回（自动推算）" : "+ Accounting depreciation added back (derived automatically)",
              hint: isZh ? "取自财政年度内固定资产变动与投资现金流；缺少存档资产负债表时为 0" : "From the fixed-asset movement and investing cash flow over the financial year; 0 when the archived balance sheets are missing",
              values: [sch?.autoDepreciation ?? 0],
            },
            ...(sch?.byCategory ?? []).map((c) => ({ label: catLabel(c.key), values: [signedAdjustment(c.key, c.amount)] })),
            { label: isZh ? "＝ 亏损抵销前应评税利润" : "= Assessable profits before losses", values: [sch?.assessableBeforeLosses ?? accounting], kind: "total" as const },
            { label: isZh ? "－ 动用承前亏损" : "− Losses brought forward utilised", hint: isZh ? `承前亏损合计 ${fmtM(sch?.lossesOpening ?? 0)}` : `Losses available: ${fmtM(sch?.lossesOpening ?? 0)}`, values: [-(sch?.lossesUtilised ?? 0)] },
            { label: isZh ? "＝ 应评税利润" : "= Assessable profits", values: [sch?.assessableProfits ?? Math.max(0, accounting)], kind: "total" as const },
            { label: isZh ? `首 ${HK_LOWER_TIER_CAP.toLocaleString("en-US")} 港元按 8.25% 课税` : `Tax at 8.25% on the first HK${HK_LOWER_TIER_CAP.toLocaleString("en-US")}`, hint: p.lowerRateElected ? `${fmtM(t.tier1Profits)} × 8.25%` : isZh ? "未选用两级制税率" : "Two-tiered rate not elected", values: [t.tier1Tax] },
            { label: isZh ? "其余部分按 16.5% 课税" : "Tax at 16.5% on the rest", hint: `${fmtM(t.tier2Profits)} × ${Number(p.taxRatePct)}%`, values: [t.tier2Tax] },
            { label: isZh ? "＝ 宽减前利得税" : "= Profits tax before reduction", values: [t.grossTax], kind: "total" as const },
            { label: isZh ? "－ 利得税宽减" : "− Profits tax reduction", values: [-t.rebateAmount] },
            { label: isZh ? "＝ 预计应缴利得税" : "= Estimated profits tax payable", values: [t.netTaxPayable], kind: "total" as const },
            { label: isZh ? "结转下年亏损（承前亏损余额）" : "Losses carried forward to next year", values: [sch?.lossesClosing ?? 0], kind: "muted" as const },
          ];
          return {
            id: p.id,
            title: `${entityNameOf(p)} — FY${p.year} (${yaOf(p)})`,
            result: t.netTaxPayable,
            formula: isZh
              ? "会计税前利润 ＋ 加回 － 扣除 ＝ 亏损抵销前应评税利润；减动用承前亏损 ＝ 应评税利润；按两级制税率计税，再减当年宽减"
              : "Accounting profit + add-backs − deductions = assessable profits before losses; less losses brought forward = assessable profits; taxed at the two-tiered rates, less the year's reduction",
            cols: [isZh ? "金额" : "Amount"],
            rows,
            notes: [
              isZh
                ? "仅会计折旧自动加回；其余调整（不可扣减开支、离岸利润、资本性收益、折旧免税额等）请在「税务调整」页逐项录入。香港对来源于境外的利润及资本性利润不征税，且境外/资本性亏损不得抵销应评税利润。"
                : "Only accounting depreciation is added back automatically; enter every other adjustment (non-deductible items, offshore profits, capital gains, depreciation allowances…) under Tax adjustments. Hong Kong does not tax offshore or capital profits, and offshore / capital losses cannot be set off against assessable profits.",
            ],
          } satisfies BreakdownSection;
        })
    : [];
  const adjustmentProvisionOptions = provisions.map((p) => ({ value: p.id, label: `${entityNameOf(p)} — FY${p.year}` }));
  const adjustmentFields: FieldConfig[] = [
    {
      key: "provisionId",
      label: isZh ? "对应预提记录（主体 — 财政年度）" : "Provision (entity — financial year)",
      type: "select",
      options: adjustmentProvisionOptions,
      displayValue: (row) => adjustmentProvisionOptions.find((o) => o.value === row.provisionId)?.label ?? "—",
    },
    {
      key: "category",
      label: isZh ? "调整类别" : "Adjustment type",
      type: "select",
      options: HK_ADJUSTMENT_CATEGORIES.map((c) => ({ value: c.key, label: isZh ? c.labelZh : c.labelEn })),
      displayValue: (row) => catLabel(String(row.category)),
    },
    { key: "description", label: isZh ? "说明" : "Description", type: "text" },
    {
      key: "amount",
      label: `${isZh ? "金额（输入正数）" : "Amount (enter a positive number)"} (${unit})`,
      type: "number",
      step: "0.01",
      displayValue: (row) => {
        const effect = signedAdjustment(String(row.category), Number(row.amount));
        return <span style={{ color: effect < 0 ? "var(--status-critical)" : undefined }}>{fmtM(effect)}</span>;
      },
    },
  ];

  return (
    <div className="space-y-4">
      {tab === "provision" && (
        <Card title={`${isHk ? (isZh ? "利得税预提估算" : "Profits Tax Provision Estimate") : dict.m.taxProvisionBreakdownCard} (${latestYear})`} unit={unit}>
          {lowerRateElections > 1 && (
            <div className="mb-3 rounded-lg px-3 py-2 text-[12px] font-semibold" style={{ background: "color-mix(in srgb, var(--status-warning) 14%, transparent)", color: "var(--status-warning)" }}>
              {isZh
                ? `有 ${lowerRateElections} 个主体选用了两级制税率。关连实体（持股/控制超过50%）中，每个课税年度只有一个实体可选用 8.25% 的较低税率，且选择不可撤回 — 请只保留一个主体选「是」。`
                : `${lowerRateElections} entities have elected the two-tiered rate. Among connected entities (more than 50% control), only ONE may elect the 8.25% lower rate for a year of assessment, and the election is irrevocable — keep "Yes" on a single entity only.`}
            </div>
          )}
          {isHk && (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.6px]">
                <thead>
                  <tr className="text-left text-[11px] font-semibold" style={{ color: "var(--ink-400)" }}>
                    <th className="pb-2 pr-3">{dict.m.taxEntity}</th>
                    <th className="pb-2 pr-3">{isZh ? "会计税前利润" : "Accounting profit"}</th>
                    <th className="pb-2 pr-3">{isZh ? "税务调整(净)" : "Adjustments (net)"}</th>
                    <th className="pb-2 pr-3">{isZh ? "动用承前亏损" : "Losses used"}</th>
                    <th className="pb-2 pr-3">{isZh ? "应评税利润" : "Assessable profits"}</th>
                    <th className="pb-2 pr-3">{isZh ? "按 8.25%" : "At 8.25%"}</th>
                    <th className="pb-2 pr-3">{isZh ? "按 16.5%" : "At 16.5%"}</th>
                    <th className="pb-2 pr-3">{dict.m.taxGrossTax}</th>
                    <th className="pb-2 pr-3">{isZh ? "利得税宽减" : "Reduction"}</th>
                    <th className="pb-2 pr-3">{isZh ? "预计应缴利得税" : "Est. profits tax payable"}</th>
                    <th className="pb-2 pr-3">{dict.m.taxEffectiveRate}</th>
                  </tr>
                </thead>
                <tbody>
                  {hkRows.length === 0 && (
                    <tr>
                      <td colSpan={11} className="py-4 text-center text-[12px]" style={{ color: "var(--ink-400)" }}>
                        {dict.m.taxNoProvisionData}
                      </td>
                    </tr>
                  )}
                  {hkRows.map((r) => (
                    <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="whitespace-nowrap py-2 pr-3 font-semibold" style={{ color: "var(--ink-900)" }}>
                        {r.name}
                        <div className="text-[10.5px] font-normal" style={{ color: "var(--ink-400)" }}>
                          FY{latestYear} · {r.ya}
                        </div>
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3">{fmtM(r.accounting)}</td>
                      <td className="whitespace-nowrap py-2 pr-3">{fmtM(r.adjustmentsNet)}</td>
                      <td className="whitespace-nowrap py-2 pr-3">{fmtM(r.lossesUtilised)}</td>
                      <td className="whitespace-nowrap py-2 pr-3 font-semibold">{fmtM(r.assessable)}</td>
                      <td className="whitespace-nowrap py-2 pr-3">{fmtM(r.tax.tier1Profits)}</td>
                      <td className="whitespace-nowrap py-2 pr-3">{fmtM(r.tax.tier2Profits)}</td>
                      <td className="whitespace-nowrap py-2 pr-3">{fmtM(r.tax.grossTax)}</td>
                      <td className="whitespace-nowrap py-2 pr-3">{fmtM(r.tax.rebateAmount)}</td>
                      <td className="whitespace-nowrap py-2 pr-3 font-bold" style={{ color: "var(--ink-900)" }}>
                        {fmtM(r.tax.netTaxPayable)}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3">{r.tax.effectiveRatePct.toFixed(2)}%</td>
                    </tr>
                  ))}
                  {hkRows.length > 0 && (
                    <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="whitespace-nowrap py-2 pr-3 font-bold" style={{ color: "var(--ink-900)" }}>
                        {isZh ? "集团合计(仅供参考)" : "Group Total (for reference only)"}
                      </td>
                      <td colSpan={8}></td>
                      <td className="whitespace-nowrap py-2 pr-3 font-bold" style={{ color: "var(--ink-900)" }}>
                        {fmtM(hkRows.reduce((a, r) => a + r.tax.netTaxPayable, 0))}
                      </td>
                      <td></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {!isHk && (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.6px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold" style={{ color: "var(--ink-400)" }}>
                  <th className="pb-2 pr-3">{dict.m.taxEntity}</th>
                  <th className="pb-2 pr-3">{isHk ? (isZh ? "应评税利润(估算)" : "Assessable profits (est.)") : dict.m.taxChargeableIncome}</th>
                  {isHk ? (
                    <>
                      <th className="pb-2 pr-3">{isZh ? "按 8.25% 课税部分" : "Profits at 8.25%"}</th>
                      <th className="pb-2 pr-3">{isZh ? "按 16.5% 课税部分" : "Profits at 16.5%"}</th>
                    </>
                  ) : (
                    <th className="pb-2 pr-3">{dict.m.taxExemptAmount}</th>
                  )}
                  <th className="pb-2 pr-3">{dict.m.taxGrossTax}</th>
                  <th className="pb-2 pr-3">{isHk ? (isZh ? "利得税宽减" : "Tax reduction") : dict.m.taxRebateAmount}</th>
                  <th className="pb-2 pr-3">{isHk ? (isZh ? "预计应缴利得税" : "Est. profits tax payable") : dict.m.taxNetPayable}</th>
                  <th className="pb-2 pr-3">{dict.m.taxEffectiveRate}</th>
                </tr>
              </thead>
              <tbody>
                {breakdownRows.length === 0 && (
                  <tr>
                    <td colSpan={isHk ? 8 : 7} className="py-4 text-center text-[12px]" style={{ color: "var(--ink-400)" }}>
                      {dict.m.taxNoProvisionData}
                    </td>
                  </tr>
                )}
                {breakdownRows.map((r) => (
                  <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="whitespace-nowrap py-2 pr-3 font-semibold" style={{ color: "var(--ink-900)" }}>
                      {r.name}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3">{fmtM(r.chargeableIncome)}</td>
                    {isHk ? (
                      <>
                        <td className="whitespace-nowrap py-2 pr-3">{fmtM(r.tier1Profits)}</td>
                        <td className="whitespace-nowrap py-2 pr-3">{fmtM(r.tier2Profits)}</td>
                      </>
                    ) : (
                      <td className="whitespace-nowrap py-2 pr-3">{fmtM(r.exemptAmount)}</td>
                    )}
                    <td className="whitespace-nowrap py-2 pr-3">{fmtM(r.grossTax)}</td>
                    <td className="whitespace-nowrap py-2 pr-3">{fmtM(r.rebateAmount)}</td>
                    <td className="whitespace-nowrap py-2 pr-3 font-bold" style={{ color: "var(--ink-900)" }}>
                      {fmtM(r.netTaxPayable)}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3">{r.effectiveRatePct.toFixed(2)}%</td>
                  </tr>
                ))}
                {breakdownRows.length > 0 && (
                  <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="whitespace-nowrap py-2 pr-3 font-bold" style={{ color: "var(--ink-900)" }}>
                      {isZh ? "集团合计(仅供参考)" : "Group Total (for reference only)"}
                    </td>
                    <td colSpan={isHk ? 5 : 4}></td>
                    <td className="whitespace-nowrap py-2 pr-3 font-bold" style={{ color: "var(--ink-900)" }}>
                      {fmtM(groupTotal)}
                    </td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}
          <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: "var(--ink-400)" }}>
            {isHk
              ? isZh
                ? "香港税务局(IRD)不接受集团合并报税，每个法律主体(总部及各子公司)须独立提交利得税报税表(BIR51)。以上「集团合计」仅为管理层参考汇总，并非一份实际申报。"
                : "The IRD does not accept a consolidated group return — every legal entity (HQ and each subsidiary) files its own Profits Tax Return (BIR51). The \"Group Total\" above is a management reference sum only, not an actual filing."
              : isZh
                ? "新加坡税务局(IRAS)不接受集团合并纳税申报，每个法律主体(总部及各子公司)须独立申报。以上「集团合计」仅为管理层参考汇总，并非一份实际申报。"
                : "IRAS does not accept a consolidated group tax return — every legal entity (HQ and each subsidiary) files independently. The \"Group Total\" above is a management reference sum only, not an actual filing."}
          </p>
          <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: "var(--ink-400)" }}>
            {isHk
              ? isZh
                ? `应评税利润为管理层估算值（默认取自税前利润），未计入利得税调整项：香港按地域来源原则征税（离岸/境外来源利润可申请豁免）、资本性收益不征税、会计折旧须以折旧免税额替代、不可扣减开支须加回等。法团利得税两级制：首 ${HK_LOWER_TIER_CAP.toLocaleString("en-US")} 港元按 8.25%，其余按 16.5%；亏损可无限期结转。政府每年预算案的一次性利得税宽减（如 2025/26 课税年度建议为 100%、上限 3,000 港元）只减免最终税款，不减免暂缴税，请在「宽减比例/上限」按当年已通过的数字填写。实际应缴税款以税务局评税及税务顾问计算为准。`
                : `Assessable profits are a management ESTIMATE (defaulting to accounting profit before tax) and do not apply the profits-tax adjustments: Hong Kong taxes on a territorial basis (offshore / foreign-sourced profits can be excluded), capital gains are not taxed, accounting depreciation is replaced by depreciation allowances, and non-deductible expenses are added back. Two-tiered corporate rates: 8.25% on the first HK${HK_LOWER_TIER_CAP.toLocaleString("en-US")}, 16.5% on the rest; losses carry forward without time limit. The Budget's one-off profits tax reduction (e.g. YA 2025/26 proposed at 100%, capped at HK$3,000) reduces FINAL tax only, not provisional tax — enter the enacted figures under reduction % / cap. Actual tax is set by the IRD's assessment and your tax adviser.`
              : dict.m.taxEstimateDisclaimer}
          </p>
        </Card>
      )}

      {tab === "provision" && isHk && proFormaSections.length > 0 && (
        <KpiBreakdown
          sections={proFormaSections}
          locale={locale}
          unit={unit}
          heading={isZh ? "利得税计算表（Pro forma）" : "Profits tax computation (pro forma)"}
          hint={isZh ? "点击展开，逐项查看从会计利润到应缴利得税的计算过程，便于核对 BIR51 报税表。" : "Click an entity to see the step-by-step computation from accounting profit to tax payable, to check against the BIR51 return."}
        />
      )}

      <Card title={isZh ? "税务中心" : "Tax Center"}>
        <div className="mb-4 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="rounded-full px-3 py-1.5 text-[12px] font-bold"
              style={{ background: tab === t.id ? "var(--cat-1)" : "var(--surface-2)", color: tab === t.id ? "#fff" : "var(--ink-600)" }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "provision" && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border p-2.5" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              <Sparkles size={14} style={{ color: "var(--cat-1)" }} />
              <span className="text-[12px] font-semibold" style={{ color: "var(--ink-900)" }}>
                {isHk ? (isZh ? "从Xero已同步财务数据生成利得税草稿" : "Generate profits-tax drafts from Xero-synced financials") : isZh ? "从Xero已同步财务数据生成草稿" : "Generate drafts from Xero-synced financials"}
              </span>
              <input
                type="number"
                value={genYear}
                onChange={(e) => setGenYear(e.target.value)}
                className="w-[90px] rounded-lg border py-1.5 px-2.5 text-[12.3px]"
                style={{ borderColor: "var(--border-strong)", background: "var(--surface)", color: "var(--ink-900)" }}
              />
              <button
                onClick={generateDraftProvisions}
                disabled={genBusy}
                className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
                style={{ background: "var(--cat-1)" }}
              >
                {isZh ? "生成" : "Generate"}
              </button>
              {genMessage && (
                <span className="text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                  {genMessage}
                </span>
              )}
              <span className="basis-full text-[11px]" style={{ color: "var(--ink-400)" }}>
                {isZh
                  ? "为尚未有记录的主体，以该年度Xero已同步的净利润(税前)作为应纳税所得额估算值创建草稿 — 仅为起点，请审阅税务调整项后再核实。"
                  : "Creates a draft provision (chargeable income = that entity's Xero-synced net profit before tax for the year) for any entity that doesn't already have one — a starting point only, review tax adjustments before relying on it."}
              </span>
            </div>
            <CrudTable
              apiBase="/api/admin/corporate-tax-provisions"
              fields={provisionFields}
              tableKeys={provisionTableKeys}
              initialRows={provisions as unknown as Row[]}
              emptyLabel={dict.m.taxNoProvisionData}
              addLabel={isHk ? (isZh ? "新增利得税预提记录" : "Add profits tax provision") : isZh ? "新增预提记录" : "Add provision"}
            />
          </>
        )}
        {tab === "filing" && (
          <>
            <div className="mb-3 flex items-center gap-2 rounded-lg border p-2.5" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              <Sparkles size={14} style={{ color: "var(--cat-1)" }} />
              <span className="text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                {isHk
                  ? isZh
                    ? "香港没有 GST/增值税。系统按注册地版本自动跟踪：利得税报税表(BIR51，按课税年度)、雇主报税表(BIR56A + IR56B，每年4月1日发出、一个月内递交)、周年申报表(NAR1，注册成立周年日后42天内；需在「设置」填写成立日期)。到期日为估算，请按税务局当年通告核对并可直接修改。"
                    : "Hong Kong has no GST / VAT. The system tracks, per the country edition: the Profits Tax Return (BIR51, per year of assessment), the Employer's Return (BIR56A + IR56B, issued 1 April and due within one month) and the Annual Return (NAR1, within 42 days after the incorporation anniversary — set the date under Settings). Due dates are ESTIMATES: check them against the IRD's notice each year and edit as needed."
                  : isZh
                  ? "GST F5 行操作栏：闪光图标 = 从Xero发票/账单/贷项通知单自动估算销项/进项税额；清单图标 = 打开按 IRAS GST F5 栏位的明细清单，逐项核对（需已连接Xero并授权发票读取权限；大型主体可能需要1-3分钟）。"
                  : "GST F5 row actions: sparkle = auto-estimate output/input tax from Xero invoices, bills and credit notes; checklist = open the IRAS GST F5 breakdown to double-check every figure (needs Xero connected with the invoices-read permission; large entities can take 1-3 minutes)."}
              </span>
            </div>
            {estimateError && (
              <div className="mb-3 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: "color-mix(in srgb,var(--status-critical) 12%,transparent)", color: "var(--status-critical)" }}>
                {estimateError}
              </div>
            )}
            <CrudTable
              apiBase="/api/admin/tax-filings"
              fields={filingFields}
              tableKeys={filingTableKeys}
              initialRows={filings as unknown as Row[]}
              emptyLabel={dict.m.taxNoFilingData}
              addLabel={isZh ? "新增申报记录" : "Add filing"}
              rowActions={(row, refresh) => {
                if (!cfg.hasGst || row.type !== "GST_F5") return null;
                const id = String(row.id);
                const busy = estimatingId === id || breakdownLoadingId === id;
                return (
                  <>
                    <button
                      key="gst-breakdown"
                      onClick={() => viewBreakdown(id)}
                      disabled={busy}
                      title={isZh ? "IRAS GST F5 明细清单（核对用）" : "IRAS GST F5 breakdown (to double-check)"}
                      className="rounded-md p-1.5 disabled:opacity-50"
                      style={{ background: "color-mix(in srgb, var(--cat-2) 14%, transparent)", color: "var(--cat-2)" }}
                    >
                      <ListChecks size={13} />
                    </button>
                    <button
                      key="estimate-gst"
                      onClick={() => estimateGst(id, refresh)}
                      disabled={busy}
                      title={isZh ? "从Xero发票数据估算" : "Estimate from Xero invoices"}
                      className="rounded-md p-1.5 disabled:opacity-50"
                      style={{ background: "color-mix(in srgb, var(--cat-1) 14%, transparent)", color: "var(--cat-1)" }}
                    >
                      <Sparkles size={13} />
                    </button>
                  </>
                );
              }}
            />
            {(estimatingId || breakdownLoadingId) && (
              <div className="mt-3 text-[12px]" style={{ color: "var(--ink-400)" }}>
                {isZh ? "正在从Xero读取该季度的全部单据，请稍候（最长约5分钟）…" : "Reading the whole quarter's documents from Xero — please wait (up to ~5 minutes)…"}
              </div>
            )}
            {breakdown && <GstBreakdownPanel isZh={isZh} breakdown={breakdown} unit={unit} fmtM={fmtM} onClose={() => setBreakdown(null)} />}
          </>
        )}
        {tab === "adjust" && (
          <>
            <div className="mb-3 rounded-lg border p-2.5 text-[11.8px] leading-relaxed" style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--ink-600)" }}>
              {isZh
                ? "把会计利润调整为应评税利润：每一行属于某个「预提记录（主体 — 财政年度）」。会计折旧会自动加回，无需在此录入。加回类增加应评税利润，扣除类减少；金额一律输入正数，系统按类别决定方向。折旧免税额（机器及设备首年 60% + 每年 10%/20%/30%）、离岸利润及资本性利润的数字需来自你的固定资产登记册/税务顾问 — 系统无法自行判断。"
                : "Take accounting profit to assessable profits: every row belongs to a provision (entity — financial year). Accounting depreciation is added back automatically, so don't enter it here. Add-backs increase assessable profits and deductions reduce them; always enter a positive amount — the type sets the direction. Depreciation allowances (initial 60% + annual 10/20/30% on plant & machinery), offshore profits and capital profits have to come from your fixed-asset register or tax adviser — the system cannot judge them."}
            </div>
            {provisions.length === 0 ? (
              <p className="py-4 text-center text-[12px]" style={{ color: "var(--ink-400)" }}>
                {isZh ? "请先在「预提」页创建该主体该财政年度的利得税预提记录。" : "Create the profits tax provision for the entity and financial year first (Provision tab)."}
              </p>
            ) : (
              <CrudTable
                apiBase="/api/admin/tax-adjustments"
                fields={adjustmentFields}
                initialRows={adjustments as unknown as Row[]}
                emptyLabel={isZh ? "暂无税务调整" : "No tax adjustments yet"}
                addLabel={isZh ? "新增税务调整" : "Add tax adjustment"}
              />
            )}
          </>
        )}
        {tab === "xbrl" && acra && <AcraXbrlPanel locale={locale} years={acra.years} defaultYear={acra.defaultYear} registrationNo={acra.registrationNo} />}
        {tab === "deferred" && (
          <CrudTable
            apiBase="/api/admin/deferred-tax-items"
            fields={deferredFields}
            initialRows={deferredItems as unknown as Row[]}
            emptyLabel={dict.m.taxNoDeferredData}
            addLabel={isZh ? "新增递延所得税项目" : "Add deferred tax item"}
          />
        )}
      </Card>

      {isHk && (
        <Card title={isZh ? "香港合规指引（税务局 / 公司注册处 / 强积金局 / 会计师公会）" : "Hong Kong compliance guide (IRD · Companies Registry · MPFA · HKICPA)"}>
          <div className="space-y-3 text-[12.4px] leading-relaxed" style={{ color: "var(--ink-600)" }}>
            {(
              [
                [
                  isZh ? "利得税报税表 (BIR51)" : "Profits Tax Return (BIR51)",
                  isZh
                    ? "税务局每年4月发出，原则上一个月内递交；通过税务代表可按「分批延期计划」依财政年度结算日顺延：N 类（4月1日至11月30日结算）、D 类（12月结算）、M 类（1月至3月结算），具体日期由税务局每年通告。须连同经审计财务报表及税务计算表递交。香港按地域来源原则征税，法团利得税两级制（首200万港元 8.25%，其余 16.5%），关连实体只有一个可选用较低税率。"
                    : "Issued by the IRD each April and due within one month; tax representatives can use the Block Extension Scheme by year-end code — N (year-end 1 Apr–30 Nov), D (December), M (Jan–Mar) — with exact dates set by IRD circular each year. File with the audited financial statements and a tax computation. Territorial basis of tax; corporate two-tiered rates (8.25% on the first HK$2m, 16.5% on the rest), and only one connected entity may elect the lower rate.",
                ],
                [
                  isZh ? "暂缴利得税" : "Provisional profits tax",
                  isZh
                    ? "按上一课税年度的应评税利润计算，分期缴付；若预期本年利润低于上年应评税利润的 90% 等，可申请暂缴税「缓缴」。预算案的一次性宽减只减最终税款，不减暂缴税。"
                    : "Calculated on the previous year's assessed profits and paid in instalments per the IRD notice; a holdover can be applied for if profits are expected to be below 90% of the prior year's, among other grounds. The Budget's one-off reduction applies to final tax only, not provisional tax.",
                ],
                [
                  isZh ? "雇主报税表 (BIR56A + IR56B)" : "Employer's Return (BIR56A + IR56B)",
                  isZh
                    ? "每年4月1日发出，一个月内连同每名须申报雇员的 IR56B 一并递交（没有雇员也须递交并勾选「否」）；新雇员入职后3个月内递交 IR56E，雇员离职前一个月递交 IR56F。违规罚款最高 10,000 港元。"
                    : "Issued 1 April each year and filed within one month together with an IR56B for every reportable employee (even with no employees — tick NO); IR56E within 3 months of an employee starting, IR56F one month before cessation. Non-compliance carries a fine of up to HK$10,000.",
                ],
                [
                  isZh ? "强积金 (MPF)" : "Mandatory Provident Fund (MPF)",
                  isZh
                    ? "雇主与雇员各按有关入息的 5% 供款，月薪有关入息下限 7,100 港元、上限 30,000 港元（雇主每月最高 1,500 港元）；每月供款须于次月 10 日（遇周六/公众假期顺延）前缴交受托人，逾期附加费为欠款的 5%。强积金计入用工成本。"
                    : "Employer and employee each contribute 5% of relevant income, between HK$7,100 and HK$30,000 a month (employer maximum HK$1,500); contributions are due on or before the 10th of the following month (next working day if it falls on a Saturday or holiday), with a 5% surcharge on late payment. MPF is counted in employment cost.",
                ],
                [
                  isZh ? "周年申报表 (NAR1)" : "Annual Return (NAR1)",
                  isZh
                    ? "私人公司须在每年注册成立周年日后 42 天内向公司注册处递交，注册处无权延期；逾期须缴较高费用，且属刑事罪行。休眠公司可获豁免。请在「设置」填写注册成立日期以便自动跟踪。"
                    : "A private company must file with the Companies Registry within 42 days after each incorporation anniversary; the Registrar cannot extend this, late filing costs more and is an offence. Dormant companies are exempt. Set the incorporation date under Settings so it is tracked automatically.",
                ],
                [
                  isZh ? "审计与周年大会" : "Audit and AGM",
                  isZh
                    ? "香港公司须每年由 HKICPA 执业会计师审计。非公众公司附属公司的私人公司须在会计参照期结束后 9 个月内举行周年大会（可由书面决议取代）并向成员提交财务报表、董事会报告及核数师报告。"
                    : "A Hong Kong company must be audited every year by a practising HKICPA certified public accountant. A private company that is not a subsidiary of a public company holds its AGM within 9 months after the accounting reference period (written resolution is possible) and lays the financial statements, directors' report and auditor's report before the members.",
                ],
                [
                  isZh ? "会计准则" : "Accounting framework",
                  isZh
                    ? "HKFRS（与 IFRS 趋同）、HKFRS for Private Entities（以 IFRS for SMEs 为基础），或符合《公司条例》第359条报告豁免的私人公司可用 SME-FRF & SME-FRS（有附属公司/编制合并报表者不得使用）。可在「设置 → 集团设置」选择。"
                    : "HKFRS (converged with IFRS), HKFRS for Private Entities (based on IFRS for SMEs), or — for private companies using the Companies Ordinance s.359 reporting exemption — SME-FRF & SME-FRS (not available to a company with subsidiaries or for consolidated statements). Choose under Settings → Group Settings.",
                ],
                [
                  isZh ? "没有 GST / 增值税" : "No GST / VAT",
                  isZh ? "香港不征收 GST、增值税或销售税，因此没有 GST 申报与销项/进项税额。" : "Hong Kong has no GST, VAT or sales tax, so there are no GST returns or output / input tax.",
                ],
              ] as [string, string][]
            ).map(([title, body]) => (
              <div key={title}>
                <div className="font-bold" style={{ color: "var(--ink-900)" }}>
                  {title}
                </div>
                <p>{body}</p>
              </div>
            ))}
            <p className="text-[11px]" style={{ color: "var(--ink-400)" }}>
              {isZh
                ? "以上规则及数字已对照税务局、公司注册处、强积金计划管理局及香港会计师公会官方网页核对；预算案宽减、分批延期日期、强积金入息上下限等每年或每数年调整，请以官方最新公布为准。系统中的到期日为估算，可直接修改。"
                : "These rules and figures were checked against the IRD, Companies Registry, MPFA and HKICPA websites; Budget reductions, Block Extension dates and the MPF income limits change every year or every few years — treat the authorities' latest notices as final. Due dates in the tracker are estimates and can be edited."}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
