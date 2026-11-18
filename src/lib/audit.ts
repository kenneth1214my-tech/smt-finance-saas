import "server-only";
import { db } from "@/lib/db";
import { effectiveRiskRating, worse, type RiskSeverity } from "@/lib/risk-rating";
import { localizedName } from "@/lib/localize";
import type { Locale } from "@/lib/i18n/dictionaries";
import { loadLedgerAudit } from "@/lib/ledger-audit-data";
import { buildCorrections } from "@/lib/ledger-corrections";
import { loadJointVentures } from "@/lib/joint-venture-data";

// Scope note: this module only detects exceptions computable from data that actually exists in
// this schema — MonthlyFinancial (aggregate monthly totals), ARCustomer/Payable (balance + aging
// snapshot, no per-invoice detail), Budget (annual rate), Subsidiary/Organization equity/debt
// ratio, and User roles. It deliberately does NOT attempt journal-entry review, PO-to-invoice
// matching, payroll audit, duplicate-invoice detection, or fine-grained segregation-of-duties
// (creator vs. approver) analysis — none of that data exists here, and fabricating findings
// against data that isn't real would violate this project's standing rule to never present fake
// numbers as real. Every finding below is traceable to a specific real row.

const AREA_CODE: Record<string, string> = { ar: "AR", ap: "AP", budget: "BUD", debt: "DEBT", risk: "RISK", sod: "SOD", ledger: "LED" };

// entityLabel is captured as real, already-localized text at detection time (see the isZh
// branches throughout this file), not a stable locale-independent key — a scan run in English
// stores "Group HQ", one run in Chinese (or Traditional Chinese) stores "集团总部". Both literal
// values must be checked here so scope filtering (Group HQ vs. Subsidiary) works correctly
// regardless of which locale was active when a given finding was created.
export const HQ_ENTITY_LABELS = ["集团总部", "Group HQ"];
export function isHqEntityLabel(label: string | null): boolean {
  return label !== null && HQ_ENTITY_LABELS.includes(label);
}
export type AuditScope = "all" | "hq" | "subsidiary";
export function matchesAuditScope(entityLabel: string | null, scope: AuditScope): boolean {
  if (scope === "all") return true;
  const isHq = isHqEntityLabel(entityLabel);
  return scope === "hq" ? isHq : !isHq && entityLabel !== null;
}

function severityFromRiskSeverity(s: RiskSeverity): "LOW" | "MEDIUM" | "HIGH" {
  if (s === "CRITICAL") return "HIGH";
  if (s === "SERIOUS") return "MEDIUM";
  return "LOW"; // WARNING
}

interface DraftFinding {
  area: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  entityLabel: string | null;
  transactionRef: string | null;
  amount: number | null;
  criteria: string;
  condition: string;
  evidence: string;
  riskImpact: string;
  recommendation: string;
  dedupKey: string;
}

