import "server-only";
import { db } from "@/lib/db";
import { localizedName } from "@/lib/localize";
import { effectiveFilingStatus } from "@/lib/tax";
import { worse, type RiskSeverity } from "@/lib/risk-rating";
import type { Locale } from "@/lib/i18n/dictionaries";

// Risk alerts used to be pure manual entry, so with nobody typing them in the page read 0 forever
// even while an entity was loss-making or a tax filing was overdue. These rules derive alerts live
// from the synced figures instead — nothing is stored, so an alert disappears the moment the
// underlying number recovers and can never go stale or be duplicated. Each rule yields at most one
// alert per entity. Manually entered RiskAlert rows still show alongside them.
//
// Only COMPLETED months feed the P&L rules: Xero's still-open month is partial and would read as a
// loss for every entity in the first days of a month.

export interface DerivedAlert {
  id: string;
  severity: RiskSeverity;
  category: "opRisk" | "costRisk" | "creditRisk" | "liquidityRisk" | "complianceRisk";
  tag: "lossMaking" | "revDecline" | "costUp" | "grossMarginNeg" | "lowRunway" | "dataStale" | "arRisk" | "creditConc" | "apAging" | "filingDue";
  subsidiaryId: string | null;
  entityLabel: string;
  textZh: string;
  textEn: string;
}

const num = (v: unknown) => Number(v ?? 0);
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const pct = (n: number) => `${Math.abs(n).toFixed(1)}%`;
const key = (y: number, m: number) => y * 12 + (m - 1);
const AGED_DAYS = 90;
const DAY_MS = 86_400_000;

type Fin = { revenue: number; netProfit: number; opCost: number; totalCost: number };

function sum(rows: Fin[], f: (r: Fin) => number) {
  return rows.reduce((a, r) => a + f(r), 0);
}

// "Worse of" per rule: a step table keyed on how bad the metric is. `steps` is ordered most severe first.
function band(value: number, steps: [number, RiskSeverity][]): RiskSeverity {
  for (const [limit, sev] of steps) if (value <= limit) return sev;
  return "GOOD";
}

