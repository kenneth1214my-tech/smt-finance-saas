import type { BreakdownRow, BreakdownSection } from "@/lib/treasury-breakdown";

// Workings and plain-language explanations behind the four Tax Center KPIs — estimated tax payable for the year,
// upcoming filings, overdue filings and net deferred tax — for both country editions (Singapore corporate income tax,
// Hong Kong profits tax). Pure: the page passes the same rows the tiles are computed from, so each panel re-adds to its tile.

const r2 = (n: number) => Math.round(n * 100) / 100 + 0;
const tt = (isZh: boolean) => (zh: string, en: string) => (isZh ? zh : en);
const DAY_MS = 86_400_000;

export interface TaxProvisionView {
  name: string; // entity
  taxRatePct: number;
  chargeableIncome: number; // Singapore: chargeable income; Hong Kong: accounting profit before tax
  // Singapore
  exemptAmount: number;
  taxableAfterExemption: number;
  grossTax: number;
  rebateAmount: number;
  netTaxPayable: number;
  effectiveRatePct: number;
  // Hong Kong schedule (absent for Singapore)
  hk?: {
    adjustmentsNet: number;
    lossesUtilised: number;
    assessableProfits: number;
    tier1Tax: number;
    tier2Tax: number;
  };
}
export interface TaxFilingView {
  name: string;
  typeLabel: string;
  periodLabel: string;
  dueDate: Date;
}
export interface DeferredView {
  name: string;
  year: number;
  description: string;
  temporaryDifference: number;
  deferredTax: number;
}