async function detectARExceptions(organizationId: string, locale: Locale): Promise<DraftFinding[]> {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const customers = await db.aRCustomer.findMany({ where: { organizationId }, include: { subsidiary: true } });
  const findings: DraftFinding[] = [];
  const totalAR = customers.reduce((a, c) => a + Number(c.balance), 0);

  for (const c of customers) {
    const name = isZh ? c.nameZh : c.nameEn;
    const entity = c.subsidiary ? localizedName(c.subsidiary, locale) : isZh ? "集团总部" : "Group HQ";
    if (c.agingDays >= 180) {
      findings.push({
        area: "ar",
        severity: "HIGH",
        entityLabel: entity,
        transactionRef: name,
        amount: Number(c.balance),
        criteria: isZh ? "应收账款账龄不应超过180天而无回收行动" : "AR balances should not remain outstanding 180+ days without collection action",
        condition: isZh ? `客户「${name}」应收余额 ${Number(c.balance).toLocaleString()} 已逾期 ${c.agingDays} 天` : `Customer "${name}" has an outstanding balance of ${Number(c.balance).toLocaleString()}, aged ${c.agingDays} days`,
        evidence: `ARCustomer id=${c.id}, balance=${c.balance}, agingDays=${c.agingDays}, status=${c.status}`,
        riskImpact: isZh ? "长期未收回的应收账款存在坏账风险，可能高估资产价值" : "Long-outstanding receivables carry bad-debt risk and may overstate reported asset value",
        recommendation: isZh ? "跟进催收进度，评估是否需要计提坏账准备" : "Follow up on collection status and assess whether a bad-debt provision is warranted",
        dedupKey: `ar-aging-${c.id}`,
      });
    } else if (c.agingDays >= 90) {
      findings.push({
        area: "ar",
        severity: "MEDIUM",
        entityLabel: entity,
        transactionRef: name,
        amount: Number(c.balance),
        criteria: isZh ? "应收账款账龄超过90天应有跟进记录" : "AR balances aged over 90 days should have documented follow-up",
        condition: isZh ? `客户「${name}」应收余额 ${Number(c.balance).toLocaleString()} 已逾期 ${c.agingDays} 天` : `Customer "${name}" has an outstanding balance of ${Number(c.balance).toLocaleString()}, aged ${c.agingDays} days`,
        evidence: `ARCustomer id=${c.id}, balance=${c.balance}, agingDays=${c.agingDays}, status=${c.status}`,
        riskImpact: isZh ? "存在回收延迟风险" : "Elevated risk of delayed collection",
        recommendation: isZh ? "跟进催收进度" : "Follow up on collection status",
        dedupKey: `ar-aging-${c.id}`,
      });
    }
  }

  if (totalAR > 0) {
    for (const c of customers) {
      const share = Number(c.balance) / totalAR;
      if (share > 0.4) {
        const name = isZh ? c.nameZh : c.nameEn;
        findings.push({
          area: "ar",
          severity: "MEDIUM",
          entityLabel: c.subsidiary ? localizedName(c.subsidiary, locale) : isZh ? "集团总部" : "Group HQ",
          transactionRef: name,
          amount: Number(c.balance),
          criteria: isZh ? "单一客户应收账款集中度不宜过高" : "AR concentration in a single customer should not be excessive",
          condition: isZh ? `客户「${name}」占应收账款总额的 ${(share * 100).toFixed(1)}%` : `Customer "${name}" represents ${(share * 100).toFixed(1)}% of total AR`,
          evidence: `ARCustomer id=${c.id}, balance=${c.balance}; total AR=${totalAR}`,
          riskImpact: isZh ? "客户集中度过高，单一客户违约将对现金流造成重大影响" : "High customer concentration means a single default would materially impact cash flow",
          recommendation: isZh ? "评估该客户的信用状况，考虑分散客户结构" : "Assess this customer's creditworthiness and consider diversifying the customer base",
          dedupKey: `ar-conc-${c.id}`,
        });
      }
    }
  }
  return findings;
}

async function detectAPExceptions(organizationId: string, locale: Locale): Promise<DraftFinding[]> {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const payables = await db.payable.findMany({ where: { organizationId }, include: { subsidiary: true } });
  const findings: DraftFinding[] = [];
  for (const p of payables) {
    const name = isZh ? p.nameZh : p.nameEn;
    const entity = p.subsidiary ? localizedName(p.subsidiary, locale) : isZh ? "集团总部" : "Group HQ";
    if (p.agingDays >= 180) {
      findings.push({
        area: "ap",
        severity: "HIGH",
        entityLabel: entity,
        transactionRef: name,
        amount: Number(p.balance),
        criteria: isZh ? "应付账款不应长期逾期未付而无说明" : "AP balances should not remain unpaid 180+ days without documented reason",
        condition: isZh ? `供应商「${name}」应付余额 ${Number(p.balance).toLocaleString()} 已逾期 ${p.agingDays} 天` : `Vendor "${name}" has an outstanding balance of ${Number(p.balance).toLocaleString()}, aged ${p.agingDays} days`,
        evidence: `Payable id=${p.id}, balance=${p.balance}, agingDays=${p.agingDays}, status=${p.status}`,
        riskImpact: isZh ? "可能影响供应商关系，或存在未入账的争议/延迟付款原因" : "May strain vendor relationships, or indicate an unrecorded dispute or payment delay",
        recommendation: isZh ? "核实逾期原因，必要时安排付款" : "Verify the reason for the delay and arrange payment if warranted",
        dedupKey: `ap-aging-${p.id}`,
      });
    } else if (p.agingDays >= 90) {
      findings.push({
        area: "ap",
        severity: "MEDIUM",
        entityLabel: entity,
        transactionRef: name,
        amount: Number(p.balance),
        criteria: isZh ? "应付账款超过90天应有跟进说明" : "AP balances aged over 90 days should have a documented reason",
        condition: isZh ? `供应商「${name}」应付余额 ${Number(p.balance).toLocaleString()} 已逾期 ${p.agingDays} 天` : `Vendor "${name}" has an outstanding balance of ${Number(p.balance).toLocaleString()}, aged ${p.agingDays} days`,
        evidence: `Payable id=${p.id}, balance=${p.balance}, agingDays=${p.agingDays}, status=${p.status}`,
        riskImpact: isZh ? "存在付款延迟风险" : "Elevated risk of payment delay",
        recommendation: isZh ? "核实逾期原因" : "Verify the reason for the delay",
        dedupKey: `ap-aging-${p.id}`,
      });
    }
  }
  return findings;
}