export async function deriveRiskAlerts(organizationId: string, locale: Locale, now: Date = new Date()): Promise<DerivedAlert[]> {
  const subsidiaries = await db.subsidiary.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" } });
  const isZh = locale === "zh" || locale === "zh-Hant";
  const lastDone = key(now.getFullYear(), now.getMonth() + 1) - 1; // latest completed month

  const [latestBooked, monthly, cashFlows, balances, customers, payables, filings] = await Promise.all([
    // Newest month with real figures per entity, over ALL time (a placeholder row of zeros isn't "booked").
    db.monthlyFinancial.findMany({
      where: { organizationId, OR: [{ revenue: { not: 0 } }, { netProfit: { not: 0 } }] },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      distinct: ["subsidiaryId"],
      select: { subsidiaryId: true, year: true, month: true },
    }),
    db.monthlyFinancial.findMany({ where: { organizationId, year: { gte: now.getFullYear() - 1 } } }),
    db.cashFlowMonthly.findMany({ where: { organizationId, year: { gte: now.getFullYear() - 1 } } }),
    db.balanceSheetMonthly.findMany({ where: { organizationId, year: { gte: now.getFullYear() - 1 } } }),
    db.aRCustomer.findMany({ where: { organizationId, balance: { gt: 0 } } }),
    db.payable.findMany({ where: { organizationId, balance: { gt: 0 } } }),
    db.taxFiling.findMany({ where: { organizationId, status: "UPCOMING" } }),
  ]);

  const entities: { id: string | null; label: string }[] = [
    { id: null, label: isZh ? "集团总部" : "Group HQ" },
    ...subsidiaries.map((s) => ({ id: s.id, label: localizedName(s, locale) })),
  ];

  const out: DerivedAlert[] = [];
  const push = (a: Omit<DerivedAlert, "id">, entityId: string | null) => {
    if (a.severity !== "GOOD") out.push({ ...a, id: `auto-${a.tag}-${entityId ?? "hq"}` });
  };

  for (const e of entities) {
    const base = { subsidiaryId: e.id, entityLabel: e.label };

    // ---- Stale books: the latest completed month has no figures, so every other alert for this entity
    // is judging old data. One month behind is normal closing lag; two or more is flagged. ----
    const booked = latestBooked.find((r) => r.subsidiaryId === e.id);
    if (booked) {
      const behind = lastDone - key(booked.year, booked.month);
      if (behind >= 2) {
        const bookedLabel = `${booked.year}-${String(booked.month).padStart(2, "0")}`;
        push({
          ...base, severity: behind >= 6 ? "CRITICAL" : behind >= 4 ? "SERIOUS" : "WARNING", category: "complianceRisk", tag: "dataStale",
          textEn: `No P&L booked after ${bookedLabel} — ${behind} completed months behind; other alerts for this entity reflect old data`,
          textZh: `${bookedLabel} 之后没有利润表数据——已落后 ${behind} 个完整月份，该主体的其他预警基于旧数据`,
        }, e.id);
      }
    }

    // ---- P&L (completed months only) ----
    const rows = monthly
      .filter((r) => r.subsidiaryId === e.id && key(r.year, r.month) <= lastDone)
      .sort((a, b) => key(a.year, a.month) - key(b.year, b.month));
    const fin: Fin[] = rows.map((r) => ({
      revenue: num(r.revenue),
      netProfit: num(r.netProfit),
      opCost: num(r.opCost),
      totalCost: num(r.opCost) + num(r.sellExp) + num(r.adminExp) + num(r.rndExp) + num(r.financeExp),
    }));
    const last = rows[rows.length - 1];
    // Ignore an entity with nothing booked (a placeholder row of zeros is not a real loss or a real decline).
    if (last && fin.some((f) => f.revenue !== 0 || f.netProfit !== 0)) {
      const latest = fin[fin.length - 1];
      const period = `${last.year}-${String(last.month).padStart(2, "0")}`;

      // a. Net loss in the latest completed month
      if (latest.netProfit < 0) {
        let streak = 0;
        for (let i = fin.length - 1; i >= 0 && fin[i].netProfit < 0; i--) streak++;
        const margin = latest.revenue > 0 ? (latest.netProfit / latest.revenue) * 100 : -100;
        let sev = band(margin, [[-20, "CRITICAL"], [-10, "SERIOUS"], [0, "WARNING"]]);
        if (streak >= 3) sev = worse(sev, "SERIOUS");
        push({
          ...base, severity: sev, category: "opRisk", tag: "lossMaking",
          textEn: `Net loss of ${fmt(-latest.netProfit)} in ${period}${latest.revenue > 0 ? ` (${pct(margin)} of revenue)` : ""}${streak > 1 ? `, ${streak} loss-making months in a row` : ""}`,
          textZh: `${period} 净亏损 ${fmt(-latest.netProfit)}${latest.revenue > 0 ? `（占收入 ${pct(margin)}）` : ""}${streak > 1 ? `，已连续 ${streak} 个月亏损` : ""}`,
        }, e.id);
      }

      // Compare the latest 3 completed months with the 3 before them.
      const cur = fin.slice(-3);
      const prev = fin.slice(-6, -3);
      if (cur.length === 3 && prev.length === 3) {
        const revCur = sum(cur, (r) => r.revenue);
        const revPrev = sum(prev, (r) => r.revenue);
        if (revPrev > 0) {
          const chg = ((revCur - revPrev) / revPrev) * 100;
          const sev = band(chg, [[-30, "CRITICAL"], [-15, "SERIOUS"], [-10, "WARNING"]]);
          push({
            ...base, severity: sev, category: "opRisk", tag: "revDecline",
            textEn: `Revenue fell ${pct(chg)} — last 3 months ${fmt(revCur)} vs ${fmt(revPrev)} in the 3 months before`,
            textZh: `收入下降 ${pct(chg)}：近 3 个月 ${fmt(revCur)}，此前 3 个月 ${fmt(revPrev)}`,
          }, e.id);
        }
        const costCur = sum(cur, (r) => r.totalCost);
        const costPrev = sum(prev, (r) => r.totalCost);
        if (costPrev > 0) {
          const costChg = ((costCur - costPrev) / costPrev) * 100;
          const revChg = revPrev > 0 ? ((revCur - revPrev) / revPrev) * 100 : 0;
          // Rising costs only matter when revenue isn't keeping pace.
          if (costChg > revChg) {
            const sev = band(-costChg, [[-30, "SERIOUS"], [-15, "WARNING"]]);
            push({
              ...base, severity: sev, category: "costRisk", tag: "costUp",
              textEn: `Costs up ${pct(costChg)} (last 3 months ${fmt(costCur)} vs ${fmt(costPrev)}) while revenue moved ${revChg >= 0 ? "+" : "-"}${pct(revChg)}`,
              textZh: `成本上升 ${pct(costChg)}（近 3 个月 ${fmt(costCur)}，此前 ${fmt(costPrev)}），同期收入变动 ${revChg >= 0 ? "+" : "-"}${pct(revChg)}`,
            }, e.id);
          }
        }
      }

      // b. Negative gross margin over the last 3 completed months
      const rev3 = sum(fin.slice(-3), (r) => r.revenue);
      const cost3 = sum(fin.slice(-3), (r) => r.opCost);
      if (rev3 > 0 && cost3 > rev3) {
        const gm = ((rev3 - cost3) / rev3) * 100;
        push({
          ...base, severity: gm <= -20 ? "CRITICAL" : "SERIOUS", category: "costRisk", tag: "grossMarginNeg",
          textEn: `Cost of sales exceeds revenue — gross margin ${gm.toFixed(1)}% over the last 3 months`,
          textZh: `销货成本高于收入——近 3 个月毛利率 ${gm.toFixed(1)}%`,
        }, e.id);
      }
    }

    // ---- Liquidity: months of cash left at the recent free-cash-flow burn ----
    const bs = balances
      .filter((b) => b.subsidiaryId === e.id && key(b.year, b.month) <= lastDone)
      .sort((a, b) => key(b.year, b.month) - key(a.year, a.month))[0];
    const cf = cashFlows
      .filter((c) => c.subsidiaryId === e.id && key(c.year, c.month) <= lastDone)
      .sort((a, b) => key(b.year, b.month) - key(a.year, a.month))
      .slice(0, 3);
    if (bs && cf.length > 0) {
      const cash = num(bs.cash);
      const burn = -(cf.reduce((a, c) => a + num(c.ocf) + num(c.icf), 0) / cf.length); // + = cash going out
      if (cash < 0) {
        push({
          ...base, severity: "CRITICAL", category: "liquidityRisk", tag: "lowRunway",
          textEn: `Cash balance is negative (${fmt(cash)})`, textZh: `现金余额为负（${fmt(cash)}）`,
        }, e.id);
      } else if (burn > 0) {
        const months = cash / burn;
        const sev = band(months, [[1, "CRITICAL"], [3, "SERIOUS"], [6, "WARNING"]]);
        push({
          ...base, severity: sev, category: "liquidityRisk", tag: "lowRunway",
          textEn: `Cash ${fmt(cash)} covers about ${months.toFixed(1)} months at the recent burn of ${fmt(burn)}/month`,
          textZh: `现金 ${fmt(cash)}，按近期每月净流出 ${fmt(burn)} 仅能支撑约 ${months.toFixed(1)} 个月`,
        }, e.id);
      }
    }

    // ---- Credit: overdue and concentrated receivables ----
    const ar = customers.filter((c) => c.subsidiaryId === e.id);
    const arTotal = ar.reduce((a, c) => a + num(c.balance), 0);
    if (arTotal > 0) {
      const aged = ar.filter((c) => c.agingDays >= AGED_DAYS).reduce((a, c) => a + num(c.balance), 0);
      const share = (aged / arTotal) * 100;
      const sev = band(-share, [[-50, "SERIOUS"], [-25, "WARNING"]]);
      push({
        ...base, severity: sev, category: "creditRisk", tag: "arRisk",
        textEn: `${pct(share)} of receivables (${fmt(aged)} of ${fmt(arTotal)}) are ${AGED_DAYS}+ days old`,
        textZh: `应收账款中 ${pct(share)}（${fmt(aged)} / ${fmt(arTotal)}）账龄已超过 ${AGED_DAYS} 天`,
      }, e.id);
      const top = ar.reduce((a, c) => (num(c.balance) > num(a.balance) ? c : a), ar[0]);
      const topShare = (num(top.balance) / arTotal) * 100;
      if (ar.length >= 3 && topShare >= 40) {
        const name = isZh ? top.nameZh : top.nameEn;
        push({
          ...base, severity: topShare >= 60 ? "SERIOUS" : "WARNING", category: "creditRisk", tag: "creditConc",
          textEn: `One customer ("${name}") makes up ${pct(topShare)} of receivables`,
          textZh: `单一客户「${name}」占应收账款的 ${pct(topShare)}`,
        }, e.id);
      }
    }

    // ---- Liquidity: overdue payables ----
    const ap = payables.filter((p) => p.subsidiaryId === e.id);
    const apTotal = ap.reduce((a, p) => a + num(p.balance), 0);
    if (apTotal > 0) {
      const aged = ap.filter((p) => p.agingDays >= AGED_DAYS).reduce((a, p) => a + num(p.balance), 0);
      const share = (aged / apTotal) * 100;
      const sev = band(-share, [[-50, "SERIOUS"], [-25, "WARNING"]]);
      push({
        ...base, severity: sev, category: "liquidityRisk", tag: "apAging",
        textEn: `${pct(share)} of payables (${fmt(aged)} of ${fmt(apTotal)}) are ${AGED_DAYS}+ days old`,
        textZh: `应付账款中 ${pct(share)}（${fmt(aged)} / ${fmt(apTotal)}）账龄已超过 ${AGED_DAYS} 天`,
      }, e.id);
    }

    // ---- Compliance: tax filings overdue or about to fall due (the most urgent one per entity) ----
    const due = filings
      .filter((f) => f.subsidiaryId === e.id)
      .map((f) => ({ f, status: effectiveFilingStatus(f.status, f.dueDate, now), days: Math.ceil((f.dueDate.getTime() - now.getTime()) / DAY_MS) }))
      .filter((x) => x.status === "OVERDUE" || x.days <= 30)
      .sort((a, b) => a.days - b.days);
    if (due.length > 0) {
      const { f, status, days } = due[0];
      const kind =
        ({ GST_F5: "GST F5", ECI: "ECI", FORM_C_S: "Form C-S/C", PROFITS_TAX_RETURN: "Profits Tax Return (BIR51)", PROVISIONAL_TAX: "Provisional profits tax", EMPLOYERS_RETURN: "Employer's Return (BIR56A)", ANNUAL_RETURN: "Annual Return (NAR1)", BR_RENEWAL: "Business Registration renewal" } as Record<string, string>)[f.type] ?? f.type;
      const more = due.length > 1 ? (isZh ? `（另有 ${due.length - 1} 项）` : ` (+${due.length - 1} more)`) : "";
      const overdue = status === "OVERDUE";
      push({
        ...base, severity: overdue ? "CRITICAL" : days <= 14 ? "SERIOUS" : "WARNING", category: "complianceRisk", tag: "filingDue",
        textEn: overdue ? `${kind} ${f.periodLabel} is ${-days} day(s) overdue${more}` : `${kind} ${f.periodLabel} is due in ${days} day(s)${more}`,
        textZh: overdue ? `${kind} ${f.periodLabel} 已逾期 ${-days} 天${more}` : `${kind} ${f.periodLabel} 将在 ${days} 天后到期${more}`,
      }, e.id);
    }
  }

  return out;
}
