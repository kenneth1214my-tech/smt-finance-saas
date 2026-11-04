// Draft correcting journals for the exceptions the ledger checks (ledger-audit.ts) find. Pure.
//
// What is automated and what is not: the system finds the exception, works out the amount that brings the account back to a sensible
// balance, and prepares the journal (and the Xero manual-journal import file for it). It does NOT post anything to Xero — the Xero
// connection is read-only, and a journal that changes the ledger should be a person's decision: the cause can only be confirmed from the
// source transactions (the balance sheet alone cannot tell a double reversal from a mis-coded bill), and the expense / revenue account to
// charge is that person's call. Each draft therefore names the most likely cause, offers the alternative, and leaves the P&L account to be
// chosen.

import type { LedgerEntityResult, LedgerGroup } from "@/lib/ledger-audit";

export interface JournalLine {
  /** Account name, or a placeholder the reviewer replaces (see `pick`). */
  account: string;
  /** True when the reviewer must choose the account (the P&L account the original entry hit). */
  pick: boolean;
  debit: number;
  credit: number;
}

export interface CorrectionOption {
  cause: string;
  lines: JournalLine[];
}

export interface CorrectionDraft {
  id: string;
  entityId: string | null;
  entityLabel: string;
  group: LedgerGroup;
  /** The ledger account the exception is on. */
  account: string;
  trigger: "sign" | "reverse";
  /** The balance now, and the amount the draft moves. */
  balance: number;
  amount: number;
  /** yyyy-mm-dd — the journal date (today, i.e. the open period). */
  date: string;
  narration: string;
  /** Most likely cause and the journal for it. */
  primary: CorrectionOption;
  /** The next most likely cause and its journal (null when there is no sensible alternative). */
  alternative: CorrectionOption | null;
  /** What the person must check before posting. */
  confirm: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const f2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildCorrections(results: LedgerEntityResult[], isZh: boolean, date: string): CorrectionDraft[] {
  const t = (zh: string, en: string) => (isZh ? zh : en);
  const expense = t("【请选择】原先入账的费用科目", "[SELECT] the expense account originally charged");
  const revenue = t("【请选择】原先结转到的收入科目", "[SELECT] the revenue account originally credited");
  const out: CorrectionDraft[] = [];

  const line = (account: string, side: "dr" | "cr", amount: number, pick = false): JournalLine => ({
    account, pick, debit: side === "dr" ? r2(amount) : 0, credit: side === "cr" ? r2(amount) : 0,
  });

  for (const entity of results) {
    for (const g of entity.groups) {
      for (const c of g.checks) {
        if (!c.account) continue;
        const acct = g.accounts.find((a) => a.name === c.account);
        if (!acct) continue;
        const base = { entityId: entity.id, entityLabel: entity.label, group: g.group, account: c.account, date };

        // ---- wrong-side balance, right now
        if (c.id === "sign" && c.status === "fail" && acct.latest !== null && acct.latest < -1) {
          const amount = r2(Math.abs(acct.latest));
          const narration = t(`更正：${c.account} 余额方向错误 ${f2(amount)}（内部审计草稿 ${date}）`, `Correction: ${c.account} balance on the wrong side ${f2(amount)} (internal audit draft ${date})`);
          let primary: CorrectionOption;
          let alternative: CorrectionOption;
          let confirm: string;
          if (g.group === "ACCRUAL") {
            primary = {
              cause: t("应计被冲回两次或冲回金额大于计提金额，费用被多冲回。补回费用。", "The accrual was reversed twice, or reversed for more than was accrued, so expense was released once too often. Put the expense back."),
              lines: [line(expense, "dr", amount, true), line(c.account, "cr", amount)],
            };
            alternative = {
              cause: t("该款项实为预付给供应商的款项，不是应计。重分类为预付款项。", "The amount is really an advance paid to a supplier, not an accrual. Reclassify it to prepayments."),
              lines: [line(t("预付款项 / 押金", "Prepayments / deposit paid"), "dr", amount), line(c.account, "cr", amount)],
            };
            confirm = t("在 Xero 查看该账户的明细账：借方是否有无对应贷方的冲回、或把供应商账单/付款直接记入了该账户。", "In Xero's account transactions for this account, look for a debit with no earlier credit — a double reversal, or a supplier bill / payment coded straight to the account.");
          } else if (g.group === "DEFERRED_REVENUE") {
            primary = {
              cause: t("结转到收入的金额多于已收/已开票的预收款（重复结转或结转过早）。冲回多结转的收入。", "More was released to revenue than was billed in advance (a release posted twice or too early). Reverse the over-released revenue."),
              lines: [line(revenue, "dr", amount, true), line(c.account, "cr", amount)],
            };
            alternative = {
              cause: t("服务已提供但尚未开票，该借方其实是应计收入（资产）。重分类。", "The service was delivered but not yet invoiced, so the debit is really accrued income (an asset). Reclassify it."),
              lines: [line(t("应计收入", "Accrued income"), "dr", amount), line(c.account, "cr", amount)],
            };
            confirm = t("核对该账户的结转日记账与对应的课程/合同发票：结转是否重复，或是否早于开票。", "Check the release journals against the course / contract invoices: whether a release is duplicated or ahead of the invoice.");
          } else {
            primary = {
              cause: t("摊销多记（重复摊销）使预付款项变成贷方余额。冲回多摊销的费用。", "Amortisation was posted too much (twice) so the prepayment went to a credit balance. Reverse the excess amortisation."),
              lines: [line(c.account, "dr", amount), line(expense, "cr", amount, true)],
            };
            alternative = {
              cause: t("该贷方其实是供应商的退款/贷项（负债）。重分类为负债。", "The credit is really a supplier refund or credit (a liability). Reclassify it."),
              lines: [line(c.account, "dr", amount), line(t("其他应付款 / 供应商贷项", "Other payables / supplier credit"), "cr", amount)],
            };
            confirm = t("核对该账户的摊销日记账与预付明细：是否重复摊销，或是否有退款记入了该账户。", "Check the amortisation journals against the prepayment schedule: whether one is posted twice, or a refund was coded to this account.");
          }
          out.push({ id: `${entity.id ?? "hq"}|${g.group}|${c.account}|sign`, trigger: "sign", balance: acct.latest, amount, narration, primary, alternative, confirm, ...base });
        }

        // ---- accrual that never reverses: the stuck amount, once the real invoice is confirmed
        if (c.id === "reverse" && c.status === "warn" && c.amount !== null && c.amount > 1) {
          const amount = r2(c.amount);
          out.push({
            id: `${entity.id ?? "hq"}|${g.group}|${c.account}|reverse`, trigger: "reverse", balance: acct.latest ?? amount, amount,
            narration: t(`冲回已取得发票的应计：${c.account} ${f2(amount)}（内部审计草稿 ${date}）`, `Reverse accrual already invoiced: ${c.account} ${f2(amount)} (internal audit draft ${date})`),
            primary: {
              cause: t("实际发票已入账（应付款/费用），但对应的应计没有冲回，费用和负债被重复记录。冲回已被发票覆盖的部分。", "The real invoice is booked (payables / expense) but the accrual that covered it was never reversed, so cost and liability are counted twice. Reverse the part the invoice now covers."),
              lines: [line(c.account, "dr", amount), line(expense, "cr", amount, true)],
            },
            alternative: null,
            confirm: t(`先逐笔核对「${c.account}」：只冲回已经取得发票或已付款的项目；仍属实际未开票的应计不要冲回。金额 ${f2(amount)} 是近 3 个月都没有变动的底数，可能并非全部都该冲回。`, `Go through "${c.account}" item by item first: reverse only what has been invoiced or paid; leave genuinely un-invoiced accruals. ${f2(amount)} is the floor that has not moved for 3 months — not all of it may be reversible.`),
            ...base,
          });
        }
      }
    }
  }
  return out;
}