export function buildTaxKpiSections(args: {
  jurisdiction: "SG" | "HK";
  isZh: boolean;
  year: number;
  provisions: TaxProvisionView[]; // the provisions of `year` — the same rows the "tax payable" tile adds up
  upcoming: TaxFilingView[];
  overdue: TaxFilingView[];
  deferred: DeferredView[];
  now: Date;
}): BreakdownSection[] {
  const { jurisdiction, isZh, year, provisions, upcoming, overdue, deferred, now } = args;
  const t = tt(isZh);
  const hk = jurisdiction === "HK";
  const multi = provisions.length > 1;
  const cols = multi ? [...provisions.map((p) => p.name), t("合计", "Total")] : provisions.map((p) => p.name);
  const row = (label: string, pick: (p: TaxProvisionView) => number, extra?: Partial<BreakdownRow>): BreakdownRow => {
    const vals = provisions.map((p) => r2(pick(p)));
    return { label, values: multi ? [...vals, r2(vals.reduce((a, v) => a + v, 0))] : vals, ...extra };
  };
  const neg = (n: number) => -n + 0;
  const totalNet = r2(provisions.reduce((a, p) => a + p.netTaxPayable, 0));
  const days = (d: Date) => Math.ceil((d.getTime() - now.getTime()) / DAY_MS);
  const dateStr = (d: Date) => d.toISOString().slice(0, 10);

  // ---------- 1. Estimated tax payable ----------
  const payableRows: BreakdownRow[] = hk
    ? [
        row(t("会计税前利润", "Accounting profit before tax"), (p) => p.chargeableIncome),
        row(t("± 税务调整净额（含自动加回的会计折旧）", "± Net tax adjustments (incl. accounting depreciation added back automatically)"), (p) => p.hk?.adjustmentsNet ?? 0),
        row(t("－ 动用承前亏损", "− Losses brought forward utilised"), (p) => neg(p.hk?.lossesUtilised ?? 0)),
        row(t("＝ 应评税利润", "= Assessable profits"), (p) => p.hk?.assessableProfits ?? 0, { kind: "total" }),
        row(t("首 200 万港元部分的利得税（8.25%）", "Tax on the first HK$2m (8.25%)"), (p) => p.hk?.tier1Tax ?? 0),
        row(t("其余部分的利得税（16.5%）", "Tax on the rest (16.5%)"), (p) => p.hk?.tier2Tax ?? 0),
        row(t("＝ 宽减前利得税", "= Profits tax before reduction"), (p) => p.grossTax, { kind: "total" }),
        row(t("－ 利得税宽减", "− Profits tax reduction"), (p) => neg(p.rebateAmount)),
        row(t("＝ 预计应缴利得税", "= Estimated profits tax payable"), (p) => p.netTaxPayable, { kind: "total" }),
        {
          label: t("实际税率", "Effective rate"),
          values: [...provisions.map((p) => p.effectiveRatePct), ...(multi ? [(() => { const inc = provisions.reduce((a, p) => a + p.chargeableIncome, 0); return inc > 0 ? (totalNet / inc) * 100 : 0; })()] : [])],
          kind: "check",
          format: "pct",
        },
      ]
    : [
        row(t("应纳税所得额（估算）", "Chargeable income (estimate)"), (p) => p.chargeableIncome),
        row(t("－ 部分免税额（首 1 万元 75%、其后 19 万元 50%）", "− Partial tax exemption (75% of the first 10,000, 50% of the next 190,000)"), (p) => neg(p.exemptAmount)),
        row(t("＝ 免税后应税所得", "= Taxable income after exemption"), (p) => p.taxableAfterExemption, { kind: "total" }),
        { label: t("税率", "Tax rate"), values: [...provisions.map((p) => p.taxRatePct), ...(multi ? [null] : [])], kind: "muted", format: "pct" },
        row(t("＝ 回扣前税额", "= Tax before rebate"), (p) => p.grossTax, { kind: "total" }),
        row(t("－ 企业所得税回扣（按当年预算案，设有上限）", "− Corporate income tax rebate (set by each Budget, capped)"), (p) => neg(p.rebateAmount)),
        row(t("＝ 预计应缴所得税", "= Estimated net tax payable"), (p) => p.netTaxPayable, { kind: "total" }),
      ];

  const payable: BreakdownSection = {
    id: "payable",
    title: t(`${year} 年度预计应缴税额（集团）`, `Estimated tax payable for ${year} (group)`),
    result: totalNet,
    formula: hk
      ? t("各主体：（会计利润 ± 调整 － 承前亏损）= 应评税利润，按两级制税率计税（首200万港元 8.25%，其余 16.5%），再减利得税宽减；集团合计为各主体相加", "Per entity: (accounting profit ± adjustments − losses brought forward) = assessable profits, taxed at the two-tiered rates (8.25% on the first HK$2m, 16.5% on the rest), less the profits tax reduction; the group figure is the sum of the entities")
      : t("各主体：（应纳税所得额 － 部分免税额）× 税率，再减企业所得税回扣；集团合计为各主体相加", "Per entity: (chargeable income − partial exemption) × rate, less the corporate income tax rebate; the group figure is the sum of the entities"),
    cols,
    rows: payableRows,
    notes: [
      hk
        ? t("香港税务局不接受集团合并报税，每个法律主体各自递交利得税报税表；「合计」仅为管理层参考。关连实体中只有一个可选用两级制较低税率。", "The IRD does not accept a consolidated group return — each legal entity files its own; the total is a management reference only. Only one connected entity may elect the lower tier.")
        : t("新加坡税务局不接受集团合并报税，每个法律主体各自申报；「合计」仅为管理层参考。", "IRAS does not accept a consolidated group return — each legal entity files its own; the total is a management reference only."),
      t("这是管理层估算：应纳税所得额默认取自税前利润，未包含全部税务调整，实际税额以税务局评税和税务顾问计算为准。", "This is a management estimate: income starts from accounting profit before tax and does not include every tax adjustment — the actual tax is set by the tax authority's assessment and your tax adviser."),
      ...(provisions.length === 0 ? [t(`尚无 ${year} 年度的预提记录 — 在下方「预提」页新增，或点击「生成」按已同步利润自动创建草稿。`, `No provision exists for ${year} yet — add one in the Provision tab below, or click Generate to create drafts from the synced profit.`)] : []),
    ],
    explanation: {
      meaning: hk
        ? t("按目前利润估算本年度应向香港税务局缴交的利得税，用于提前预留资金和核对报税表。", "An estimate of the profits tax payable to the Inland Revenue Department for the year, to set money aside in advance and to check the return against.")
        : t("按目前利润估算本年度应向新加坡税务局缴交的企业所得税，用于提前预留资金和核对报税表。", "An estimate of the corporate income tax payable to IRAS for the year, to set money aside in advance and to check the return against."),
      interpretation: [
        t("亏损或应评税利润为 0 时，应缴税额为 0；亏损会按规定结转，抵减以后年度的利润。", "A loss or nil assessable profit gives nil tax; losses carry forward against later profits."),
        t("实际税率 = 应缴税额 ÷ 税前利润，通常低于标准税率，因为有低税率档或免税额、宽减/回扣。", "Effective rate = tax payable ÷ profit before tax; it is usually below the standard rate because of the lower tier or exemption and the reduction / rebate."),
        t("预算案的一次性宽减/回扣每年不同，需按当年已通过的数字填写。", "Each Budget's one-off reduction / rebate differs, so enter the figures actually enacted for the year."),
      ],
      current:
        provisions.length === 0
          ? undefined
          : t(`${year} 年度合计预计应缴 ${r2(totalNet).toLocaleString("en-US")}，涉及 ${provisions.length} 个主体。`, `The estimated total for ${year} is ${r2(totalNet).toLocaleString("en-US")} across ${provisions.length} ${provisions.length === 1 ? "entity" : "entities"}.`),
    },
  };

  // ---------- 2 & 3. Upcoming / overdue filings ----------
  const filingRows = (list: TaxFilingView[], overdueList: boolean): BreakdownRow[] => [
    ...list
      .slice()
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .map((f) => ({
        label: `${f.name} — ${f.typeLabel} ${f.periodLabel}`,
        hint: overdueList ? t(`到期日 ${dateStr(f.dueDate)}，已逾期`, `Due ${dateStr(f.dueDate)} — overdue`) : t(`到期日 ${dateStr(f.dueDate)}`, `Due ${dateStr(f.dueDate)}`),
        values: [overdueList ? -days(f.dueDate) : days(f.dueDate)],
        format: "count" as const,
      })),
  ];
  const upcomingSection: BreakdownSection = {
    id: "upcoming",
    title: t("待申报/待缴项数", "Filings & payments coming up"),
    result: upcoming.length,
    resultFormat: "count",
    formula: t("状态为「待申报」（未申报、未缴款）且到期日尚未过的申报/缴款事项数；右侧为距到期日的天数", "Filings and payments still outstanding (not filed, not paid) whose due date has not passed; the figure shown is the days left until the due date"),
    cols: [t("距到期日（天）", "Days until due")],
    rows: [...filingRows(upcoming, false), { label: t("待申报合计", "Total coming up"), values: [upcoming.length], kind: "total", format: "count" }],
    notes: [
      hk
        ? t("香港的申报（利得税报税表 BIR51、雇主报税表 BIR56A、周年申报表 NAR1）由系统按注册地版本自动生成，到期日为估算，请按税务局/公司注册处当年通告核对。", "The Hong Kong filings (Profits Tax Return BIR51, Employer's Return BIR56A, Annual Return NAR1) are created automatically for the country edition; due dates are estimates — check them against the IRD / Companies Registry notices each year.")
        : t("每季度的 GST F5 由系统按申报周期自动创建，如该主体未登记 GST 可删除。", "Each quarter's GST F5 is created automatically from the filing schedule; delete it if the entity isn't GST-registered."),
    ],
    explanation: {
      meaning: t("还没有处理、且尚未过期的税务申报与缴款事项，帮助提前安排人手与资金。", "Tax filings and payments not yet dealt with and not yet late — so people and cash can be arranged in advance."),
      interpretation: [
        t("到期日越近越应优先处理；状态在记录中标记为「已申报」或「已缴款」后会从这里消失。", "The nearer the due date, the higher the priority; a filing disappears from here once it is marked Filed or Paid."),
        t("提前递交通常不会有额外成本，逾期则可能产生罚款或附加费。", "Filing early normally costs nothing extra; filing late can bring penalties or surcharges."),
      ],
      current: upcoming.length === 0 ? t("目前没有待申报或待缴的事项。", "Nothing is currently waiting to be filed or paid.") : (() => {
        const next = upcoming.slice().sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];
        return t(`最近一项：${next.name} 的 ${next.typeLabel} ${next.periodLabel}，将在 ${days(next.dueDate)} 天后到期（${dateStr(next.dueDate)}）。`, `Next: ${next.name}'s ${next.typeLabel} ${next.periodLabel}, due in ${days(next.dueDate)} day(s) (${dateStr(next.dueDate)}).`);
      })(),
    },
  };
  const overdueSection: BreakdownSection = {
    id: "overdue",
    title: t("逾期未处理项数", "Overdue filings & payments"),
    result: overdue.length,
    resultFormat: "count",
    formula: t("状态仍为「待申报」但到期日已过的事项数；右侧为已逾期的天数", "Filings and payments still outstanding whose due date has passed; the figure shown is how many days late"),
    cols: [t("已逾期（天）", "Days overdue")],
    rows: [...filingRows(overdue, true), { label: t("逾期合计", "Total overdue"), values: [overdue.length], kind: "total", format: "count" }],
    notes: [t("状态由到期日自动判断：未标记「已申报/已缴款」的事项到期后会自动变为逾期。已经递交的请在记录里标记，以免误报。", "Status is worked out from the due date: anything not marked Filed or Paid becomes overdue after it. Mark filings that have actually been submitted so they are not reported by mistake.")],
    explanation: {
      meaning: t("已经过了到期日、但系统里仍未标记完成的税务事项。", "Tax matters past their due date and still not marked as done in the system."),
      interpretation: [
        t("应优先处理：先确认是否其实已递交（只是没更新状态），否则尽快申报并了解可能的罚款或附加费。", "Deal with these first: check whether it was actually filed (and only the status is stale), otherwise file as soon as possible and find out about any penalty or surcharge."),
        t("本系统的到期日部分为估算，请先核对官方通告里的实际到期日。", "Some due dates here are estimates — confirm the actual date in the official notice first."),
      ],
      current: overdue.length === 0 ? t("没有逾期事项。", "No overdue items.") : t(`有 ${overdue.length} 项已逾期，请尽快核对并处理。`, `${overdue.length} item(s) are overdue — please check and deal with them now.`),
    },
  };

  // ---------- 4. Net deferred tax ----------
  const netDeferred = r2(deferred.reduce((a, d) => a + d.deferredTax, 0));
  const deferredSection: BreakdownSection = {
    id: "deferred",
    title: t("递延所得税净额", "Net deferred tax"),
    result: netDeferred,
    formula: t("各递延所得税项目的递延税额之和（暂时性差异 × 税率）", "Sum of the deferred tax amount of every deferred tax item (temporary difference × tax rate)"),
    cols: [t("暂时性差异", "Temporary difference"), t("递延所得税", "Deferred tax")],
    rows: [
      ...deferred.map((d) => ({ label: `${d.name} — ${d.year} · ${d.description}`, values: [r2(d.temporaryDifference), r2(d.deferredTax)] })),
      { label: t("合计", "Total"), values: [r2(deferred.reduce((a, d) => a + d.temporaryDifference, 0)), netDeferred], kind: "total" as const },
    ],
    notes: [
      t("递延所得税项目由你根据会计师/审计师提供的数字手工录入：系统没有带税务账面价值的固定资产登记册，无法自行推算，也不会估算一个数字。", "Deferred tax items are entered by hand from the figures your accountant or auditor gives you: the system has no fixed-asset register with tax written-down values, so it cannot derive them and will not guess."),
      ...(deferred.length === 0 ? [t("目前没有录入任何递延所得税项目，所以为 0（并非测得的结果）。", "No deferred tax items are entered, so this is 0 — it is not a measured result.")] : []),
    ],
    explanation: {
      meaning: t("会计利润与应税利润之间的「时间性差异」带来的税额：它不是现在要缴的税，而是将来会多缴（负债）或少缴（资产）的税。", "The tax effect of timing differences between accounting profit and taxable profit: not tax due now, but tax that will be paid more (a liability) or less (an asset) in future."),
      interpretation: [
        t("典型来源：会计折旧与税务折旧免税额不同、准备金暂未获税务扣减等。", "Typical sources: accounting depreciation versus tax depreciation allowances, and provisions not yet deductible for tax."),
        t("正数一般表示递延所得税负债，负数表示递延所得税资产（符号以录入时为准）。", "A positive figure generally means a deferred tax liability and a negative one a deferred tax asset (sign as entered)."),
      ],
      current: deferred.length === 0 ? undefined : t(`净额 ${netDeferred.toLocaleString("en-US")}，来自 ${deferred.length} 个项目。`, `Net ${netDeferred.toLocaleString("en-US")} from ${deferred.length} item(s).`),
    },
  };

  return [payable, upcomingSection, overdueSection, deferredSection];
}
