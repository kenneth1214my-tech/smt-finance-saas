import { Fragment } from "react";
import { fmtMoney, type Locale } from "@/lib/i18n/dictionaries";
import type { BreakdownSection } from "@/lib/treasury-breakdown";

// Collapsible "how this number is calculated" panels, one per KPI. Server component — no state needed,
// the native <details> element handles open/close.
export default function KpiBreakdown({ sections, locale, unit, heading, hint }: { sections: BreakdownSection[]; locale: Locale; unit: string; heading: string; hint: string }) {
  const fmt = (n: number | null, format?: "pct" | "count" | "x" | "pershare") =>
    n === null
      ? "—"
      : format === "pct"
        ? `${(n + 0).toFixed(1)}%`
        : format === "x"
          ? `${(n + 0).toFixed(2)}x`
          : format === "pershare"
            ? (n + 0).toFixed(4)
            : format === "count"
              ? Math.round(n).toLocaleString("en-US")
              : fmtMoney(n + 0, locale); // + 0 turns -0 into 0
  return (
    <section className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="mb-1 text-[14px] font-extrabold" style={{ color: "var(--ink-900)" }}>{heading}</div>
      <p className="mb-3 text-[11.8px] leading-relaxed" style={{ color: "var(--ink-400)" }}>{hint}</p>
      <div className="space-y-2">
        {sections.map((s) => (
          <details key={s.id} className="group rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5 text-[13px] font-bold" style={{ color: "var(--ink-900)" }}>
              <span>{s.title}</span>
              <span className="tabular-nums" style={{ color: s.result !== null && s.result < 0 ? "var(--status-critical)" : "var(--ink-900)" }}>
                {fmt(s.result, s.resultFormat)} {(!s.resultFormat || s.resultFormat === "pershare") && <span className="text-[11px] font-semibold" style={{ color: "var(--ink-400)" }}>{unit}</span>}
              </span>
            </summary>
            <div className="border-t px-3.5 py-3" style={{ borderColor: "var(--border)" }}>
              <p className="mb-2.5 text-[12px] leading-relaxed" style={{ color: "var(--ink-600)" }}>
                <b>ƒ</b> {s.formula}
              </p>
              {s.explanation && (
                <div className="mb-3 rounded-lg px-3 py-2.5 text-[12px] leading-relaxed" style={{ background: "var(--surface-2)", color: "var(--ink-600)" }}>
                  <div className="mb-1 text-[11.5px] font-extrabold uppercase tracking-wide" style={{ color: "var(--ink-400)" }}>
                    {locale === "zh" || locale === "zh-Hant" ? "指标说明" : "Explanation"}
                  </div>
                  <p>{s.explanation.meaning}</p>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                    {s.explanation.interpretation.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                  {s.explanation.current && (
                    <p className="mt-2 font-semibold" style={{ color: "var(--ink-900)" }}>
                      {locale === "zh" || locale === "zh-Hant" ? "当前解读：" : "Current reading: "}
                      {s.explanation.current}
                    </p>
                  )}
                </div>
              )}
              {s.rows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-[12.4px]">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold" style={{ color: "var(--ink-400)" }}>
                      <th className="pb-1.5" />
                      {s.cols.map((c) => (
                        <th key={c} className="pb-1.5 text-right">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.rows.map((r, i) => {
                      const strong = r.kind === "total";
                      const muted = r.kind === "muted" || r.kind === "check";
                      return (
                        <Fragment key={i}>
                        <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                          <td className={`py-1.5 pr-3 ${strong ? "font-bold" : ""}`} style={{ color: muted ? "var(--ink-400)" : "var(--ink-900)" }}>
                            {r.label}
                            {r.hint && <div className="text-[10.8px] font-normal" style={{ color: "var(--ink-400)" }}>{r.hint}</div>}
                          </td>
                          {r.values.map((v, j) => (
                            <td key={j} className={`tabular-nums py-1.5 text-right ${strong ? "font-bold" : ""}`} style={{ color: muted ? "var(--ink-400)" : v !== null && v < 0 ? "var(--status-critical)" : undefined }}>
                              {fmt(v, r.format)}
                            </td>
                          ))}
                        </tr>
                        {r.accounts && r.accounts.length > 0 && (
                          <tr>
                            <td colSpan={s.cols.length + 1} className="pb-2 pl-3">
                              <details className="rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                                <summary className="cursor-pointer select-none px-2.5 py-1.5 text-[11.5px] font-semibold" style={{ color: "var(--ink-600)" }}>
                                  {locale === "zh" || locale === "zh-Hant" ? `查看构成该数字的 Xero 科目（${r.accounts.length}）` : `Show the Xero accounts behind this figure (${r.accounts.length})`}
                                </summary>
                                <table className="w-full text-[11.8px]">
                                  <tbody>
                                    {r.accounts.map((a) => (
                                      <tr key={a.name} className="border-t" style={{ borderColor: "var(--border)" }}>
                                        <td className="py-1 pl-2.5 pr-3" style={{ color: "var(--ink-600)" }}>{a.name}</td>
                                        {a.values.map((v, j) => (
                                          <td key={j} className="tabular-nums py-1 pr-1 text-right" style={{ color: v !== null && v < 0 ? "var(--status-critical)" : "var(--ink-900)" }}>
                                            {v === null || Math.abs(v) < 0.005 ? "–" : fmt(v)}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                    {(() => {
                                      const sums = s.cols.map((_, j) => Math.round(r.accounts!.reduce((x, a) => x + (a.values[j] ?? 0), 0) * 100) / 100);
                                      const diffs = sums.map((x, j) => (r.values[j] === null ? 0 : Math.round(((r.values[j] as number) - x) * 100) / 100));
                                      const off = diffs.some((d) => Math.abs(d) > 0.5);
                                      return (
                                        <>
                                          <tr className="border-t font-bold" style={{ borderColor: "var(--border)" }}>
                                            <td className="py-1 pl-2.5">{locale === "zh" || locale === "zh-Hant" ? "科目合计" : "Total of the accounts"}</td>
                                            {sums.map((x, j) => (
                                              <td key={j} className="tabular-nums py-1 pr-1 text-right">{fmt(x)}</td>
                                            ))}
                                          </tr>
                                          {off && (
                                            <tr style={{ color: "var(--status-warning)" }}>
                                              <td className="py-1 pl-2.5">{locale === "zh" || locale === "zh-Hant" ? "与上方数字的差额（该月科目明细尚不完整，请再次「全部同步」）" : "Difference to the figure above (account detail for that month is incomplete — Sync all again)"}</td>
                                              {diffs.map((d, j) => (
                                                <td key={j} className="tabular-nums py-1 pr-1 text-right">{Math.abs(d) > 0.5 ? fmt(d) : "–"}</td>
                                              ))}
                                            </tr>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </tbody>
                                </table>
                              </details>
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
              {s.notes?.map((n, i) => (
                <p key={i} className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--ink-400)" }}>{n}</p>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