async function detectBudgetVariance(organizationId: string, year: number, locale: Locale): Promise<DraftFinding[]> {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const [budgets, subsidiaries, organization, monthly] = await Promise.all([
    db.budget.findMany({ where: { organizationId, year } }),
    db.subsidiary.findMany({ where: { organizationId } }),
    db.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    db.monthlyFinancial.findMany({ where: { organizationId, year } }),
  ]);
  const findings: DraftFinding[] = [];
  for (const b of budgets) {
    const revenueBudget = Number(b.revenueBudget);
    if (revenueBudget <= 0) continue;
    const actual = monthly.filter((m) => m.subsidiaryId === b.subsidiaryId).reduce((a, r) => a + Number(r.revenue), 0);
    const variancePct = ((actual - revenueBudget) / revenueBudget) * 100;
    const budgetSub = b.subsidiaryId ? subsidiaries.find((s) => s.id === b.subsidiaryId) : null;
    if (b.subsidiaryId && !budgetSub) continue; // subsidiary no longer exists — skip rather than guess a label
    const entityLabel = budgetSub ? localizedName(budgetSub, locale) : isZh ? "集团总部" : "Group HQ";
    if (Math.abs(variancePct) >= 40) {
      findings.push({
        area: "budget",
        severity: "HIGH",
        entityLabel,
        transactionRef: isZh ? `${year}年营收预算` : `${year} Revenue Budget`,
        amount: actual - revenueBudget,
        criteria: isZh ? "实际营收与预算的偏差不宜超过40%" : "Actual revenue should not deviate from budget by more than 40%",
        condition: isZh
          ? `${entityLabel} ${year}年实际营收 ${actual.toLocaleString()}，预算 ${revenueBudget.toLocaleString()}，偏差 ${variancePct >= 0 ? "+" : ""}${variancePct.toFixed(1)}%`
          : `${entityLabel} ${year} actual revenue ${actual.toLocaleString()} vs. budget ${revenueBudget.toLocaleString()}, variance ${variancePct >= 0 ? "+" : ""}${variancePct.toFixed(1)}%`,
        evidence: `Budget id=${b.id} revenueBudget=${b.revenueBudget}; MonthlyFinancial actual revenue sum=${actual} for year=${year}`,
        riskImpact: isZh ? "预算编制或经营执行可能存在重大偏差，影响预算作为管理工具的可靠性" : "Suggests a material planning or execution gap, undermining the budget's reliability as a management tool",
        recommendation: isZh ? "复核预算编制假设与实际经营情况，分析偏差原因" : "Review budgeting assumptions against actual operating conditions and analyze the cause of the variance",
        dedupKey: `budget-var-${b.id}-${year}`,
      });
    } else if (Math.abs(variancePct) >= 20) {
      findings.push({
        area: "budget",
        severity: "MEDIUM",
        entityLabel,
        transactionRef: isZh ? `${year}年营收预算` : `${year} Revenue Budget`,
        amount: actual - revenueBudget,
        criteria: isZh ? "实际营收与预算的偏差不宜超过20%" : "Actual revenue should not deviate from budget by more than 20%",
        condition: isZh
          ? `${entityLabel} ${year}年实际营收 ${actual.toLocaleString()}，预算 ${revenueBudget.toLocaleString()}，偏差 ${variancePct >= 0 ? "+" : ""}${variancePct.toFixed(1)}%`
          : `${entityLabel} ${year} actual revenue ${actual.toLocaleString()} vs. budget ${revenueBudget.toLocaleString()}, variance ${variancePct >= 0 ? "+" : ""}${variancePct.toFixed(1)}%`,
        evidence: `Budget id=${b.id} revenueBudget=${b.revenueBudget}; MonthlyFinancial actual revenue sum=${actual} for year=${year}`,
        riskImpact: isZh ? "预算与实际存在明显偏差" : "Notable gap between budget and actual",
        recommendation: isZh ? "分析偏差原因" : "Analyze the cause of the variance",
        dedupKey: `budget-var-${b.id}-${year}`,
      });
    }
  }
  void organization;
  return findings;
}

