"use client";

import CrudTable, { type FieldConfig } from "@/components/admin/CrudTable";

type Row = Record<string, unknown>;

// The two small tables behind the joint-venture schedule: the venture itself, and one row of figures per financial year. Everything else
// on the page (carrying amount, recognised share, unrecognised losses, the Group adjustments) is worked out from these.
export default function JointVentureClient({ jointVentures, periods, isZh, baseCurrency }: { jointVentures: Row[]; periods: Row[]; isZh: boolean; baseCurrency: string }) {
  const t = (zh: string, en: string) => (isZh ? zh : en);
  const nameOf = (id: unknown) => String(jointVentures.find((j) => j.id === id)?.name ?? "—");

  const jvFields: FieldConfig[] = [
    { key: "name", label: t("合营企业名称", "Joint venture name"), type: "text" },
    { key: "country", label: t("注册国家/地区", "Country"), type: "text" },
    { key: "ownershipPct", label: t("持股比例 %", "Ownership %"), type: "number", step: "0.01" },
    { key: "currency", label: t("记账货币（三位代码，如 VND）", "Functional currency (3-letter code, e.g. VND)"), type: "text", required: true },
    { key: "acquiredOn", label: t("取得日期", "Acquired on"), type: "date" },
    { key: "investmentAccountName", label: t("总部 Xero 中的投资科目名称", "Investment account name in HQ's Xero"), type: "text" },
    { key: "notes", label: t("备注", "Notes"), type: "textarea" },
  ];

  const periodFields: FieldConfig[] = [
    { key: "jointVentureId", label: t("合营企业", "Joint venture"), type: "select", options: jointVentures.map((j) => ({ value: String(j.id), label: String(j.name) })), displayValue: (r) => nameOf(r.jointVentureId) },
    { key: "year", label: t("财政年度", "Financial year"), type: "number" },
    { key: "capitalAdded", label: t("本年投入资本（成本）", "Capital put in this year (cost)"), type: "number", step: "0.01" },
    { key: "jvNetResult", label: t(`合营企业全年净利润/(亏损)（100%，折算为${baseCurrency}）`, `JV net profit / (loss) for the year (100%, in ${baseCurrency})`), type: "number", step: "0.01" },
    { key: "jvNetAssets", label: t(`合营企业年末净资产/(负债)（100%，${baseCurrency}）`, `JV net assets / (liabilities) at year-end (100%, ${baseCurrency})`), type: "number", step: "0.01" },
    { key: "dividendsReceived", label: t("本年收到的股息", "Dividends received"), type: "number", step: "0.01" },
    { key: "translation", label: t("外币折算差额", "Translation movement"), type: "number", step: "0.01" },
    { key: "impairment", label: t("减值", "Impairment"), type: "number", step: "0.01" },
    { key: "hqLedgerCarrying", label: t("总部账上年末投资账面值（留空＝成本）", "HQ ledger carrying amount at year-end (blank = cost)"), type: "number", step: "0.01" },
    { key: "hqLedgerExpense", label: t("总部已在自身损益中计入的费用", "Charge HQ already booked in its own P&L"), type: "number", step: "0.01" },
    { key: "notes", label: t("备注", "Notes"), type: "textarea" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 text-[13px] font-bold" style={{ color: "var(--ink-900)" }}>
          {t("合营企业", "Joint ventures")}
        </div>
        <CrudTable apiBase="/api/admin/joint-ventures" fields={jvFields} initialRows={jointVentures} emptyLabel={t("尚未登记合营企业", "No joint venture registered yet")} addLabel={t("新增合营企业", "Add joint venture")} />
      </div>
      {jointVentures.length > 0 && (
        <div>
          <div className="mb-2 text-[13px] font-bold" style={{ color: "var(--ink-900)" }}>
            {t("按财政年度的数据（权益法的输入）", "Yearly figures (the inputs to the equity method)")}
          </div>
          <CrudTable apiBase="/api/admin/joint-venture-periods" fields={periodFields} initialRows={periods} emptyLabel={t("尚无年度数据", "No yearly figures yet")} addLabel={t("新增年度数据", "Add a year")} />
        </div>
      )}
    </div>
  );
}
