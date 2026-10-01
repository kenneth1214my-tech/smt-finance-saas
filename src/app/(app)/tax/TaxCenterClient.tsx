"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import type { Subsidiary, CorporateTaxProvision, TaxFiling, DeferredTaxItem } from "@prisma/client";
import type { Locale, DICTIONARIES } from "@/lib/i18n/dictionaries";
import { fmtMoney } from "@/lib/i18n/dictionaries";
import { localizedName } from "@/lib/localize";
import { computeCorporateTax, effectiveFilingStatus, type TaxFilingStatusComputed } from "@/lib/tax";
import Card from "@/components/ui/Card";
import CrudTable, { type FieldConfig } from "@/components/admin/CrudTable";

type Dict = (typeof DICTIONARIES)[Locale];
type Row = Record<string, unknown>;
type ProvisionRow = CorporateTaxProvision & { subsidiary: Subsidiary | null };
type FilingRow = TaxFiling & { subsidiary: Subsidiary | null };
type DeferredRow = DeferredTaxItem & { subsidiary: Subsidiary | null };

const TYPE_OPTIONS = [
  { value: "ECI", label: "ECI" },
  { value: "FORM_C_S", label: "Form C-S/C" },
  { value: "GST_F5", label: "GST F5" },
];
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
  locale,
  unit,
  dict,
  subsidiaries,
  provisions,
  filings,
  deferredItems,
  netProfitByEntity,
}: {
  locale: Locale;
  unit: string;
  dict: Dict;
  subsidiaries: Subsidiary[];
  provisions: ProvisionRow[];
  filings: FilingRow[];
  deferredItems: DeferredRow[];
  netProfitByEntity: Record<string, Record<number, number>>;
}) {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const [tab, setTab] = useState<"provision" | "filing" | "deferred">("provision");
  const fmtM = (n: number) => fmtMoney(n, locale);
  const router = useRouter();
  const [genYear, setGenYear] = useState(String(new Date().getFullYear()));
  const [genBusy, setGenBusy] = useState(false);
  const [genMessage, setGenMessage] = useState("");
  const [estimatingId, setEstimatingId] = useState<string | null>(null);
  const [estimateError, setEstimateError] = useState("");

  async function estimateGst(filingId: string, refresh: () => void) {
    setEstimatingId(filingId);
    setEstimateError("");
    const res = await fetch(`/api/admin/tax-filings/${filingId}/estimate-gst`, { method: "POST" });
    setEstimatingId(null);
    if (res.ok) {
      refresh();
      return;
    }
    const body = await res.json().catch(() => ({}));
    setEstimateError(
      body.error === "xero_not_connected"
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
              : 'Period label isn\'t in the auto-generated "YYYY QN" format, so it can\'t be auto-estimated'
            : (body.message as string | undefined) || (isZh ? "估算失败" : "Estimate failed")
    );
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
          notes: isZh ? "根据Xero已同步的净利润(税前)自动生成草稿，请核对税务调整项后再确认" : "Draft generated from Xero-synced net profit before tax — review tax adjustments before relying on this figure",
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
    { key: "chargeableIncome", label: `${dict.m.taxChargeableIncome} (${unit})`, type: "number", step: "0.01" },
    { key: "taxRatePct", label: isZh ? "税率 %" : "Tax Rate %", type: "number", step: "0.01" },
    { key: "rebatePct", label: isZh ? "回扣比例 %" : "Rebate %", type: "number", step: "0.01" },
    { key: "rebateCap", label: `${isZh ? "回扣上限" : "Rebate Cap"} (${unit})`, type: "number", step: "0.01" },
    { key: "notes", label: isZh ? "备注" : "Notes", type: "textarea" },
  ];
  const provisionTableKeys = ["subsidiaryId", "year", "chargeableIncome", "taxRatePct", "rebatePct", "rebateCap"];

  const filingFields: FieldConfig[] = [
    { key: "subsidiaryId", label: dict.m.taxEntity, type: "select", options: subsidiaryOrHqOptions, displayValue: subsidiaryOrHqLabel },
    { key: "type", label: isZh ? "类型" : "Type", type: "select", options: TYPE_OPTIONS },
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
  const filingTableKeys = ["subsidiaryId", "type", "periodLabel", "dueDate", "amount", "status"];

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
    { id: "deferred", label: dict.m.taxDeferredCard },
  ];

  const currentYear = new Date().getFullYear();
  const latestYear = provisions.length > 0 ? Math.max(...provisions.map((p) => p.year)) : currentYear;
  const breakdownRows = provisions
    .filter((p) => p.year === latestYear)
    .map((p) => ({
      id: p.id,
      name: p.subsidiary ? localizedName(p.subsidiary, locale) : dict.m.taxGroupHQ,
      ...computeCorporateTax(Number(p.chargeableIncome), Number(p.taxRatePct), Number(p.rebatePct), Number(p.rebateCap)),
    }))
    .sort((a, b) => b.netTaxPayable - a.netTaxPayable);
  const groupTotal = breakdownRows.reduce((sum, r) => sum + r.netTaxPayable, 0);

  return (
    <div className="space-y-4">
      {tab === "provision" && (
        <Card title={`${dict.m.taxProvisionBreakdownCard} (${latestYear})`} unit={unit}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.6px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold" style={{ color: "var(--ink-400)" }}>
                  <th className="pb-2 pr-3">{dict.m.taxEntity}</th>
                  <th className="pb-2 pr-3">{dict.m.taxChargeableIncome}</th>
                  <th className="pb-2 pr-3">{dict.m.taxExemptAmount}</th>
                  <th className="pb-2 pr-3">{dict.m.taxGrossTax}</th>
                  <th className="pb-2 pr-3">{dict.m.taxRebateAmount}</th>
                  <th className="pb-2 pr-3">{dict.m.taxNetPayable}</th>
                  <th className="pb-2 pr-3">{dict.m.taxEffectiveRate}</th>
                </tr>
              </thead>
              <tbody>
                {breakdownRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-[12px]" style={{ color: "var(--ink-400)" }}>
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
                    <td className="whitespace-nowrap py-2 pr-3">{fmtM(r.exemptAmount)}</td>
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
                    <td colSpan={4}></td>
                    <td className="whitespace-nowrap py-2 pr-3 font-bold" style={{ color: "var(--ink-900)" }}>
                      {fmtM(groupTotal)}
                    </td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: "var(--ink-400)" }}>
            {isZh
              ? "新加坡税务局(IRAS)不接受集团合并纳税申报，每个法律主体(总部及各子公司)须独立申报。以上「集团合计」仅为管理层参考汇总，并非一份实际申报。"
              : "IRAS does not accept a consolidated group tax return — every legal entity (HQ and each subsidiary) files independently. The \"Group Total\" above is a management reference sum only, not an actual filing."}
          </p>
          <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: "var(--ink-400)" }}>
            {dict.m.taxEstimateDisclaimer}
          </p>
        </Card>
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
                {isZh ? "从Xero已同步财务数据生成草稿" : "Generate drafts from Xero-synced financials"}
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
              addLabel={isZh ? "新增预提记录" : "Add provision"}
            />
          </>
        )}
        {tab === "filing" && (
          <>
            <div className="mb-3 flex items-center gap-2 rounded-lg border p-2.5" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              <Sparkles size={14} style={{ color: "var(--cat-1)" }} />
              <span className="text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                {isZh
                  ? "点击 GST F5 行操作栏中的 图标，从Xero发票/账单数据自动估算销项/进项税额（需已连接Xero，且已授权发票读取权限）。"
                  : "Click the icon in a GST F5 row's actions to auto-estimate output/input tax from Xero invoices/bills (requires Xero connected with the invoices-read permission granted)."}
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
                if (row.type !== "GST_F5") return null;
                const busy = estimatingId === String(row.id);
                return (
                  <button
                    key="estimate-gst"
                    onClick={() => estimateGst(String(row.id), refresh)}
                    disabled={busy}
                    title={isZh ? "从Xero发票数据估算" : "Estimate from Xero invoices"}
                    className="rounded-md p-1.5 disabled:opacity-50"
                    style={{ background: "color-mix(in srgb, var(--cat-1) 14%, transparent)", color: "var(--cat-1)" }}
                  >
                    <Sparkles size={13} />
                  </button>
                );
              }}
            />
          </>
        )}
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
    </div>
  );
}