function debtRatioFinding(entityLabel: string, equity: number, debtRatio: number, refKey: string, isZh: boolean): DraftFinding | null {
  if (equity === 0 && debtRatio === 0) return null; // no balance sheet data on file
  let severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null = null;
  if (debtRatio >= 70) severity = "CRITICAL";
  else if (debtRatio >= 55) severity = "HIGH";
  else if (debtRatio >= 40) severity = "MEDIUM";
  if (!severity) return null;
  return {
    area: "debt",
    severity,
    entityLabel,
    transactionRef: isZh ? "资产负债率" : "Debt Ratio",
    amount: null,
    criteria: isZh ? "资产负债率不宜超过40%（≥55% 高，≥70% 危急）" : "Debt ratio should not exceed 40% (≥55% high, ≥70% critical)",
    condition: isZh ? `${entityLabel} 资产负债率为 ${debtRatio.toFixed(1)}%` : `${entityLabel} debt ratio is ${debtRatio.toFixed(1)}%`,
    evidence: isZh ? `equity=${equity}, debtRatio=${debtRatio}` : `equity=${equity}, debtRatio=${debtRatio}`,
    riskImpact: isZh ? "偿债能力压力较大，财务杠杆风险上升" : "Elevated solvency pressure and rising financial leverage risk",
    recommendation: isZh ? "评估融资结构，制定降杠杆计划" : "Review the financing structure and develop a deleveraging plan",
    dedupKey: `debt-${refKey}`,
  };
}

async function detectDebtRatioExceptions(organizationId: string, locale: Locale): Promise<DraftFinding[]> {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const [subsidiaries, organization] = await Promise.all([
    db.subsidiary.findMany({ where: { organizationId } }),
    db.organization.findUniqueOrThrow({ where: { id: organizationId } }),
  ]);
  const findings: DraftFinding[] = [];
  for (const s of subsidiaries) {
    const f = debtRatioFinding(localizedName(s, locale), Number(s.equity), Number(s.debtRatio), s.id, isZh);
    if (f) findings.push(f);
  }
  const hqF = debtRatioFinding(isZh ? "集团总部" : "Group HQ", Number(organization.equity), Number(organization.debtRatio), "hq", isZh);
  if (hqF) findings.push(hqF);
  return findings;
}

