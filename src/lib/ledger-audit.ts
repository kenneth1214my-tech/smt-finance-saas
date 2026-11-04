// Accuracy checks for the three accounts where a bookkeeping error hides longest: deferred revenue, prepayments and accruals.
// Pure — the loader (ledger-audit-data.ts) hands in month-end balances read from the Xero balance sheet plus the P&L, and every check
// below is arithmetic on those real figures. A check that cannot be run (no such account found, not enough months) says so as
// "info"; it never invents a pass.
//
// What these checks can and cannot prove: they test that each balance is the right sign, moves the way the account should, is in
// proportion to the business, and is part of — not larger than — the balance-sheet total it belongs to. They do not replace vouching
// a balance to contracts, invoices or payment schedules.

export type LedgerGroup = "DEFERRED_REVENUE" | "PREPAYMENT" | "ACCRUAL";
export type CheckStatus = "pass" | "warn" | "fail" | "info";

export interface LedgerAccountSeries {
  group: LedgerGroup;
  name: string;
  section: "asset" | "liability";
  /** Month-end balance as printed on the balance sheet (assets and liabilities both positive when they have their normal balance), keyed "yyyy-m". */
  balances: Record<string, number>;
}

export interface LedgerEntityInput {
  id: string | null;
  label: string;
  accounts: LedgerAccountSeries[];
  /** Monthly P&L revenue and total operating costs (cost of sales + selling + admin + R&D + finance), keyed "yyyy-m". */
  revenue: Record<string, number>;
  opex: Record<string, number>;
  /** Balance-sheet totals the accounts are part of, keyed "yyyy-m". */
  opLiabilities: Record<string, number>;
  opAssets: Record<string, number>;
}

export interface LedgerCheck {
  id: string;
  status: CheckStatus;
  title: string;
  detail: string;
  /** The account the check is about, when it is about one. */
  account: string | null;
  amount: number | null;
  /** For findings raised from a warn / fail. */
  criteria: string;
  risk: string;
  recommendation: string;
}

export interface LedgerGroupResult {
  group: LedgerGroup;
  accounts: { name: string; section: "asset" | "liability"; latest: number | null; series: { key: string; balance: number }[] }[];
  latestKey: string | null;
  months: number;
  checks: LedgerCheck[];
}

export interface LedgerEntityResult {
  id: string | null;
  label: string;
  groups: LedgerGroupResult[];
}

export const LEDGER_GROUPS: LedgerGroup[] = ["DEFERRED_REVENUE", "PREPAYMENT", "ACCRUAL"];

const monthIdx = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return y * 12 + m;
};
const f0 = (n: number) => Math.round(n).toLocaleString("en-US");
const r2 = (n: number) => Math.round(n * 100) / 100 + 0;

