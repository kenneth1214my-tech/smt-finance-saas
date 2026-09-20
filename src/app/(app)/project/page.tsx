import { ClipboardList, Wallet, TrendingUp, AlertTriangle } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary, withBaseCurrency, fmtMoney } from "@/lib/i18n/dictionaries";
import { localizedSegment } from "@/lib/localize";
import { getBaseCurrency } from "@/lib/currency";
import Topbar from "@/components/Topbar";
import Card from "@/components/ui/Card";
import KpiTile from "@/components/ui/KpiTile";
import RankList from "@/components/ui/RankList";
import StatusPill from "@/components/ui/StatusPill";

const fmt1 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const STATUS_COLOR: Record<string, string> = { ON_TRACK: "var(--status-good)", AHEAD: "var(--cat-1)", DELAYED: "var(--status-critical)" };
const STATUS_TONE: Record<string, "good" | "critical"> = { ON_TRACK: "good", AHEAD: "good", DELAYED: "critical" };

export default async function ProjectPage() {
  const user = await requireUser();
  const locale = await getServerLocale();
  const baseCurrency = await getBaseCurrency(user.organizationId);
  const dict = withBaseCurrency(getDictionary(locale), locale, baseCurrency);
  const fmtM = (n: number) => fmtMoney(n, locale);

  const projects = await db.project.findMany({ where: { organizationId: user.organizationId }, include: { subsidiary: true }, orderBy: { progressPct: "desc" } });

  const totalBudget = projects.reduce((a, p) => a + Number(p.budget), 0);
  const totalSpent = projects.reduce((a, p) => a + Number(p.spent), 0);
  const delayedCount = projects.filter((p) => p.status === "DELAYED").length;
  const subsidiaryCount = new Set(projects.map((p) => p.subsidiaryId)).size;

  const statusLabel = (s: string) => (s === "ON_TRACK" ? dict.m.projStatusOnTrack : s === "AHEAD" ? dict.m.projStatusAhead : dict.m.projStatusDelayed);

  return (
    <>
      <Topbar dict={dict} locale={locale} title={dict.nav.project} desc={dict.nav.project} user={user} />
      <div className="mx-auto w-full max-w-[1480px] flex-1 space-y-4 px-[26px] py-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiTile icon={ClipboardList} color="var(--cat-1)" label={dict.m.projectCount} value={String(projects.length)} note={locale === "en" ? `Across ${subsidiaryCount} subsidiaries` : `覆盖${subsidiaryCount}家子公司`} />
          <KpiTile icon={Wallet} color="var(--cat-2)" label={dict.m.totalInvestBudget} value={fmtM(totalBudget)} unit={dict.common.yi} />
          <KpiTile icon={TrendingUp} color="var(--cat-4)" label={dict.m.cumInvest} value={fmtM(totalSpent)} unit={dict.common.yi} note={`${fmt1(totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0)}%`} />
          <KpiTile icon={AlertTriangle} color="var(--status-warning)" label={dict.m.delayedProjects} value={String(delayedCount)} note={locale === "en" ? "Needs follow-up" : "需重点跟进"} />
        </div>

        <Card title={dict.m.projectCompareCard} unit="%">
          <RankList
            items={projects.map((p) => ({
              id: p.id,
              label: locale === "en" ? p.nameEn : p.nameZh,
              value: p.progressPct,
              color: STATUS_COLOR[p.status],
            }))}
            unit="%"
            valueFmt={(n) => String(n)}
          />
        </Card>

        <Card title={dict.m.projectProgressCard} unit={dict.common.yi}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.6px]">
              <thead>
                <tr className="text-left text-[11.3px] font-semibold" style={{ color: "var(--ink-400)" }}>
                  <th className="pb-2">{dict.m.thProjectName}</th>
                  <th className="pb-2">{dict.m.thSubsidiary}</th>
                  <th className="pb-2 text-right">{dict.m.thInvestBudget}</th>
                  <th className="pb-2 text-right">{dict.m.thInvestDone}</th>
                  <th className="pb-2">{dict.m.thPhysProgress}</th>
                  <th className="pb-2">{dict.m.thStatus}</th>
                  <th className="pb-2">{dict.m.thOwner}</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 font-semibold" style={{ color: "var(--ink-900)" }}>
                      {locale === "en" ? p.nameEn : p.nameZh}
                    </td>
                    <td className="py-2.5" style={{ color: "var(--ink-400)" }}>
                      {localizedSegment(p.subsidiary, locale)}
                    </td>
                    <td className="tabular-nums py-2.5 text-right">{fmtM(Number(p.budget))}</td>
                    <td className="tabular-nums py-2.5 text-right">{fmtM(Number(p.spent))}</td>
                    <td className="py-2.5">
                      <span className="mr-2 inline-block h-1.5 w-16 overflow-hidden rounded-full align-middle" style={{ background: "var(--surface-2)" }}>
                        <span className="block h-full rounded-full" style={{ width: `${p.progressPct}%`, background: STATUS_COLOR[p.status] }} />
                      </span>
                      <span className="tabular-nums font-bold text-[12px]">{p.progressPct}%</span>
                    </td>
                    <td className="py-2.5">
                      <StatusPill tone={STATUS_TONE[p.status]} label={statusLabel(p.status)} />
                    </td>
                    <td className="py-2.5" style={{ color: "var(--ink-400)" }}>
                      {p.owner}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