async function detectRiskRatingDivergence(organizationId: string, year: number, locale: Locale): Promise<DraftFinding[]> {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const [subsidiaries, curMonthly, prevMonthly] = await Promise.all([
    db.subsidiary.findMany({ where: { organizationId } }),
    db.monthlyFinancial.findMany({ where: { organizationId, year } }),
    db.monthlyFinancial.findMany({ where: { organizationId, year: year - 1 } }),
  ]);
  const findings: DraftFinding[] = [];
  const hqLabel = isZh ? "集团总部" : "Group HQ";

  function check(id: string, name: string, manual: RiskSeverity, revenue: number, netProfit: number, prevRevenue: number) {
    const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
    const yoy = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;
    const marginForRisk = revenue > 0 ? netMargin : netProfit < 0 ? -100 : 0;
    const computed = effectiveRiskRating("GOOD", yoy ?? 0, marginForRisk);
    if (worse(manual, computed) !== manual) {
      findings.push({
        area: "risk",
        severity: severityFromRiskSeverity(computed),
        entityLabel: name,
        transactionRef: isZh ? "风险评级" : "Risk Rating",
        amount: netProfit,
        criteria: isZh ? "手动风险评级应反映最新的经营和财务数据" : "The manually recorded risk rating should reflect current operating and financial data",
        condition: isZh
          ? `${name} 当前手动评级为「${manual}」，但基于同比增速(${yoy === null ? "无数据" : yoy.toFixed(1) + "%"})与净利率(${netMargin.toFixed(1)}%)的系统计算评级为「${computed}」`
          : `${name}'s manually recorded rating is "${manual}", but the system-computed rating from YoY growth (${yoy === null ? "N/A" : yoy.toFixed(1) + "%"}) and net margin (${netMargin.toFixed(1)}%) is "${computed}"`,
        evidence: `MonthlyFinancial year=${year} revenue=${revenue} netProfit=${netProfit}; year=${year - 1} revenue=${prevRevenue}; manual riskRating=${manual}`,
        riskImpact: isZh ? "手动评级未及时更新，可能导致管理层低估该主体的实际风险" : "A stale manual rating risks management underestimating this entity's actual risk exposure",
        recommendation: isZh ? "更新该子公司的风险评级字段以反映实际情况" : "Update this entity's risk rating field to reflect actual conditions",
        dedupKey: `risk-div-${id}-${year}`,
      });
    }
  }

  for (const s of subsidiaries) {
    const cur = curMonthly.filter((m) => m.subsidiaryId === s.id);
    if (cur.length === 0) continue;
    const prev = prevMonthly.filter((m) => m.subsidiaryId === s.id);
    check(
      s.id,
      localizedName(s, locale),
      s.riskRating,
      cur.reduce((a, r) => a + Number(r.revenue), 0),
      cur.reduce((a, r) => a + Number(r.netProfit), 0),
      prev.reduce((a, r) => a + Number(r.revenue), 0)
    );
  }
  // Group HQ (subsidiaryId: null) has no stored manual riskRating field of its own — mirrors the
  // HQ_PSEUDO_SUB pattern already used on /profit, /sub, /ops, where HQ's baseline is treated as
  // "GOOD" and only ever escalated by real computed signals, never assumed risk-free by omission.
  const hqCur = curMonthly.filter((m) => !m.subsidiaryId);
  if (hqCur.length > 0) {
    const hqPrev = prevMonthly.filter((m) => !m.subsidiaryId);
    check(
      "__hq__",
      hqLabel,
      "GOOD",
      hqCur.reduce((a, r) => a + Number(r.revenue), 0),
      hqCur.reduce((a, r) => a + Number(r.netProfit), 0),
      hqPrev.reduce((a, r) => a + Number(r.revenue), 0)
    );
  }
  return findings;
}

// Deferred revenue / prepayment / accrual accounts: every check that comes back "warn" or "fail" becomes a finding (see lib/ledger-audit.ts).
async function detectLedgerExceptions(organizationId: string, locale: Locale): Promise<DraftFinding[]> {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const results = await loadLedgerAudit(organizationId, locale);
  const groupName = (g: string) => (g === "DEFERRED_REVENUE" ? (isZh ? "递延收入" : "Deferred revenue") : g === "PREPAYMENT" ? (isZh ? "预付款项" : "Prepayments") : isZh ? "应计项目" : "Accruals");
  const drafts = buildCorrections(results, isZh, new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10));
  const out: DraftFinding[] = [];
  for (const entity of results) {
    for (const g of entity.groups) {
      for (const c of g.checks) {
        if (c.status !== "warn" && c.status !== "fail") continue;
        const draft = drafts.find((d) => d.id === `${entity.id ?? "hq"}|${g.group}|${c.account}|${c.id}`);
        const journal = draft
          ? (isZh ? " 草稿更正分录（需确认原因后过账）：" : " Draft correcting journal (post only after confirming the cause): ") +
            draft.primary.lines.map((l) => (l.debit ? (isZh ? "借 " : "Dr ") : isZh ? "贷 " : "Cr ") + l.account + " " + (l.debit || l.credit).toFixed(2)).join(isZh ? "；" : "; ") + "."
          : "";
        out.push({
          area: "ledger",
          severity: c.status === "fail" ? "HIGH" : "MEDIUM",
          entityLabel: entity.label,
          transactionRef: c.account ?? groupName(g.group),
          amount: c.amount,
          criteria: c.criteria,
          condition: c.detail,
          evidence: `Xero balance sheet (AccountBalanceMonthly) — ${entity.label} / ${g.group}${c.account ? " / " + c.account : ""}, latest month-end ${g.latestKey ?? "n/a"}; check "${c.id}"`,
          riskImpact: c.risk,
          recommendation: c.recommendation + journal,
          dedupKey: `ledger|${entity.id ?? "hq"}|${g.group}|${c.id}|${c.account ?? ""}`,
        });
      }
    }
  }
  return out;
}