export function runLedgerChecks(entities: LedgerEntityInput[], isZh: boolean): LedgerEntityResult[] {
  const t = (zh: string, en: string) => (isZh ? zh : en);

  return entities.map((entity) => {
    const groups: LedgerGroupResult[] = LEDGER_GROUPS.map((group) => {
      const accts = entity.accounts.filter((a) => a.group === group);
      const accounts = accts.map((a) => {
        const series = Object.entries(a.balances)
          .map(([key, balance]) => ({ key, balance }))
          .sort((x, y) => monthIdx(x.key) - monthIdx(y.key));
        return { name: a.name, section: a.section, latest: series.length ? series[series.length - 1].balance : null, series };
      });
      const allKeys = [...new Set(accts.flatMap((a) => Object.keys(a.balances)))].sort((x, y) => monthIdx(x) - monthIdx(y));
      const latestKey = allKeys.length ? allKeys[allKeys.length - 1] : null;
      const checks: LedgerCheck[] = [];
      const add = (c: LedgerCheck) => checks.push(c);
      const groupName = group === "DEFERRED_REVENUE" ? t("递延收入", "Deferred revenue") : group === "PREPAYMENT" ? t("预付款项", "Prepayments") : t("应计项目", "Accruals");

      if (accounts.length === 0 || !latestKey) {
        add({
          id: "coverage", status: "info", account: null, amount: null,
          title: t("账户覆盖", "Account coverage"),
          detail: t(`在 Xero 资产负债表中没有按名称找到「${groupName}」账户（或尚未同步）。执行「全部同步」后会自动读取；若账目使用了其他名称，请告知。`, `No "${groupName}" account was found by name on the Xero balance sheet (or it has not been synced yet). "Sync all" reads it automatically; if the books use a different name, tell us and it is added.`),
          criteria: "", risk: "", recommendation: "",
        });
        return { group, accounts, latestKey, months: 0, checks };
      }

      const normalSection: "asset" | "liability" = group === "PREPAYMENT" ? "asset" : "liability";
      const latestIdx = monthIdx(latestKey);
      const window = (key: string, months: number) => monthIdx(key) > latestIdx - months;
      const sumAt = (key: string, pick: (a: LedgerAccountSeries) => boolean = () => true) => accts.filter(pick).reduce((s, a) => s + (a.balances[key] ?? 0), 0);
      const totalLatest = r2(sumAt(latestKey));
      const trailing = (rec: Record<string, number>, months: number) => {
        const keys = Object.keys(rec).filter((k) => window(k, months));
        return { sum: keys.reduce((s, k) => s + rec[k], 0), n: keys.length };
      };
      const rev12 = trailing(entity.revenue, 12);
      const opex12 = trailing(entity.opex, 12);
      const annualRevenue = rev12.n > 0 ? (rev12.sum / rev12.n) * 12 : 0;
      const monthlyOpex = opex12.n > 0 ? opex12.sum / opex12.n : 0;

      // ---- 1. normal side: a debit balance in a liability account (or credit in an asset) is a posting error
      for (const a of accounts) {
        const neg = a.series.filter((p) => window(p.key, 12) && p.balance < -1);
        const latestNeg = a.latest !== null && a.latest < -1;
        add({
          id: "sign", account: a.name, amount: latestNeg ? a.latest : neg.length ? neg[neg.length - 1].balance : null,
          status: latestNeg ? "fail" : neg.length ? "warn" : "pass",
          title: t("余额方向", "Normal balance side"),
          detail: latestNeg
            ? t(`「${a.name}」当前为反方向余额 ${f0(a.latest as number)}（${a.section === "liability" ? "负债账户出现借方余额" : "资产账户出现贷方余额"}）。`, `"${a.name}" currently has a balance on the wrong side: ${f0(a.latest as number)} (${a.section === "liability" ? "a debit balance in a liability account" : "a credit balance in an asset account"}).`)
            : neg.length
              ? t(`「${a.name}」在过去 12 个月内有 ${neg.length} 个月出现过反方向余额，目前已恢复正常。`, `"${a.name}" had a balance on the wrong side in ${neg.length} of the last 12 months; it is back to normal now.`)
              : t(`「${a.name}」余额方向正常。`, `"${a.name}" is on its normal side.`),
          criteria: t(`${groupName}账户应保持正常方向的余额`, `${groupName} should carry a balance on its normal side`),
          risk: t("反方向余额通常意味着重复摊销/重复冲销或记错账户，导致收入/费用和资产负债表同时失真", "A balance on the wrong side usually means an amortisation or reversal posted twice or to the wrong account, which distorts both the P&L and the balance sheet"),
          recommendation: t(`复核「${a.name}」最近的日记账，更正重复或错误的分录`, `Review the latest journals on "${a.name}" and correct the duplicated or misposted entries`),
        });
      }

      // ---- 2. tie to the balance-sheet total the account belongs to
      const totals = normalSection === "asset" ? entity.opAssets : entity.opLiabilities;
      const group_total_for_tie = r2(sumAt(latestKey, (a) => a.section === normalSection));
      if (totals[latestKey] !== undefined && group_total_for_tie > 0) {
        const bsTotal = totals[latestKey];
        const over = group_total_for_tie - bsTotal > 1;
        add({
          id: "tie", account: null, amount: over ? r2(group_total_for_tie - bsTotal) : null, status: over ? "fail" : "pass",
          title: t("与资产负债表合计核对", "Tie-out to the balance-sheet total"),
          detail: over
            ? t(`${groupName}合计 ${f0(group_total_for_tie)} 超过其所属的${normalSection === "asset" ? "经营性资产" : "经营性负债"}合计 ${f0(bsTotal)}，账户分类与资产负债表不一致。`, `${groupName} totals ${f0(group_total_for_tie)}, more than the ${normalSection === "asset" ? "operating assets" : "operating liabilities"} total of ${f0(bsTotal)} it is part of — the classification does not agree with the balance sheet.`)
            : t(`${groupName}合计 ${f0(group_total_for_tie)}，包含在${normalSection === "asset" ? "经营性资产" : "经营性负债"}合计 ${f0(bsTotal)} 之内。`, `${groupName} totals ${f0(group_total_for_tie)}, within the ${normalSection === "asset" ? "operating assets" : "operating liabilities"} total of ${f0(bsTotal)}.`),
          criteria: t("账户余额应是所属资产负债表合计的一部分", "An account balance must be part of the balance-sheet total it belongs to"),
          risk: t("合计小于其组成部分说明分类或汇总有误", "A total smaller than one of its parts means a classification or roll-up error"),
          recommendation: t("核对该账户在 Xero 中的账户类型和报表归类", "Check the account type and report grouping of this account in Xero"),
        });
      }

      // ---- 3. group-specific behaviour
      if (group === "DEFERRED_REVENUE") {
        // 3a. must be released: a balance that does not move while revenue is being earned has stopped being recognised
        for (const a of accounts) {
          const recent = a.series.filter((p) => window(p.key, 4));
          if (recent.length >= 3) {
            const frozen = recent.every((p) => Math.abs(p.balance - recent[0].balance) < 0.5) && Math.abs(recent[0].balance) > 1000;
            const earning = recent.some((p) => (entity.revenue[p.key] ?? 0) > 0);
            add({
              id: "release", account: a.name, amount: frozen ? recent[0].balance : null, status: frozen && earning ? "warn" : "pass",
              title: t("递延收入是否在释放", "Is deferred revenue being released"),
              detail: frozen && earning
                ? t(`「${a.name}」余额连续 ${recent.length} 个月完全没有变化（${f0(recent[0].balance)}），而期间一直有营业收入——没有新的预收款，也没有结转收入。`, `"${a.name}" has not moved for ${recent.length} months (${f0(recent[0].balance)}) although revenue was earned — nothing was billed in advance and nothing was released to revenue.`)
                : t(`「${a.name}」近几个月有变动，说明在收款和结转。`, `"${a.name}" has moved in recent months, so billing and release are both happening.`),
              criteria: t("递延收入应随服务期逐月结转为收入", "Deferred revenue should be released to revenue month by month over the service period"),
              risk: t("不结转会少计收入、多计负债；结转过快则提前确认收入", "Not releasing understates revenue and overstates liabilities; releasing too fast recognises revenue early"),
              recommendation: t(`核对「${a.name}」的结转日记账是否按课程/服务期执行`, `Check that the release journals on "${a.name}" are being posted over the course / service period`),
            });
          }
        }
        // 3b. size against the business
        if (annualRevenue > 0 && totalLatest > 0) {
          const ratio = (totalLatest / annualRevenue) * 100;
          const big = ratio > 100;
          add({
            id: "size", account: null, amount: totalLatest, status: big ? "warn" : "pass",
            title: t("递延收入占年收入比例", "Deferred revenue against annual revenue"),
            detail: t(`递延收入 ${f0(totalLatest)}，相当于近 12 个月年化收入 ${f0(annualRevenue)} 的 ${ratio.toFixed(0)}%。${big ? "超过一整年的收入，请确认其中没有已提供服务但未结转的部分。" : ""}`, `Deferred revenue is ${f0(totalLatest)}, ${ratio.toFixed(0)}% of annualised revenue of ${f0(annualRevenue)}.${big ? " That is more than a full year of revenue — confirm none of it is for services already delivered." : ""}`),
            criteria: t("递延收入一般不应超过一年的收入（服务期通常不超过 12 个月）", "Deferred revenue should not normally exceed a year of revenue (service periods rarely run past 12 months)"),
            risk: t("比例过高通常是已提供服务的收入未结转", "A high ratio usually means revenue for services already delivered was never released"),
            recommendation: t("按课程/合同逐项核对余额，确认剩余服务期", "Vouch the balance course by course or contract by contract and confirm the remaining service period"),
          });
        }
        const lastRev = trailing(entity.revenue, 3);
        if (totalLatest > 1000 && lastRev.n >= 3 && lastRev.sum <= 0) {
          add({
            id: "no-revenue", account: null, amount: totalLatest, status: "warn",
            title: t("无收入但仍有递延收入", "Deferred revenue with no revenue"),
            detail: t(`最近 3 个月营业收入为 0，但递延收入仍有 ${f0(totalLatest)}——应已结转的收入可能没有入账。`, `Revenue has been zero for the last 3 months yet ${f0(totalLatest)} is still deferred — revenue that should have been released may be missing.`),
            criteria: t("有递延收入余额的期间应有相应的收入确认", "A period with a deferred-revenue balance should show the matching revenue recognition"),
            risk: t("收入漏记，利润被低估", "Revenue left unrecognised understates profit"),
            recommendation: t("检查结转日记账是否已过账、日期是否正确", "Check that the release journals are posted and dated correctly"),
          });
        }
      }

      if (group === "PREPAYMENT") {
        // amortisation: a prepayment that never moves is not being expensed
        for (const a of accounts) {
          const recent = a.series.filter((p) => window(p.key, 4));
          if (recent.length >= 3) {
            const frozen = recent.every((p) => Math.abs(p.balance - recent[0].balance) < 0.5) && recent[0].balance > 500;
            add({
              id: "amortise", account: a.name, amount: frozen ? recent[0].balance : null, status: frozen ? "warn" : "pass",
              title: t("预付款项是否在摊销", "Are prepayments being amortised"),
              detail: frozen
                ? t(`「${a.name}」余额连续 ${recent.length} 个月没有任何变化（${f0(recent[0].balance)}）——没有摊销，也没有新增预付。`, `"${a.name}" has not moved for ${recent.length} months (${f0(recent[0].balance)}) — no amortisation and no new prepayment.`)
                : t(`「${a.name}」近几个月有变动，说明在摊销或新增。`, `"${a.name}" has moved in recent months, so it is being amortised or topped up.`),
              criteria: t("预付款项应在受益期内逐月摊销为费用", "A prepayment should be expensed month by month over the period it covers"),
              risk: t("不摊销会少计费用、多计资产", "Not amortising understates expenses and overstates assets"),
              recommendation: t(`核对「${a.name}」的摊销分录和受益期`, `Check the amortisation entries and the covered period on "${a.name}"`),
            });
          }
          const growing = a.series.filter((p) => window(p.key, 7));
          if (growing.length >= 6 && growing.every((p, i) => i === 0 || p.balance > growing[i - 1].balance + 0.5)) {
            add({
              id: "grow-only", account: a.name, amount: growing[growing.length - 1].balance, status: "warn",
              title: t("只增不减", "Only ever increasing"),
              detail: t(`「${a.name}」连续 ${growing.length} 个月只增不减，最新 ${f0(growing[growing.length - 1].balance)}——预付款项正常应有摊销而下降。`, `"${a.name}" has risen every month for ${growing.length} months to ${f0(growing[growing.length - 1].balance)} — a prepayment should come down as it is amortised.`),
              criteria: t("预付款项应随受益期推移而减少", "A prepayment should reduce as the covered period passes"),
              risk: t("摊销遗漏会累积成虚增的资产", "Missed amortisation builds up into an overstated asset"),
              recommendation: t(`检查「${a.name}」是否缺少摊销日记账`, `Check whether amortisation journals are missing on "${a.name}"`),
            });
          }
        }
        if (monthlyOpex > 0 && totalLatest > 0) {
          const months = totalLatest / monthlyOpex;
          const big = months > 6;
          add({
            id: "size", account: null, amount: totalLatest, status: big ? "warn" : "pass",
            title: t("预付款项占月均费用的倍数", "Prepayments against monthly spend"),
            detail: t(`预付款项 ${f0(totalLatest)}，约等于 ${months.toFixed(1)} 个月的平均运营支出（${f0(monthlyOpex)}）。${big ? "超过 6 个月，请核对是否含有应已摊销或应转费用的项目。" : ""}`, `Prepayments are ${f0(totalLatest)}, about ${months.toFixed(1)} months of average operating spend (${f0(monthlyOpex)}).${big ? " Above 6 months — check for items that should already have been expensed." : ""}`),
            criteria: t("预付款项一般对应不超过 12 个月的受益期，且应与支出规模相称", "Prepayments normally cover no more than 12 months and should be in proportion to spend"),
            risk: t("规模异常常见于应费用化的支出被挂在预付里", "An out-of-proportion balance often hides costs that should have been expensed"),
            recommendation: t("逐项核对预付明细及受益期", "Vouch the prepayment schedule and the covered periods item by item"),
          });
        }
      }

      if (group === "ACCRUAL") {
        for (const a of accounts) {
          const recent = a.series.filter((p) => window(p.key, 3));
          if (recent.length >= 3 && a.latest !== null && a.latest > 1000) {
            const core = Math.min(...recent.map((p) => p.balance));
            const persists = core >= a.latest * 0.8;
            add({
              id: "reverse", account: a.name, amount: persists ? core : null, status: persists ? "warn" : "pass",
              title: t("应计是否按期冲回", "Do accruals reverse"),
              detail: persists
                ? t(`「${a.name}」连续 3 个月都至少有 ${f0(core)} 没有被冲回或结清（最新 ${f0(a.latest)}）——应计费用一般在下月被实际发票冲回。`, `"${a.name}" has carried at least ${f0(core)} for 3 months without being reversed or settled (latest ${f0(a.latest)}) — accruals normally reverse when the real invoice arrives.`)
                : t(`「${a.name}」余额在近 3 个月内有明显冲回/结清。`, `"${a.name}" has reversed or settled meaningfully in the last 3 months.`),
              criteria: t("应计项目应在下一期被实际发票冲回或结清", "An accrual should be reversed or settled by the real invoice in the following period"),
              risk: t("长期不冲回的应计多为重复入账或已结清未冲销，导致费用和负债虚增", "An accrual that never reverses is usually a double count or a settled item never cleared, overstating expenses and liabilities"),
              recommendation: t(`逐笔核对「${a.name}」，对已取得发票或已付款的项目做冲销`, `Go through "${a.name}" item by item and reverse those already invoiced or paid`),
            });
          }
        }
        if (monthlyOpex > 0 && totalLatest > 0) {
          const months = totalLatest / monthlyOpex;
          const big = months > 3;
          add({
            id: "size", account: null, amount: totalLatest, status: big ? "warn" : "pass",
            title: t("应计占月均费用的倍数", "Accruals against monthly spend"),
            detail: t(`应计项目 ${f0(totalLatest)}，约等于 ${months.toFixed(1)} 个月的平均运营支出（${f0(monthlyOpex)}）。${big ? "超过 3 个月，规模偏大。" : ""}`, `Accruals are ${f0(totalLatest)}, about ${months.toFixed(1)} months of average operating spend (${f0(monthlyOpex)}).${big ? " More than 3 months — on the large side." : ""}`),
            criteria: t("应计一般只覆盖未取得发票的 1–2 个月费用", "Accruals normally cover only a month or two of costs not yet invoiced"),
            risk: t("规模过大说明有未冲回的旧应计或估计偏高", "An oversized balance points to old accruals never reversed, or over-estimation"),
            recommendation: t("复核应计明细、估计依据和账龄", "Review the accrual schedule, the basis of each estimate and its age"),
          });
        }
      }

      return { group, accounts, latestKey, months: allKeys.length, checks };
    });
    return { id: entity.id, label: entity.label, groups };
  });
}
