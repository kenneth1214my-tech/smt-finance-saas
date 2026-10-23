"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { Upload, Download, FileSpreadsheet, ChevronDown, ChevronUp } from "lucide-react";

export interface BudgetEntity {
  key: string; // subsidiary key; "" = the group / company itself
  names: string[]; // every spelling the file may use for this entity
  label: string;
}

interface ParsedRow {
  line: number;
  entity: BudgetEntity | null;
  year: number;
  revenueBudget: number;
  costRate: number;
  expRate: number;
  error: string | null;
}

// Annual budget from Excel / CSV, one row per legal entity. Amounts (cost of sales, operating expenses) are converted to the
// budget rates the platform stores, so a finance team can paste its own budget sheet without doing the arithmetic.
export default function BudgetImport({ entities, defaultYear, isZh, hasXeroBudget }: { entities: BudgetEntity[]; defaultYear: number; isZh: boolean; hasXeroBudget: boolean }) {
  const t = (zh: string, en: string) => (isZh ? zh : en);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-%()（）]/g, "");
  const num = (s: string) => {
    const v = Number(String(s ?? "").replace(/,/g, "").replace(/[^\d.\-]/g, ""));
    return Number.isFinite(v) ? v : NaN;
  };

  function downloadTemplate() {
    const head = ["Entity", "Entity key", "Year", "Revenue budget", "Cost of sales budget", "Operating expense budget"];
    const lines = [head, ...entities.map((e) => [e.label, e.key, String(defaultYear), "", "", ""])];
    const csv = "﻿" + lines.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n") + "\r\n";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `budget_template_${defaultYear}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function parseCsv(text: string): string[][] {
    return text
      .split(/\r?\n/)
      .filter((l) => l.trim().length)
      .map((line) => {
        const out: string[] = [];
        let cur = "";
        let q = false;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (q) {
            if (c === '"' && line[i + 1] === '"') {
              cur += '"';
              i++;
            } else if (c === '"') q = false;
            else cur += c;
          } else if (c === '"') q = true;
          else if (c === ",") {
            out.push(cur.trim());
            cur = "";
          } else cur += c;
        }
        out.push(cur.trim());
        return out;
      });
  }

  function interpret(table: string[][]): ParsedRow[] {
    const header = table[0].map(norm);
    const find = (...names: string[]) => header.findIndex((h) => names.includes(h));
    const iEntity = find("entity", "entityname", "subsidiary", "company", "name");
    const iKey = find("entitykey", "subsidiarykey", "key");
    const iYear = find("year");
    const iRev = find("revenuebudget", "revenue", "annualrevenuebudget");
    const iCost = find("costofsalesbudget", "costbudget", "cost");
    const iCostRate = find("costbudgetrate", "costrate");
    const iExp = find("operatingexpensebudget", "expensebudget", "expenses", "expense");
    const iExpRate = find("expensebudgetrate", "expenserate");
    const byName = new Map<string, BudgetEntity>();
    for (const e of entities) {
      byName.set(norm(e.key), e);
      for (const n of e.names) byName.set(norm(n), e);
    }
    const hq = entities.find((e) => e.key === "") ?? null;
    return table.slice(1).map((r, idx) => {
      const rawKey = iKey >= 0 ? r[iKey] ?? "" : "";
      const rawName = iEntity >= 0 ? r[iEntity] ?? "" : "";
      let entity: BudgetEntity | null = null;
      if (rawKey && byName.has(norm(rawKey))) entity = byName.get(norm(rawKey))!;
      else if (rawName && byName.has(norm(rawName))) entity = byName.get(norm(rawName))!;
      else if (!rawKey && !rawName) entity = hq;
      else if (["grouphq", "hq", "group", "company", "总部", "集团总部"].includes(norm(rawKey || rawName))) entity = hq;
      const year = iYear >= 0 && r[iYear] ? Math.trunc(num(r[iYear])) : defaultYear;
      const revenueBudget = iRev >= 0 ? num(r[iRev]) : NaN;
      let costRate = iCostRate >= 0 && r[iCostRate] ? num(r[iCostRate]) : NaN;
      let expRate = iExpRate >= 0 && r[iExpRate] ? num(r[iExpRate]) : NaN;
      if (Number.isNaN(costRate) && iCost >= 0 && r[iCost]) costRate = (num(r[iCost]) / revenueBudget) * 100;
      if (Number.isNaN(expRate) && iExp >= 0 && r[iExp]) expRate = (num(r[iExp]) / revenueBudget) * 100;
      let error: string | null = null;
      if (!entity) error = t(`找不到主体“${rawKey || rawName}”`, `Entity "${rawKey || rawName}" not found`);
      else if (!Number.isFinite(year) || year < 2000 || year > 2100) error = t("年份无效", "Invalid year");
      else if (!Number.isFinite(revenueBudget) || revenueBudget <= 0) error = t("收入预算必须大于 0", "Revenue budget must be above 0");
      else if (!Number.isFinite(costRate) || costRate < 0 || costRate > 1000) error = t("缺少或无效的成本预算（金额或比率）", "Cost of sales budget (amount or rate) is missing or invalid");
      else if (!Number.isFinite(expRate) || expRate < 0 || expRate > 1000) error = t("缺少或无效的费用预算（金额或比率）", "Operating expense budget (amount or rate) is missing or invalid");
      return { line: idx + 2, entity, year, revenueBudget, costRate: Math.round(costRate * 10) / 10, expRate: Math.round(expRate * 10) / 10, error };
    });
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setMessage("");
    const isExcel = /\.xlsx?$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        let table: string[][];
        if (isExcel) {
          const wb = XLSX.read(reader.result, { type: "array" });
          const raw = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
          table = raw.map((r) => r.map((c) => String(c ?? "").trim())).filter((r) => r.some((c) => c.length > 0));
        } else table = parseCsv(String(reader.result || ""));
        if (table.length < 2) throw new Error("empty");
        setRows(interpret(table));
      } catch {
        setRows(null);
        setMessage(t("文件解析失败，请确认是有效的 CSV 或 Excel 文件，并包含表头与至少一行数据。", "Couldn't read the file — it must be a valid CSV or Excel sheet with a header row and at least one data row."));
      }
    };
    if (isExcel) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
    e.target.value = "";
  }

  const valid = (rows ?? []).filter((r) => !r.error);
  async function confirm() {
    if (valid.length === 0) return;
    setBusy(true);
    const res = await fetch("/api/admin/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "budget",
        fileName,
        rows: valid.map((r) => ({ subsidiaryKey: r.entity!.key, year: String(r.year), revenueBudget: String(r.revenueBudget), costBudgetRate: String(r.costRate), expenseBudgetRate: String(r.expRate) })),
      }),
    });
    setBusy(false);
    if (res.ok) {
      const body = await res.json();
      setMessage(t(`已导入 ${body.successCount} 个主体的预算${body.failedCount ? `，${body.failedCount} 行失败` : ""}。`, `Imported the budget for ${body.successCount} ${body.successCount === 1 ? "entity" : "entities"}${body.failedCount ? `; ${body.failedCount} rows failed` : ""}.`));
      setRows(null);
      router.refresh();
    } else if (res.status === 409) setMessage(t("这份文件的内容已经导入过，无需重复导入。", "This exact file content has already been imported — no need to import it twice."));
    else setMessage(t("导入失败，请检查文件格式。", "Import failed — please check the file."));
  }

  const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—");

  return (
    <div className="rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--surface)" }} data-pdf-hide>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 px-4 py-3 text-left">
        <FileSpreadsheet size={17} style={{ color: "var(--cat-1)" }} />
        <span className="flex-1">
          <span className="block text-[13.5px] font-bold" style={{ color: "var(--ink-900)" }}>
            {t("从 Excel / CSV 导入预算", "Import budget from Excel / CSV")}
          </span>
          <span className="block text-[11.8px]" style={{ color: "var(--ink-400)" }}>
            {hasXeroBudget ? t("每个主体一行；导入的预算会覆盖该主体当年的预算。", "One row per entity; the imported budget replaces that entity's budget for the year.") : t("Xero 没有预算时，可上传每个主体的年度预算；在此之前系统会以去年实际数作为基准。", "When Xero has no budget, upload each entity's annual budget — until then the platform uses last year's actuals as the baseline.")}
          </span>
        </span>
        {open ? <ChevronUp size={16} style={{ color: "var(--ink-400)" }} /> : <ChevronDown size={16} style={{ color: "var(--ink-400)" }} />}
      </button>
      {open && (
        <div className="space-y-3 border-t px-4 py-3.5" style={{ borderColor: "var(--border)" }}>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={downloadTemplate} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-bold" style={{ borderColor: "var(--border-strong)", color: "var(--ink-900)" }}>
              <Download size={14} />
              {t("下载模板（已列出每个主体）", "Download template (every entity listed)")}
            </button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-bold text-white" style={{ background: "var(--cat-1)" }}>
              <Upload size={14} />
              {t("选择 Excel / CSV 文件", "Choose an Excel / CSV file")}
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
            </label>
          </div>
          <div className="text-[11.8px]" style={{ color: "var(--ink-400)" }}>
            {t(
              "列：主体（名称或代码）、年份、收入预算（全年）、营业成本预算、营业费用预算 —— 成本和费用可填金额，也可直接填占收入的百分比（列名 costBudgetRate / expenseBudgetRate）。",
              "Columns: entity (name or key), year, revenue budget (full year), cost of sales budget, operating expense budget — cost and expenses can be amounts, or the percentage of revenue directly (columns costBudgetRate / expenseBudgetRate).",
            )}
          </div>
          {rows && (
            <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
              <table className="w-full min-w-[640px] text-[12.3px]">
                <thead>
                  <tr style={{ color: "var(--ink-400)" }}>
                    <th className="px-3 py-1.5 text-left font-semibold">{t("主体", "Entity")}</th>
                    <th className="px-3 py-1.5 text-right font-semibold">{t("年份", "Year")}</th>
                    <th className="px-3 py-1.5 text-right font-semibold">{t("收入预算", "Revenue budget")}</th>
                    <th className="px-3 py-1.5 text-right font-semibold">{t("成本占收入 %", "Cost % of revenue")}</th>
                    <th className="px-3 py-1.5 text-right font-semibold">{t("费用占收入 %", "Expense % of revenue")}</th>
                    <th className="px-3 py-1.5 text-left font-semibold">{t("状态", "Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.line} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="px-3 py-1.5 font-semibold" style={{ color: "var(--ink-900)" }}>
                        {r.entity?.label ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{Number.isFinite(r.year) ? r.year : "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.revenueBudget)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.costRate)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.expRate)}</td>
                      <td className="px-3 py-1.5 text-[11.8px] font-semibold" style={{ color: r.error ? "var(--status-critical)" : "var(--status-good)" }}>
                        {r.error ? `${t("第 ", "Row ")}${r.line}${t(" 行：", ": ")}${r.error}` : t("可导入", "Ready")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rows && (
            <button
              onClick={confirm}
              disabled={busy || valid.length === 0}
              className="rounded-lg px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
              style={{ background: "var(--cat-1)" }}
            >
              {busy ? "…" : t(`确认导入 ${valid.length} 行`, `Import ${valid.length} ${valid.length === 1 ? "row" : "rows"}`)}
            </button>
          )}
          {message && (
            <div className="text-[12.3px] font-semibold" style={{ color: "var(--ink-600)" }}>
              {message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