// Joint ventures (equity method): a schedule that is missing for the latest closed year, or a carrying amount that has gone negative.
async function detectJointVentureExceptions(organizationId: string, locale: Locale): Promise<DraftFinding[]> {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const jvs = await loadJointVentures(organizationId);
  const closedYear = new Date().getFullYear() - 1;
  const out: DraftFinding[] = [];

  // HQ's "Investment in subsidiary" account in Xero against the figure the Group statements eliminate. A joint-venture payment is often
  // booked there first and only moved to "Investment in Joint Venture" at the year-end audit (as in FY2025), which makes the ledger
  // balance larger than the real cost of the subsidiaries until then.
  try {
    const [org, subRows] = await Promise.all([
      db.organization.findUnique({ where: { id: organizationId }, select: { investmentInSubsidiaries: true } }),
      db.accountBalanceMonthly.findMany({ where: { organizationId, subsidiaryId: null, group: "SUBSIDIARY_INVESTMENT" }, orderBy: [{ year: "desc" }, { month: "desc" }] }),
    ]);
    if (org && subRows.length > 0) {
      const { year, month } = subRows[0];
      const xeroBalance = subRows.filter((r) => r.year === year && r.month === month).reduce((s, r) => s + Number(r.balance), 0);
      const eliminated = Number(org.investmentInSubsidiaries);
      const diff = Math.round((xeroBalance - eliminated) * 100) / 100;
      if (Math.abs(diff) > 1) {
        const jvCost = jvs.reduce((s, jv) => s + (jv.years.length ? jv.years[jv.years.length - 1].cumulativeCost : 0), 0);
        const looksLikeJv = diff > 0 && Math.abs(diff - jvCost) < 1;
        const label = `${year}-${String(month).padStart(2, "0")}`;
        out.push({
          area: "ledger", severity: "MEDIUM", entityLabel: isZh ? "集团总部" : "Group HQ", transactionRef: "INV-SUB",
          amount: diff,
          criteria: isZh ? "合并时抵销的「对子公司投资」应等于总部账上该科目的真实成本" : "The investment in subsidiaries eliminated on consolidation should equal the true cost held in HQ's ledger",
          condition: isZh
            ? `总部 Xero「对子公司投资」在 ${label} 为 ${xeroBalance.toFixed(2)}，而合并抵销数为 ${eliminated.toFixed(2)}，相差 ${diff.toFixed(2)}。${looksLikeJv ? "该差额等于合营企业的投资成本——合营企业款项可能仍记在此科目，年末审计时才重分类。" : ""}`
            : `HQ's "Investment in subsidiary" in Xero is ${xeroBalance.toFixed(2)} at ${label} but ${eliminated.toFixed(2)} is eliminated on consolidation — a difference of ${diff.toFixed(2)}.${looksLikeJv ? " The difference equals the joint venture's cost: that payment is probably still booked in this account and is only reclassified at the year-end audit." : ""}`,
          evidence: `AccountBalanceMonthly (HQ, Investment in subsidiary, ${label}) vs Organization.investmentInSubsidiaries`,
          riskImpact: isZh ? "抵销过多或过少都会使集团总资产和权益失真" : "Eliminating too much or too little misstates Group assets and equity",
          recommendation: looksLikeJv
            ? (isZh ? "把合营企业的投资成本从「对子公司投资」重分类到「Investment in Joint Venture」(12200)，不必等到年末审计" : "Reclassify the joint venture's cost from \"Investment in subsidiary\" to \"Investment in Joint Venture\" (12200) when it is paid, rather than at the year-end audit")
            : (isZh ? "核对总部账上该科目的构成，并更新「设置 → 总部资产负债表」中的抵销数" : "Check what makes up the account in HQ's ledger and update the elimination under Settings → HQ balance sheet"),
          dedupKey: `ledger|inv-sub`,
        });
      }
    }
  } catch {
    // table not there yet — skip
  }
  for (const jv of jvs) {
    const latest = jv.years[jv.years.length - 1];
    if (!latest || latest.year < closedYear) {
      out.push({
        area: "ledger", severity: "MEDIUM", entityLabel: jv.name, transactionRef: "JV",
        amount: latest ? latest.closing : null,
        criteria: isZh ? "合营企业须按权益法逐年更新，集团报表才包含其应占利润/(亏损)" : "A joint venture's equity-method schedule must be updated every year for the Group statements to carry its share of result",
        condition: latest
          ? (isZh ? `${jv.name} 的年度数据只到 ${latest.year} 年，${closedYear} 年尚未录入。` : `The yearly figures for ${jv.name} stop at ${latest.year}; ${closedYear} has not been entered.`)
          : (isZh ? `${jv.name} 没有任何年度数据，集团报表未包含它。` : `${jv.name} has no yearly figures, so the Group statements do not include it.`),
        evidence: `JointVenturePeriod — ${jv.name}`,
        riskImpact: isZh ? "应占亏损/利润、投资账面值和未确认亏损都不准确，集团报表失真" : "The share of result, the carrying amount and the unrecognised losses are out of date, so the Group statements are misstated",
        recommendation: isZh ? "在「报表 → 合营企业」录入该年度的合营企业净利润、净资产、股息和投入资本" : "On Reports → Joint ventures, enter the year's JV net result, net assets, dividends and capital put in",
        dedupKey: `ledger|jv|${jv.id}|stale`,
      });
    }
    if (latest && latest.flags.includes("carrying-negative")) {
      out.push({
        area: "ledger", severity: "HIGH", entityLabel: jv.name, transactionRef: "JV",
        amount: latest.closing,
        criteria: isZh ? "权益法下投资账面值不得低于零" : "Under the equity method the carrying amount cannot fall below nil",
        condition: isZh ? `${jv.name} ${latest.year} 年末账面值为 ${latest.closing.toFixed(2)}，股息或折算差额超过了账面值。` : `${jv.name} closes ${latest.year} at ${latest.closing.toFixed(2)} — dividends or translation exceed the carrying amount.`,
        evidence: `JointVenturePeriod — ${jv.name} / ${latest.year}`,
        riskImpact: isZh ? "超过账面值的股息应确认为利得，否则投资和权益被少计" : "Dividends beyond the carrying amount are a gain; leaving them in the investment misstates assets and equity",
        recommendation: isZh ? "核对股息和折算差额的输入；超出部分按准则确认为损益" : "Check the dividend and translation inputs; recognise the excess in profit or loss as the standard requires",
        dedupKey: `ledger|jv|${jv.id}|negative|${latest.year}`,
      });
    }
  }
  return out;
}

