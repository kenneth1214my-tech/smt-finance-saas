"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle, MinusCircle, Download, FileCode2, Loader2 } from "lucide-react";
import { fmtMoney, type Locale } from "@/lib/i18n/dictionaries";
import type { AcraPack, AcraLine, LineSection } from "@/lib/acra-xbrl";

export interface AcraEntityOption {
  id: string; // "hq" | "group" | subsidiary id
  name: string;
  uen: string | null;
}
type TemplateChoice = "auto" | "full" | "simplified";

// Tax Center → "XBRL (ACRA)": the company's statements laid out line by line against the ACRA taxonomy tags, the checks that
// they add up, and the .xbrl / CSV downloads for BizFinx.
export default function AcraXbrlPanel({ locale, years, defaultYear, entities, defaultEntity = "hq" }: { locale: Locale; years: number[]; defaultYear: number; entities: AcraEntityOption[]; defaultEntity?: string }) {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const t = (zh: string, en: string) => (isZh ? zh : en);
  const [year, setYear] = useState(defaultYear);
  const [entity, setEntity] = useState(defaultEntity);
  const [tpl, setTpl] = useState<TemplateChoice>("auto");
  const [pack, setPack] = useState<AcraPack | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [uens, setUens] = useState<Record<string, string>>(() => Object.fromEntries(entities.map((e) => [e.id, e.uen ?? ""])));
  const uen = uens[entity] ?? "";
  const setUen = (v: string) => setUens((m) => ({ ...m, [entity]: v }));
  const [uenMsg, setUenMsg] = useState("");

  const query = `year=${year}&entity=${encodeURIComponent(entity)}${tpl === "auto" ? "" : `&template=${tpl}`}`;

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/admin/acra-xbrl?${query}&format=json`);
    if (res.ok) setPack(await res.json());
    else setError(t("无法生成 ACRA 数据，请稍后再试。", "Could not build the ACRA data. Please try again."));
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveUen() {
    setUenMsg("");
    const res = await fetch("/api/admin/registration-no", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ registrationNo: uen, subsidiaryId: entity === "hq" || entity === "group" ? undefined : entity }) });
    if (res.ok) {
      setUenMsg(t("已保存。", "Saved."));
      await load();
    } else setUenMsg(t("格式不正确。", "Not a valid UEN."));
  }

  const sections: { id: LineSection; title: string }[] = [
    { id: "sfp", title: t("财务状况表（资产负债表）— 流动／非流动列示", "Statement of financial position — current / non-current") },
    { id: "pl", title: t("损益表 — 按费用性质列示", "Statement of profit or loss — by nature of expense") },
    { id: "cf", title: t("现金流量表（合计）", "Statement of cash flows (totals)") },
  ];
  const visible = (l: AcraLine) => !(l.fullOnly && pack?.template !== "Full XBRL");
  const blocked = !pack || !pack.readyForInstance || !pack.uen || pack.checks.some((c) => c.id === "uen" && c.ok === false);
  const money = (v: number | null) => (v === null ? "—" : fmtMoney(v, locale));
  const selectCls = "rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold";
  const selectStyle = { borderColor: "var(--border-strong)", background: "var(--surface)", color: "var(--ink-900)" } as const;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3 text-[12.5px]" style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--ink-600)" }}>
        {t(
          "按新加坡会计与企业管理局（ACRA）的 XBRL 申报要求，把财务报表逐行对应到 ACRA 分类标准 2026（v1.0）的标签，并检查各数字能否对上。生成的文件用于在 BizFinx 中打开、验证并随周年申报表提交。",
          "Lays the financial statements out line by line against the ACRA Taxonomy 2026 (v1.0) tags that ACRA's XBRL filing requires, and checks that the figures add up. The file is for opening and validating in BizFinx and filing with the annual return.",
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold" style={{ color: "var(--ink-400)" }}>
          {t("财政年度", "Financial year")}
        </span>
        <select className={selectCls} style={selectStyle} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => (
            <option key={y} value={y}>
              FY{y}
            </option>
          ))}
        </select>
        <select className={selectCls} style={selectStyle} value={entity} onChange={(e) => setEntity(e.target.value)} aria-label={t("主体", "Entity")}>
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.id === "group" ? t("集团合计（未抵销）", "Group total (no eliminations)") : e.id === "hq" ? `${e.name} — ${t("总公司", "company")}` : `${e.name} — ${t("子公司（独立申报）", "subsidiary (files separately)")}`}
            </option>
          ))}
        </select>
        <select className={selectCls} style={selectStyle} value={tpl} onChange={(e) => setTpl(e.target.value as TemplateChoice)} aria-label={t("XBRL 模板", "XBRL template")}>
          <option value="auto">{t("模板：按 ACRA 规模标准自动判断", "Template: decided by ACRA's size test")}</option>
          <option value="full">Full XBRL</option>
          <option value="simplified">Simplified XBRL</option>
        </select>
        {busy && <Loader2 size={15} className="animate-spin" style={{ color: "var(--ink-400)" }} />}
      </div>

      {error && (
        <div className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: "color-mix(in srgb, var(--status-critical) 12%, transparent)", color: "var(--status-critical)" }}>
          {error}
        </div>
      )}

      {pack && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
              <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--ink-400)" }}>
                {t("申报类型", "Filing type")}
              </div>
              <div className="mt-1 text-[15px] font-extrabold" style={{ color: "var(--ink-900)" }}>
                {pack.template}
              </div>
              <div className="mt-1 text-[12px]" style={{ color: "var(--ink-600)" }}>
                {pack.templateReason}
              </div>
              <div className="mt-2 text-[11px]" style={{ color: "var(--ink-400)" }}>
                {pack.taxonomy} · {pack.periodStart} → {pack.periodEnd}
              </div>
            </div>
            <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
              <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--ink-400)" }}>
                {t("该主体的 UEN（ACRA 申报必填）", "This entity's UEN (required by ACRA)")}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  value={uen}
                  onChange={(e) => setUen(e.target.value)}
                  placeholder="201234567A"
                  className="w-[170px] rounded-lg border px-2.5 py-1.5 text-[13px] font-semibold outline-none"
                  style={{ borderColor: "var(--border-strong)", background: "var(--surface)", color: "var(--ink-900)" }}
                />
                <button onClick={saveUen} className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-white" style={{ background: "var(--cat-1)" }}>
                  {t("保存", "Save")}
                </button>
                {uenMsg && (
                  <span className="text-[11.5px] font-semibold" style={{ color: "var(--ink-600)" }}>
                    {uenMsg}
                  </span>
                )}
              </div>
              <div className="mt-2 text-[11px]" style={{ color: "var(--ink-400)" }}>
                {pack.entityName}
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
            <div className="mb-2 text-[13px] font-bold" style={{ color: "var(--ink-900)" }}>
              {t("核对结果", "Checks")}
            </div>
            <ul className="space-y-1.5">
              {pack.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-[12.5px]">
                  {c.ok === true ? (
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0" style={{ color: "var(--status-good)" }} />
                  ) : c.ok === false ? (
                    <XCircle size={15} className="mt-0.5 shrink-0" style={{ color: "var(--status-critical)" }} />
                  ) : (
                    <MinusCircle size={15} className="mt-0.5 shrink-0" style={{ color: "var(--status-warning)" }} />
                  )}
                  <span style={{ color: "var(--ink-900)" }}>
                    <b>{c.label}</b> — <span style={{ color: "var(--ink-600)" }}>{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {sections.map((s) => {
            const rows = pack.lines.filter((l) => l.section === s.id && visible(l));
            if (rows.length === 0) return null;
            return (
              <div key={s.id} className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
                <div className="border-b px-3 py-2 text-[13px] font-bold" style={{ borderColor: "var(--border)", color: "var(--ink-900)", background: "var(--surface-2)" }}>
                  {s.title}
                </div>
                <table className="w-full min-w-[760px] text-[12.5px]">
                  <thead>
                    <tr style={{ color: "var(--ink-400)" }}>
                      <th className="px-3 py-1.5 text-left font-semibold">{t("项目", "Line item")}</th>
                      <th className="px-3 py-1.5 text-left font-semibold">{t("ACRA 标签", "ACRA tag")}</th>
                      <th className="px-3 py-1.5 text-right font-semibold">FY{pack.year}</th>
                      <th className="px-3 py-1.5 text-right font-semibold">FY{pack.year - 1}</th>
                      <th className="px-3 py-1.5 text-left font-semibold">{t("数据来源", "Source")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((l) => (
                      <tr key={l.element} className="border-t" style={{ borderColor: "var(--border)", background: l.kind === "subtotal" ? "var(--surface-2)" : "transparent" }}>
                        <td className="px-3 py-1.5" style={{ color: "var(--ink-900)", fontWeight: l.kind === "subtotal" ? 700 : 500 }}>
                          {l.label}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[11px]" style={{ color: "var(--ink-400)" }}>
                          {l.element}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: "var(--ink-900)", fontWeight: l.kind === "subtotal" ? 700 : 500 }}>
                          {money(l.current)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: "var(--ink-600)" }}>
                          {money(l.prior)}
                        </td>
                        <td className="px-3 py-1.5 text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                          {l.source}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={blocked ? undefined : `/api/admin/acra-xbrl?${query}&format=xbrl`}
              aria-disabled={blocked}
              className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-bold text-white"
              style={{ background: "var(--cat-1)", opacity: blocked ? 0.45 : 1, pointerEvents: blocked ? "none" : "auto" }}
            >
              <FileCode2 size={15} />
              {t("下载 XBRL 文件 (.xbrl)", "Download XBRL file (.xbrl)")}
            </a>
            <a
              href={blocked ? undefined : `/api/admin/acra-xbrl?${query}&format=csv`}
              aria-disabled={blocked}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[12.5px] font-bold"
              style={{ borderColor: "var(--border-strong)", color: "var(--ink-900)", opacity: blocked ? 0.45 : 1, pointerEvents: blocked ? "none" : "auto" }}
            >
              <Download size={15} />
              {t("下载明细表 (CSV)", "Download breakdown (CSV)")}
            </a>
            {blocked && (
              <span className="text-[11.5px] font-semibold" style={{ color: "var(--ink-400)" }}>
                {t("需要有效的 UEN 以及该财年的资产负债表和利润表后才能下载。", "A valid UEN and that year's balance sheet and profit and loss are needed before you can download.")}
              </span>
            )}
          </div>

          <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
            <div className="mb-1.5 text-[13px] font-bold" style={{ color: "var(--ink-900)" }}>
              {t("仍须由公司／审计师／会计师补充的部分", "Still to be completed by the company, auditor or accountant")}
            </div>
            <ul className="list-disc space-y-1 pl-5 text-[12px]" style={{ color: "var(--ink-600)" }}>
              {pack.todo.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
