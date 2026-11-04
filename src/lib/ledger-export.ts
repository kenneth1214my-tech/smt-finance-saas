// Spreadsheet / CSV shapes for the ledger audit: the checks, the monthly breakdown, the draft correcting journals, and the same journals in
// Xero's manual-journal import layout. Pure — the download route turns these rows into .xlsx / .csv.

import type { LedgerEntityResult, LedgerGroup } from "@/lib/ledger-audit";
import type { CorrectionDraft } from "@/lib/ledger-corrections";

export type SheetRow = Record<string, string | number>;
export type LedgerSheetName = "checks" | "breakdown" | "corrections" | "xero-journal";
export const LEDGER_SHEETS: LedgerSheetName[] = ["checks", "breakdown", "corrections", "xero-journal"];

const groupName = (g: LedgerGroup, isZh: boolean) =>
  g === "DEFERRED_REVENUE" ? (isZh ? "递延收入" : "Deferred revenue") : g === "PREPAYMENT" ? (isZh ? "预付款项" : "Prepayments") : isZh ? "应计项目" : "Accruals";

const keyLabel = (k: string) => {
  const [y, m] = k.split("-");
  return `${y}-${m.padStart(2, "0")}`;
};
// Xero's manual-journal import reads dd/mm/yyyy.
const xeroDate = (iso: string) => iso.split("-").reverse().join("/");

export function buildLedgerSheets(results: LedgerEntityResult[], corrections: CorrectionDraft[], isZh: boolean): Record<LedgerSheetName, SheetRow[]> {
  const t = (zh: string, en: string) => (isZh ? zh : en);
  const status = (s: string) => (s === "pass" ? t("通过", "Pass") : s === "warn" ? t("需关注", "Review") : s === "fail" ? t("异常", "Exception") : t("提示", "Note"));

  const checks: SheetRow[] = [];
  const breakdown: SheetRow[] = [];
  for (const e of results) {
    for (const g of e.groups) {
      for (const c of g.checks) {
        checks.push({
          [t("主体", "Entity")]: e.label,
          [t("类别", "Type")]: groupName(g.group, isZh),
          [t("账户", "Account")]: c.account ?? "",
          [t("检查", "Check")]: c.title,
          [t("结果", "Result")]: status(c.status),
          [t("金额", "Amount")]: c.amount ?? "",
          [t("说明", "Detail")]: c.detail,
          [t("标准", "Criteria")]: c.criteria,
          [t("风险", "Risk")]: c.risk,
          [t("建议", "Recommendation")]: c.recommendation,
        });
      }
      for (const row of g.detail) {
        g.accounts.forEach((a, i) => {
          breakdown.push({
            [t("主体", "Entity")]: e.label, [t("类别", "Type")]: groupName(g.group, isZh), [t("月份", "Month")]: keyLabel(row.key),
            [t("账户", "Account")]: a.name, [t("余额", "Balance")]: row.balances[i] ?? "",
            [t("较上月变动", "Movement")]: "", [t("当月收入", "Revenue")]: "", [t("当月支出", "Spend")]: "",
            [t("资产负债表合计", "Balance-sheet total")]: "", [t("占比%", "Share %")]: "", [t("月数倍数", "Months of revenue / spend")]: "",
          });
        });
        breakdown.push({
          [t("主体", "Entity")]: e.label, [t("类别", "Type")]: groupName(g.group, isZh), [t("月份", "Month")]: keyLabel(row.key),
          [t("账户", "Account")]: t("合计", "Total"), [t("余额", "Balance")]: row.total,
          [t("较上月变动", "Movement")]: row.movement ?? "", [t("当月收入", "Revenue")]: row.revenue ?? "", [t("当月支出", "Spend")]: row.opex ?? "",
          [t("资产负债表合计", "Balance-sheet total")]: row.bsTotal ?? "", [t("占比%", "Share %")]: row.shareOfBs ?? "", [t("月数倍数", "Months of revenue / spend")]: row.months ?? "",
        });
      }
    }
  }

  const corr: SheetRow[] = [];
  const xero: SheetRow[] = [];
  for (const d of corrections) {
    const options = [{ label: t("方案 A（最可能）", "Option A (most likely)"), o: d.primary }, ...(d.alternative ? [{ label: t("方案 B（备选）", "Option B (alternative)"), o: d.alternative }] : [])];
    for (const { label, o } of options) {
      for (const l of o.lines) {
        corr.push({
          [t("主体", "Entity")]: d.entityLabel, [t("类别", "Type")]: groupName(d.group, isZh), [t("问题账户", "Account in question")]: d.account,
          [t("当前余额", "Balance now")]: d.balance, [t("方案", "Option")]: label, [t("可能原因", "Likely cause")]: o.cause,
          [t("日期", "Date")]: d.date, [t("摘要", "Narration")]: d.narration,
          [t("过账账户", "Journal account")]: l.account, [t("借方", "Debit")]: l.debit || "", [t("贷方", "Credit")]: l.credit || "",
          [t("过账前须确认", "Confirm before posting")]: d.confirm,
        });
      }
    }
    // Xero manual-journal import layout for option A: debit +, credit −. Account codes are not read from Xero, so they are left for the
    // person posting it — Xero refuses a row without one, which is the point: nothing goes in unreviewed.
    for (const l of d.primary.lines) {
      xero.push({
        "*Narration": d.narration, "*Date": xeroDate(d.date),
        Description: l.account,
        "*AccountCode": "", "*TaxRate": "", "*Amount": l.debit > 0 ? l.debit : -l.credit,
        TrackingName1: "", TrackingOption1: "", TrackingName2: "", TrackingOption2: "",
      });
    }
  }
  return { checks, breakdown, corrections: corr, "xero-journal": xero };
}

export function rowsToCsv(rows: SheetRow[], headers?: string[]): string {
  const cols = headers ?? (rows.length ? Object.keys(rows[0]) : []);
  const esc = (v: string | number | undefined) => {
    const s = v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Leading BOM keeps Excel from mangling Chinese text.
  return "﻿" + [cols.map(esc).join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\r\n");
}
