import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import Card from "@/components/ui/Card";
import { fmtMoney, type Locale } from "@/lib/i18n/dictionaries";
import type { CheckStatus, LedgerEntityResult, LedgerGroup } from "@/lib/ledger-audit";

const ICON: Record<CheckStatus, { Icon: typeof CheckCircle2; color: string }> = {
  pass: { Icon: CheckCircle2, color: "var(--status-good)" },
  warn: { Icon: AlertTriangle, color: "var(--status-warning)" },
  fail: { Icon: XCircle, color: "var(--status-critical)" },
  info: { Icon: Info, color: "var(--ink-400)" },
};

const keyLabel = (k: string) => {
  const [y, m] = k.split("-");
  return `${y}-${m.padStart(2, "0")}`;
};

// Internal audit → "Deferred revenue, prepayments & accruals": for each entity, the account balances read from the Xero balance sheet and the
// automatic accuracy checks on them. Server-rendered; nothing here is typed in.
export default function LedgerAuditPanel({ results, locale }: { results: LedgerEntityResult[]; locale: Locale }) {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const t = (zh: string, en: string) => (isZh ? zh : en);
  const money = (n: number | null) => (n === null ? "—" : fmtMoney(n, locale));
  const groupTitle = (g: LedgerGroup) => (g === "DEFERRED_REVENUE" ? t("递延收入", "Deferred revenue") : g === "PREPAYMENT" ? t("预付款项", "Prepayments") : t("应计项目", "Accruals"));

  const all = results.flatMap((r) => r.groups.flatMap((g) => g.checks));
  const count = (s: CheckStatus) => all.filter((c) => c.status === s).length;

  return (
    <Card title={t("递延收入 / 预付款项 / 应计项目 — 准确性检查（取自 Xero 资产负债表）", "Deferred revenue, prepayments & accruals — accuracy checks (from the Xero balance sheet)")}>
      <div className="mb-3 text-[12px] leading-relaxed" style={{ color: "var(--ink-400)" }}>
        {t(
          "每次同步后，系统按账户名称从 Xero 资产负债表读取这三类账户的月末余额，并自动检查：余额方向、是否在释放/摊销/冲回、规模是否合理、能否与资产负债表合计核对。有异常的项目会在「运行扫描」时自动生成审计发现。这些检查证明的是账务逻辑，不能代替对合同、发票和付款计划的逐笔核对。",
          "After every sync the system reads the month-end balances of these three kinds of account from the Xero balance sheet, by account name, and checks them automatically: which side the balance sits on, whether it is being released / amortised / reversed, whether its size is reasonable, and whether it ties to the balance-sheet total. Exceptions become audit findings when you run the scan. The checks prove the bookkeeping logic — they do not replace vouching to contracts, invoices and payment schedules.",
        )}
      </div>
      <div className="mb-4 flex flex-wrap gap-2 text-[12px] font-semibold">
        {(["pass", "warn", "fail", "info"] as CheckStatus[]).map((s) => {
          const { Icon, color } = ICON[s];
          return (
            <span key={s} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1" style={{ borderColor: "var(--border)", color: "var(--ink-900)" }}>
              <Icon size={13} style={{ color }} />
              {s === "pass" ? t("通过", "Passed") : s === "warn" ? t("需关注", "Review") : s === "fail" ? t("异常", "Exception") : t("提示", "Notes")} {count(s)}
            </span>
          );
        })}
      </div>

      <div className="space-y-6">
        {results.map((entity) => (
          <div key={entity.id ?? "hq"}>
            <div className="mb-2 text-[13.5px] font-extrabold" style={{ color: "var(--ink-900)" }}>
              {entity.label}
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {entity.groups.map((g) => (
                <div key={g.group} className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-[13px] font-bold" style={{ color: "var(--ink-900)" }}>
                      {groupTitle(g.group)}
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--ink-400)" }}>
                      {g.latestKey ? `${t("截至", "as at")} ${keyLabel(g.latestKey)}` : ""}
                    </span>
                  </div>

                  {g.accounts.length > 0 && (
                    <table className="mb-2.5 w-full text-[11.8px]">
                      <tbody>
                        {g.accounts.map((a) => (
                          <tr key={a.name} className="border-t" style={{ borderColor: "var(--border)" }}>
                            <td className="py-1 pr-2" style={{ color: "var(--ink-600)" }}>
                              {a.name}
                            </td>
                            <td className="py-1 text-right font-semibold tabular-nums" style={{ color: (a.latest ?? 0) < -1 ? "var(--status-critical)" : "var(--ink-900)" }}>
                              {money(a.latest)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <ul className="space-y-1.5">
                    {g.checks.map((c, i) => {
                      const { Icon, color } = ICON[c.status];
                      return (
                        <li key={`${c.id}-${c.account ?? ""}-${i}`} className="flex items-start gap-2 text-[12px]">
                          <Icon size={14} className="mt-0.5 shrink-0" style={{ color }} />
                          <span style={{ color: "var(--ink-900)" }}>
                            <b>{c.title}</b>
                            {c.account ? <span style={{ color: "var(--ink-400)" }}> · {c.account}</span> : null}
                            <span style={{ color: "var(--ink-600)" }}> — {c.detail}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