async function detectSegregationOfDuties(organizationId: string, locale: Locale): Promise<DraftFinding[]> {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const approvers = await db.user.findMany({ where: { organizationId, status: "ACTIVE", role: { in: ["ADMIN", "DIRECTOR"] } } });
  if (approvers.length > 1) return [];
  return [
    {
      area: "sod",
      severity: "MEDIUM",
      entityLabel: isZh ? "集团总部" : "Group HQ",
      transactionRef: "N/A",
      amount: null,
      criteria: isZh ? "应至少有两名具备审批权限(系统管理员/集团总监)的活跃用户，以实现职责分离" : "At least two active users with approval authority (ADMIN/DIRECTOR) should exist to maintain segregation of duties",
      condition: isZh
        ? `当前仅有 ${approvers.length} 名活跃的系统管理员/集团总监用户`
        : `Only ${approvers.length} active user(s) currently hold ADMIN/DIRECTOR role`,
      evidence: `User count with role IN (ADMIN, DIRECTOR) AND status=ACTIVE: ${approvers.length}`,
      riskImpact: isZh ? "缺乏独立的第二审批人，存在管理层凌驾控制的风险" : "Lacking an independent second approver creates a management-override risk",
      recommendation: isZh ? "指定至少一名额外的管理员或总监用户作为独立审批人" : "Designate at least one additional ADMIN or DIRECTOR user as an independent approver",
      dedupKey: `sod-approver-count`,
    },
  ];
}

