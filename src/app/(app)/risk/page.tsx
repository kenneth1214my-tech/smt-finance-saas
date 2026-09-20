import { ShieldAlert, AlertOctagon, Clock, Building2 } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localizedText } from "@/lib/localize";
import Topbar from "@/components/Topbar";
import Card from "@/components/ui/Card";
import KpiTile from "@/components/ui/KpiTile";
import RankList from "@/components/ui/RankList";
import StatusPill from "@/components/ui/StatusPill";

const RISK_TONE: Record<string, "good" | "warning" | "serious" | "critical"> = { GOOD: "good", WARNING: "warning", SERIOUS: "serious", CRITICAL: "critical" };
const SEV_COLOR: Record<string, string> = { GOOD: "var(--status-good)", WARNING: "var(--status-warning)", SERIOUS: "var(--status-serious)", CRITICAL: "var(--status-critical)" };
const CAT_KEY: Record<string, keyof ReturnType<typeof getDictionary>["m"]> = {
  opRisk: "riskCatOpRisk",
  costRisk: "riskCatCostRisk",
  creditRisk: "riskCatCreditRisk",
  marketRisk: "riskCatMarketRisk",
  liquidityRisk: "riskCatLiquidityRisk",
  complianceRisk: "riskCatComplianceRisk",
};
const TAG_KEY: Record<string, keyof ReturnType<typeof getDictionary>["m"]> = {
  revDecline: "riskTagRevDecline",
  costUp: "riskTagCostUp",
  arRisk: "riskTagArRisk",
  fxRisk: "riskTagFxRisk",
  projDelay: "riskTagProjDelay",
  creditConc: "riskTagCreditConc",
  taxAudit: "riskTagTaxAudit",
  closed: "riskTagClosed",
};

export default async function RiskPage() {
  const user = await requireUser();
  const locale = await getServerLocale();
  const dict = getDictionary(locale);
  const isZh = locale === "zh" || locale === "zh-Hant";

  const alerts = await db.riskAlert.findMany({ where: { organizationId: user.organizationId }, orderBy: { occurredAt: "desc" } });
  const open = alerts.filter((a) => a.severity !== "GOOD");
  // No resolved/open status field exists — "closed" is a tag value entered like any other,
  // so we treat un-tagged-closed open alerts as the pending count rather than inventing one.
  const pending = open.filter((a) => a.tag !== "closed");
  const high = alerts.filter((a) => a.severity === "CRITICAL" || a.severity === "SERIOUS");
  const entities = new Set(alerts.map((a) => a.entityLabel));

  const catCounts = new Map<string, number>();
  for (const a of open) catCounts.set(a.category, (catCounts.get(a.category) || 0) + 1);
  const catRows = Array.from(catCounts.entries()).sort((a, b) => b[1] - a[1]);
  const catColors = ["var(--status-critical)", "var(--status-serious)", "var(--status-warning)", "var(--cat-4)", "var(--cat-1)", "var(--cat-3)"];

  const severityLabel = (s: string) => (s === "GOOD" ? dict.status.good : s === "WARNING" ? dict.status.warning : s === "SERIOUS" ? dict.status.serious : dict.status.critical);

  // Generated from real alert-category counts rather than fixed narrative text, so it reflects
  // whatever risks are actually entered instead of a canned demo scenario.
  const advice = catRows.map(([cat, count]) => [
    dict.m[CAT_KEY[cat]] || cat,
    isZh ? `当前有 ${count} 条相关预警，建议优先关注并跟踪处理进度` : `${count} related alert(s) open — prioritize review and track remediation`,
  ]);

  return (
    <>
      <Topbar dict={dict} locale={locale} title={dict.nav.risk} desc={dict.nav.risk} user={user} />
      <div className="mx-auto w-full max-w-[1480px] flex-1 space-y-4 px-[26px] py-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiTile icon={ShieldAlert} color="var(--cat-1)" label={dict.m.alertCount} value={String(open.length)} />
          <KpiTile icon={AlertOctagon} color="var(--status-critical)" label={dict.m.highRiskCount} value={String(high.length)} />
          <KpiTile icon={Clock} color="var(--status-warning)" label={dict.m.pendingCount} value={String(pending.length)} />
          <KpiTile icon={Building2} color="var(--cat-4)" label={dict.m.entityCount} value={String(entities.size)} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={dict.m.riskByCatCard}>
            <RankList
              items={catRows.map(([cat, count], i) => ({
                id: cat,
                label: dict.m[CAT_KEY[cat]] || cat,
                value: count,
                color: catColors[i % catColors.length],
              }))}
              unit={isZh ? "条" : ""}
              valueFmt={(n) => String(n)}
            />
          </Card>
          <Card title={dict.m.riskAdviceCard}>
            <div className="space-y-2.5 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-600)" }}>
              {advice.length === 0 ? (
                <p style={{ color: "var(--ink-400)" }}>{isZh ? "暂无未处理预警" : "No open alerts"}</p>
              ) : (
                advice.map(([label, text]) => (
                  <p key={label}>
                    · <b style={{ color: "var(--ink-900)" }}>{label}</b>：{text}
                  </p>
                ))
              )}
            </div>
          </Card>
        </div>

        <Card title={dict.m.riskListCard}>
          <div className="flex flex-col">
            {alerts.map((a, i) => (
              <div key={a.id} className="flex items-start gap-3 border-t py-3 first:border-t-0" style={{ borderColor: "var(--border)" }}>
                <div
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-extrabold text-white"
                  style={{ background: SEV_COLOR[a.severity] }}
                >
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.8px] font-medium" style={{ color: "var(--ink-900)" }}>
                    {localizedText(a, locale)}
                  </div>
                  <div className="mt-1 text-[11px]" style={{ color: "var(--ink-400)" }}>
                    {a.entityLabel} · {dict.m[CAT_KEY[a.category]] || a.category} · {a.occurredAt.toISOString().slice(5, 10).replace("-", "-")}
                  </div>
                </div>
                <StatusPill tone={RISK_TONE[a.severity]} label={severityLabel(a.severity)} />
                <span
                  className="whitespace-nowrap rounded-full px-2.5 py-1 text-[10.5px] font-bold"
                  style={{ background: `color-mix(in srgb, ${SEV_COLOR[a.severity]} 16%, transparent)`, color: SEV_COLOR[a.severity] }}
                >
                  {dict.m[TAG_KEY[a.tag]] || a.tag}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
