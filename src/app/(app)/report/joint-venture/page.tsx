import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { requireUser, canApprove } from "@/lib/dal";
import { db } from "@/lib/db";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getBaseCurrency } from "@/lib/currency";
import { loadJointVentures, type JointVentureView } from "@/lib/joint-venture-data";
import type { JvFlag, JvIssue, JvYearResult } from "@/lib/joint-venture";
import Topbar from "@/components/Topbar";
import Card from "@/components/ui/Card";
import JointVentureClient from "./JointVentureClient";

const money = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const plain = <T,>(rows: T[]) => JSON.parse(JSON.stringify(rows)) as Record<string, unknown>[];

export default async function JointVenturePage() {
  const user = await requireUser();
  const locale = await getServerLocale();
  const dict = getDictionary(locale);
  const isZh = locale === "zh" || locale === "zh-Hant";
  const t = (zh: string, en: string) => (isZh ? zh : en);

  let jvs: JointVentureView[] = [];
  let loadError = false;
  try {
    jvs = await loadJointVentures(user.organizationId);
  } catch {
    loadError = true; // logged by the loader; the page says so instead of failing
  }
  const baseCurrency = await getBaseCurrency(user.organizationId);
  const org = await db.organization.findUnique({ where: { id: user.organizationId }, select: { jurisdiction: true } });
  const isHk = org?.jurisdiction === "HK";
  // The standards that govern joint arrangements and the equity method in this jurisdiction.
  const standards = isHk ? "HKFRS 11 / HKAS 28" : "SFRS(I) 11 / SFRS(I) 1-28";
  let jvRows: Record<string, unknown>[] = [];
  let periodRows: Record<string, unknown>[] = [];
  try {
    jvRows = plain(await db.jointVenture.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "asc" } }));
    periodRows = plain(await db.jointVenturePeriod.findMany({ where: { organizationId: user.organizationId }, orderBy: [{ year: "desc" }] }));
  } catch {
    // table not there yet (database not migrated) — the page still opens
  }

  const flagText = (f: JvFlag): { tone: "warn" | "info"; text: string } =>
    f === "losses-unrecognised"
      ? { tone: "info", text: t("应占亏损超过投资账面值，超出部分不再确认，记入「未确认亏损」，待日后盈利先行抵销。", "The share of losses exceeds the carrying amount; the excess is not recognised and is carried as unrecognised losses, set against later profits first.") }
      : f === "net-liabilities"
        ? { tone: "info", text: t("合营企业净负债。除非集团有法律或推定义务代其付款，否则不确认负债。", "The joint venture has net liabilities. No liability is recognised unless the Group has a legal or constructive obligation to fund it.") }
        : f === "carrying-negative"
          ? { tone: "warn", text: t("股息或折算差额使账面值降到零以下，请核对数据。", "Dividends or translation took the carrying amount below zero — check the figures.") }
          : f === "ledger-matches"
            ? { tone: "info", text: t("总部账（Xero）已按权益法入账（审计调整分录），与上表一致，集团报表无需再调整。", "HQ's ledger (Xero) already carries the equity-method result (the audit adjustment journals) and agrees to the schedule above, so no further Group adjustment is made.") }
            : { tone: "info", text: t("总部账上的数字与权益法不一致；集团报表已按上表的调整数调整。", "HQ's ledger does not agree to the equity-method figures; the Group statements are adjusted by the amounts in the schedule above.") };

  const issueText = (i: JvIssue): string => {
    const yr = i.year === null ? "" : `${i.year}: `;
    const amt = i.amount === null ? "" : money(i.amount);
    switch (i.code) {
      case "year-gap":
        return yr + t("该年度缺少数据，其间的应占利润/(亏损)未被确认。请补录。", "no figures for this year, so its share of result is not recognised. Add the year.");
      case "negative-input":
        return yr + t(`投入资本、股息或减值不能为负数（${amt}）。`, `capital, dividends and impairment cannot be negative (${amt}).`);
      case "hq-charge-exceeds-schedule":
        return yr + t(`总部账上已计入的费用比本表确认的多 ${amt}，请核对总部分录。`, `HQ's ledger carries ${amt} more charge than this schedule recognises — check HQ's journal.`);
      case "ledger-written-down-no-charge":
        return yr + t(`总部账上的投资比成本低 ${amt}，但未录入总部已计入的费用；集团利润会被重复扣减。请录入「总部已在自身损益中计入的费用」。`, `HQ's ledger holds the investment ${amt} below cost but no charge booked by HQ was entered, so the Group profit would be reduced twice. Enter "Charge HQ already booked in its own P&L".`);
      default:
        return t(`持股比例不在 0–100% 范围内（${amt}）。`, `Ownership is outside 0–100% (${amt}).`);
    }
  };

  const lines = (): [string, (r: JvYearResult) => number | null, boolean?][] => [
    [t("年初账面值", "Opening carrying amount"), (r) => r.opening],
    [t("＋ 本年投入资本", "+ Capital put in"), (r) => r.capitalAdded],
    [t("－ 收到的股息", "− Dividends received"), (r) => -r.dividendsReceived],
    [t("± 外币折算差额", "± Translation"), (r) => r.translation],
    [t("应占合营企业利润/(亏损)（上限前）", "Share of result before the loss cap"), (r) => r.shareOfResult],
    [t("　其中：确认于损益", "of which recognised in profit or loss"), (r) => r.recognised],
    [t("－ 减值", "− Impairment"), (r) => -r.impairment],
    [t("年末账面值（对合营企业的投资）", "Closing carrying amount (investment in JV)"), (r) => r.closing, true],
    [t("备忘：年初未确认亏损", "Memo: unrecognised losses brought forward"), (r) => r.unrecognisedBroughtForward],
    [t("备忘：年末未确认亏损", "Memo: unrecognised losses carried forward"), (r) => r.unrecognisedCarriedForward, true],
    [t("应占合营企业年末净资产/(负债)", "Share of JV net assets / (liabilities)"), (r) => r.shareOfNetAssets],
    [t("总部账上年末账面值", "HQ ledger carrying amount"), (r) => r.hqLedgerCarrying],
    [t("集团资产负债表调整数", "Group balance sheet adjustment"), (r) => r.balanceAdjustment],
    [t("集团利润调整数", "Group profit adjustment"), (r) => r.profitAdjustment],
  ];

  const table = (jv: JointVentureView) => {
    const ys = jv.years;
    const rows = lines();
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-[12.4px]">
          <thead>
            <tr style={{ color: "var(--ink-400)" }}>
              <th className="pb-2 text-left font-semibold">{t("项目", "Line")}</th>
              {ys.map((y) => (
                <th key={y.year} className="pb-2 text-right font-semibold">
                  {y.year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, pick, bold], i) => (
              <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className={`py-1.5 ${bold ? "font-bold" : ""}`} style={{ color: "var(--ink-900)" }}>
                  {label}
                </td>
                {ys.map((y) => (
                  <td key={y.year} className={`tabular-nums py-1.5 text-right ${bold ? "font-bold" : ""}`} style={{ color: "var(--ink-900)" }}>
                    {money(pick(y))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const currentYear = new Date().getFullYear();

  return (
    <>
      <Topbar dict={dict} locale={locale} title={t("合营企业（权益法）", "Joint ventures (equity method)")} desc={t("合营企业（权益法）", "Joint ventures (equity method)")} user={user} />
      <div className="mx-auto w-full max-w-[1480px] flex-1 space-y-4 px-[26px] py-5">
        <Card title={t("会计处理", "Accounting treatment")}>
          <div className="space-y-2 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-600)" }}>
            <p>
              {t(
                `合营企业不是子公司，不逐项合并。依据 ${standards}，集团报表按权益法列示：投资以成本入账，随集团应占合营企业利润/(亏损)增减，收到的股息冲减账面值；应占利润/(亏损)作为一行列在营业利润之下（不计入 EBIT / EBITDA）。`,
                `A joint venture is not a subsidiary and is never consolidated line by line. Under ${standards} the Group statements use the equity method: the investment starts at cost, moves with the Group's share of the joint venture's profit or loss, and falls with dividends received. The share of result is one line below operating profit (outside EBIT and EBITDA).`,
              )}
            </p>
            <p>
              {t(
                "应占亏损只确认到账面值为零；超出部分记为「未确认亏损」，日后盈利须先抵销它才再确认利润。总部自己的账（Xero）通常按成本记录——系统用下表算出集团应有的数字，并与总部账上数对比，差额即是集团报表的调整数。",
                "Losses are recognised only down to a nil carrying amount; the excess is carried as unrecognised losses, and later profits first make those good before any profit is recognised. HQ's own ledger (Xero) normally carries the investment at cost — the schedule below works out what the Group should show and compares it with HQ's ledger; the difference is the adjustment applied to the Group statements.",
              )}
            </p>
            <p>
              {t(
                `数据来源：合营企业自己的账目（折算为${baseCurrency}、并按集团会计政策调整）。合营企业接入 Xero 之前，每年只需录入一次下方的年度数据；其余全部自动计算，不需要手工做分录。`,
                `Source of the figures: the joint venture's own accounts (translated to ${baseCurrency} and brought into line with Group policies). Until it is on Xero, enter the yearly figures below once a year; everything else is calculated, with no manual journals.`,
              )}
            </p>
          </div>
        </Card>

        {loadError && (
          <Card title={t("无法读取", "Could not be loaded")}>
            <p className="text-[12.5px]" style={{ color: "var(--ink-900)" }}>
              {t("合营企业数据暂时无法读取，集团报表因此未包含合营企业。请刷新；若持续出现，请联系管理员。", "The joint-venture figures could not be loaded, so the Group statements do not include the joint venture. Refresh; if this persists, contact your administrator.")}
            </p>
          </Card>
        )}

        {jvs.map((jv) => {
          const latest = jv.years[jv.years.length - 1];
          const flags = latest ? latest.flags : [];
          const stale = !latest || latest.year < currentYear - 1;
          return (
            <Card key={jv.id} title={`${jv.name} · ${jv.country} · ${jv.ownershipPct}%`}>
              <div className="mb-3 text-[12px]" style={{ color: "var(--ink-400)" }}>
                {t("记账货币", "Functional currency")} {jv.currency}
                {jv.acquiredOn ? ` · ${t("取得于", "acquired")} ${jv.acquiredOn}` : ""}
                {jv.investmentAccountName ? ` · ${t("总部 Xero 科目", "HQ Xero account")}: ${jv.investmentAccountName}` : ""}
              </div>
              {jv.years.length === 0 ? (
                <p className="text-[12.5px]" style={{ color: "var(--ink-400)" }}>
                  {t("尚无年度数据——请在下方新增第一个财政年度。", "No yearly figures yet — add the first financial year below.")}
                </p>
              ) : (
                table(jv)
              )}
              {jv.years.length > 0 && (
                <div className="mt-2 text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                  {t("总部账上账面值来源：", "HQ ledger carrying amount source: ")}
                  {jv.years
                    .map((y) => `${y.year} ${jv.ledgerSource[y.year] === "xero" ? t("Xero 自动读取", "read from Xero") : jv.ledgerSource[y.year] === "xero-nil" ? t("Xero 中该科目无余额（视为零）", "no balance on the account in Xero (taken as nil)") : jv.ledgerSource[y.year] === "input" ? t("手工录入", "typed in") : t("按成本（尚未从 Xero 同步到）", "cost (not yet synced from Xero)")}`)
                    .join(" · ")}
                </div>
              )}
              <ul className="mt-3 space-y-1.5">
                {jv.issues.map((i, k) => (
                  <li key={`issue-${k}`} className="flex items-start gap-2 text-[12px]" style={{ color: "var(--ink-900)" }}>
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: "var(--status-critical)" }} />
                    {issueText(i)}
                  </li>
                ))}
                {stale && (
                  <li className="flex items-start gap-2 text-[12px]" style={{ color: "var(--ink-900)" }}>
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: "var(--status-warning)" }} />
                    {latest
                      ? t(`最新的年度数据是 ${latest.year} 年，${currentYear - 1} 年的数据尚未录入。`, `The latest yearly figures are for ${latest.year}; ${currentYear - 1} has not been entered yet.`)
                      : t("没有任何年度数据，集团报表暂不含这家合营企业。", "No yearly figures, so the Group statements do not include this joint venture yet.")}
                  </li>
                )}
                {flags.map((f) => {
                  const { tone, text } = flagText(f);
                  return (
                    <li key={f} className="flex items-start gap-2 text-[12px]" style={{ color: "var(--ink-900)" }}>
                      {tone === "warn" ? <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: "var(--status-warning)" }} /> : <Info size={14} className="mt-0.5 shrink-0" style={{ color: "var(--ink-400)" }} />}
                      {text}
                    </li>
                  );
                })}
                {latest && !stale && flags.length === 0 && jv.issues.length === 0 && (
                  <li className="flex items-start gap-2 text-[12px]" style={{ color: "var(--ink-900)" }}>
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0" style={{ color: "var(--status-good)" }} />
                    {t("没有发现异常。", "No exceptions found.")}
                  </li>
                )}
              </ul>
            </Card>
          );
        })}

        {canApprove(user.role) && (
          <Card title={t("录入", "Set-up and yearly figures")}>
            <JointVentureClient jointVentures={jvRows} periods={periodRows} isZh={isZh} baseCurrency={baseCurrency} />
          </Card>
        )}
      </div>
    </>
  );
}