export async function runAuditScan(organizationId: string, year: number, locale: Locale): Promise<{ created: number; skipped: number }> {
  const [ar, ap, budget, debt, riskDiv, sod, ledger, jointVenture] = await Promise.all([
    detectARExceptions(organizationId, locale),
    detectAPExceptions(organizationId, locale),
    detectBudgetVariance(organizationId, year, locale),
    detectDebtRatioExceptions(organizationId, locale),
    detectRiskRatingDivergence(organizationId, year, locale),
    detectSegregationOfDuties(organizationId, locale),
    detectLedgerExceptions(organizationId, locale),
    detectJointVentureExceptions(organizationId, locale),
  ]);
  const drafts = [...ar, ...ap, ...budget, ...debt, ...riskDiv, ...sod, ...ledger, ...jointVenture];

  const existingOpen = await db.auditFinding.findMany({
    where: { organizationId, status: { in: ["OPEN", "IN_PROGRESS"] } },
    select: { dedupKey: true },
  });
  const existingKeys = new Set(existingOpen.map((f) => f.dedupKey).filter((k): k is string => k !== null));

  let created = 0;
  let skipped = 0;
  for (const d of drafts) {
    if (existingKeys.has(d.dedupKey)) {
      skipped++;
      continue;
    }
    const areaCode = AREA_CODE[d.area] ?? d.area.toUpperCase();
    const count = await db.auditFinding.count({ where: { organizationId, area: d.area, findingRef: { startsWith: `IA-${year}-${areaCode}-` } } });
    const findingRef = `IA-${year}-${areaCode}-${String(count + 1).padStart(3, "0")}`;
    await db.auditFinding.create({
      data: {
        organizationId,
        findingRef,
        area: d.area,
        severity: d.severity,
        entityLabel: d.entityLabel,
        transactionRef: d.transactionRef,
        dedupKey: d.dedupKey,
        amount: d.amount,
        criteria: d.criteria,
        condition: d.condition,
        evidence: d.evidence,
        riskImpact: d.riskImpact,
        recommendation: d.recommendation,
        detectionType: "AUTOMATED",
      },
    });
    existingKeys.add(d.dedupKey);
    created++;
  }
  return { created, skipped };
}

export interface AuditReportFinding {
  findingRef: string;
  area: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "IN_PROGRESS" | "CLOSED";
  dateIdentified: Date;
  entityLabel: string | null;
  transactionRef: string | null;
  amount: number | null;
  condition: string;
  criteria: string;
  evidence: string;
  riskImpact: string;
  recommendation: string;
  rootCause: string | null;
  managementResponse: string | null;
  auditorAssessment: string | null;
  responsibleOwner: string | null;
  targetDate: Date | null;
  closureEvidence: string | null;
  closedAt: Date | null;
}

export interface AuditReport {
  companyName: string;
  year: number;
  generatedAt: Date;
  totalFindings: number;
  openCount: number;
  inProgressCount: number;
  closedCount: number;
  highCriticalCount: number;
  byArea: { area: string; count: number }[];
  findings: AuditReportFinding[];
}

// Scoped to findings whose dateIdentified falls within `year` — a formal, point-in-time report
// packaging of the live /audit findings list (§22 of the audit spec: Executive Summary +
// Detailed Findings), not a recomputation — a finding's status/response/closure are exactly what
// a human reviewer has recorded as of generation time, same "real, not recomputed" guarantee as
// the live audit page.
export async function computeAuditReport(organizationId: string, year: number): Promise<AuditReport> {
  const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  const findings = await db.auditFinding.findMany({
    where: { organizationId, dateIdentified: { gte: yearStart, lt: yearEnd } },
    orderBy: [{ severity: "desc" }, { dateIdentified: "desc" }],
  });

  const byAreaMap = new Map<string, number>();
  for (const f of findings) byAreaMap.set(f.area, (byAreaMap.get(f.area) || 0) + 1);

  return {
    companyName: organization.name,
    year,
    generatedAt: new Date(),
    totalFindings: findings.length,
    openCount: findings.filter((f) => f.status === "OPEN").length,
    inProgressCount: findings.filter((f) => f.status === "IN_PROGRESS").length,
    closedCount: findings.filter((f) => f.status === "CLOSED").length,
    highCriticalCount: findings.filter((f) => f.severity === "HIGH" || f.severity === "CRITICAL").length,
    byArea: Array.from(byAreaMap.entries()).map(([area, count]) => ({ area, count })),
    findings: findings.map((f) => ({
      findingRef: f.findingRef,
      area: f.area,
      severity: f.severity,
      status: f.status,
      dateIdentified: f.dateIdentified,
      entityLabel: f.entityLabel,
      transactionRef: f.transactionRef,
      amount: f.amount === null ? null : Number(f.amount),
      condition: f.condition,
      criteria: f.criteria,
      evidence: f.evidence,
      riskImpact: f.riskImpact,
      recommendation: f.recommendation,
      rootCause: f.rootCause,
      managementResponse: f.managementResponse,
      auditorAssessment: f.auditorAssessment,
      responsibleOwner: f.responsibleOwner,
      targetDate: f.targetDate,
      closureEvidence: f.closureEvidence,
      closedAt: f.closedAt,
    })),
  };
}
