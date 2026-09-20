"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, X, Check, Search, Download, Printer, ChevronDown } from "lucide-react";
import { exportToCsv, exportToXlsx, printRows, type ExportColumn } from "@/lib/export";

export type FieldType = "text" | "number" | "select" | "color" | "date" | "textarea" | "preset";

export interface FieldConfig {
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  /** For type "preset": picking one fills several sibling fields at once (e.g. a country
   * dropdown that fills a region's name in every language). The field itself isn't part of
   * the submitted record — mark it `virtual` so buildPayload/startEdit skip it. */
  presets?: { value: string; label: string; fill: Record<string, string> }[];
  virtual?: boolean;
  displayValue?: (row: Record<string, unknown>) => React.ReactNode;
  step?: string;
  required?: boolean;
  /** Forces typed input to upper case as you type (e.g. a free-text bank name entered under
   * "Other", where preset entries already come pre-formatted and shouldn't be touched). */
  uppercase?: boolean;
}

// Defined at module scope (not inside CrudTable) so it keeps a stable component identity across
// re-renders — nesting it inside CrudTable would make React remount the actual <input> DOM node
// on every keystroke (since setForm triggers a re-render, which redefines the function, which
// React then treats as a brand-new component type), resetting focus and cursor position each time.
function FieldInput({
  f,
  value,
  onChange,
  onFillMany,
}: {
  f: FieldConfig;
  value: string;
  onChange: (v: string) => void;
  onFillMany?: (fill: Record<string, string>) => void;
}) {
  if (f.type === "select") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className="crud-input">
        {f.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (f.type === "preset") {
    return (
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          const preset = f.presets?.find((p) => p.value === e.target.value);
          if (preset) onFillMany?.(preset.fill);
        }}
        className="crud-input"
      >
        <option value="">—</option>
        {f.presets?.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
    );
  }
  if (f.type === "textarea") {
    return <textarea value={value} onChange={(e) => onChange(e.target.value)} className="crud-input" rows={2} />;
  }
  return (
    <input
      type={f.type === "number" ? "number" : f.type === "color" ? "color" : f.type === "date" ? "date" : "text"}
      step={f.step}
      value={value}
      onChange={(e) => onChange(f.uppercase ? e.target.value.toUpperCase() : e.target.value)}
      className="crud-input"
    />
  );
}

export default function CrudTable({
  apiBase,
  fields,
  tableKeys,
  initialRows,
  idKey = "id",
  emptyLabel,
  addLabel,
  exportLabel,
}: {
  apiBase: string;
  fields: FieldConfig[];
  /** Optional subset of field keys to show as table columns (edit row still uses all `fields`). */
  tableKeys?: string[];
  initialRows: Record<string, unknown>[];
  idKey?: string;
  emptyLabel: string;
  addLabel: string;
  /** Base filename / print title for exports. Defaults to the last segment of apiBase. */
  exportLabel?: string;
}) {
  const displayFields = tableKeys ? fields.filter((f) => tableKeys.includes(f.key)) : fields;
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [exportOpen, setExportOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setExportOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [exportOpen]);

  // Only select-type columns make sense as a filter dropdown (a fixed set of known values);
  // free-text/number columns are covered by the search box instead.
  const filterableFields = displayFields.filter((f) => f.type === "select" && f.options && f.options.length > 0);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialRows.filter((row) => {
      if (q) {
        const matches = displayFields.some((f) => {
          const displayed = f.displayValue ? f.displayValue(row) : undefined;
          const text = typeof displayed === "string" || typeof displayed === "number" ? String(displayed) : String(row[f.key] ?? "");
          return text.toLowerCase().includes(q);
        });
        if (!matches) return false;
      }
      for (const f of filterableFields) {
        const active = filters[f.key];
        if (active && String(row[f.key] ?? "") !== active) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRows, search, filters]);

  function startCreate() {
    const initial: Record<string, string> = {};
    for (const f of fields) initial[f.key] = f.options?.[0]?.value ?? "";
    setForm(initial);
    setCreating(true);
    setEditingId(null);
    setError("");
  }

  function startEdit(row: Record<string, unknown>) {
    const initial: Record<string, string> = {};
    for (const f of fields) {
      const v = row[f.key];
      initial[f.key] = v === null || v === undefined ? "" : String(v);
    }
    setForm(initial);
    setEditingId(String(row[idKey]));
    setCreating(false);
    setError("");
  }

  function cancel() {
    setCreating(false);
    setEditingId(null);
    setError("");
  }

  function buildPayload() {
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.virtual) continue;
      const raw = form[f.key];
      if (f.type === "number") payload[f.key] = raw === "" ? undefined : Number(raw);
      else payload[f.key] = raw;
    }
    return payload;
  }

  async function submitCreate() {
    setBusy(true);
    setError("");
    const res = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });
    setBusy(false);
    if (res.ok) {
      setCreating(false);
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error === "invalid_input" ? "输入有误，请检查必填字段 / Invalid input" : "提交失败 / Request failed");
    }
  }

  async function submitEdit() {
    if (!editingId) return;
    setBusy(true);
    setError("");
    const res = await fetch(`${apiBase}/${editingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });
    setBusy(false);
    if (res.ok) {
      setEditingId(null);
      router.refresh();
    } else {
      setError("更新失败 / Update failed");
    }
  }

  async function remove(id: string) {
    if (!confirm("确认删除这条记录？此操作无法撤销。\nDelete this record? This cannot be undone.")) return;
    setBusy(true);
    const res = await fetch(`${apiBase}/${id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError("删除失败 / Delete failed");
  }

  function setField(key: string, v: string) {
    setForm((prev) => ({ ...prev, [key]: v }));
  }

  function setMany(fill: Record<string, string>) {
    setForm((prev) => ({ ...prev, ...fill }));
  }

  const exportColumns: ExportColumn[] = displayFields.map((f) => ({
    key: f.key,
    label: f.label,
    value: f.displayValue
      ? (row) => {
          const v = f.displayValue!(row);
          return typeof v === "string" || typeof v === "number" ? v : String(row[f.key] ?? "");
        }
      : undefined,
  }));
  const baseFilename = exportLabel ?? apiBase.split("/").filter(Boolean).pop() ?? "export";

  return (
    <div>
      <style>{`.crud-input{width:100%;border:1px solid var(--border-strong);border-radius:7px;padding:6px 8px;font-size:12.3px;background:var(--surface);color:var(--ink-900);outline:none}`}</style>

      {error && (
        <div className="mb-3 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: "color-mix(in srgb,var(--status-critical) 12%,transparent)", color: "var(--status-critical)" }}>
          {error}
        </div>
      )}

      {initialRows.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-400)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索 / Search"
              className="rounded-lg border py-1.5 pl-7 pr-3 text-[12.3px]"
              style={{ borderColor: "var(--border-strong)", background: "var(--surface)", color: "var(--ink-900)" }}
            />
          </div>
          {filterableFields.map((f) => (
            <select
              key={f.key}
              value={filters[f.key] ?? ""}
              onChange={(e) => setFilters((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className="rounded-lg border py-1.5 px-2.5 text-[12.3px]"
              style={{ borderColor: "var(--border-strong)", background: "var(--surface)", color: "var(--ink-900)" }}
            >
              <option value="">
                {f.label} — 全部 / All
              </option>
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ))}
          {(search || Object.values(filters).some(Boolean)) && (
            <button
              onClick={() => {
                setSearch("");
                setFilters({});
              }}
              className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold"
              style={{ color: "var(--ink-400)" }}
            >
              清除 / Clear
            </button>
          )}

          <div className="relative ml-auto" ref={exportMenuRef}>
            <button
              onClick={() => setExportOpen((v) => !v)}
              disabled={filteredRows.length === 0}
              className="flex items-center gap-1.5 rounded-lg border py-1.5 px-2.5 text-[12.3px] font-semibold disabled:opacity-40"
              style={{ borderColor: "var(--border-strong)", background: "var(--surface)", color: "var(--ink-900)" }}
            >
              <Download size={13} />
              导出 / Export
              <ChevronDown size={12} />
            </button>
            {exportOpen && (
              <div
                className="absolute right-0 z-10 mt-1 min-w-[150px] overflow-hidden rounded-lg border py-1 shadow-lg"
                style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}
              >
                <button
                  onClick={() => {
                    exportToCsv(baseFilename, filteredRows, exportColumns);
                    setExportOpen(false);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-[12.3px] hover:opacity-70"
                  style={{ color: "var(--ink-900)" }}
                >
                  CSV
                </button>
                <button
                  onClick={() => {
                    exportToXlsx(baseFilename, filteredRows, exportColumns);
                    setExportOpen(false);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-[12.3px] hover:opacity-70"
                  style={{ color: "var(--ink-900)" }}
                >
                  Excel (.xlsx)
                </button>
                <button
                  onClick={() => {
                    printRows(baseFilename, filteredRows, exportColumns);
                    setExportOpen(false);
                  }}
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[12.3px] hover:opacity-70"
                  style={{ color: "var(--ink-900)" }}
                >
                  <Printer size={12} />
                  打印 / Print
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[12.6px]">
          <thead>
            <tr className="text-left text-[11px] font-semibold" style={{ color: "var(--ink-400)" }}>
              {displayFields.map((f) => (
                <th key={f.key} className="whitespace-nowrap pb-2 pr-3">
                  {f.label}
                </th>
              ))}
              <th className="pb-2 text-right">操作 / Action</th>
            </tr>
          </thead>
          <tbody>
            {initialRows.length === 0 && !creating && (
              <tr>
                <td colSpan={displayFields.length + 1} className="py-4 text-center text-[12px]" style={{ color: "var(--ink-400)" }}>
                  {emptyLabel}
                </td>
              </tr>
            )}
            {initialRows.length > 0 && filteredRows.length === 0 && !creating && (
              <tr>
                <td colSpan={displayFields.length + 1} className="py-4 text-center text-[12px]" style={{ color: "var(--ink-400)" }}>
                  未找到匹配的记录 / No matching records
                </td>
              </tr>
            )}
            {filteredRows.map((row) => {
              const id = String(row[idKey]);
              const isEditing = editingId === id;
              if (isEditing) {
                return (
                  <tr key={id} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                    <td colSpan={displayFields.length + 1} className="py-3">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {fields.map((f) => (
                          <label key={f.key} className="flex flex-col gap-1">
                            <span className="text-[10.8px] font-semibold" style={{ color: "var(--ink-400)" }}>
                              {f.label}
                            </span>
                            <FieldInput f={f} value={form[f.key] ?? ""} onChange={(v) => setField(f.key, v)} onFillMany={setMany} />
                          </label>
                        ))}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button disabled={busy} onClick={submitEdit} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-bold text-white" style={{ background: "var(--status-good)" }}>
                          <Check size={13} /> 保存 / Save
                        </button>
                        <button disabled={busy} onClick={cancel} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-bold" style={{ background: "var(--surface-2)" }}>
                          <X size={13} /> 取消 / Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={id} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                  {displayFields.map((f) => {
                    const raw = row[f.key];
                    // Decimal-backed fields (revenue, balance, etc.) arrive as strings after the
                    // server->client JSON round-trip (Prisma Decimal.toJSON()), not numbers.
                    const numRaw = typeof raw === "number" ? raw : typeof raw === "string" ? parseFloat(raw) : NaN;
                    const isNegative = f.type === "number" && !Number.isNaN(numRaw) && numRaw < 0;
                    return (
                      <td key={f.key} className="whitespace-nowrap py-2 pr-3">
                        {f.displayValue ? f.displayValue(row) : <span style={{ color: isNegative ? "var(--status-critical)" : "var(--ink-900)" }}>{String(raw ?? "—")}</span>}
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap py-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => startEdit(row)} className="rounded-md p-1.5" style={{ background: "var(--surface-2)" }}>
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => remove(id)} className="rounded-md p-1.5" style={{ background: "color-mix(in srgb,var(--status-critical) 12%,transparent)", color: "var(--status-critical)" }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {creating && (
              <tr className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                <td colSpan={displayFields.length + 1} className="py-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {fields.map((f) => (
                      <label key={f.key} className="flex flex-col gap-1">
                        <span className="text-[10.8px] font-semibold" style={{ color: "var(--ink-400)" }}>
                          {f.label}
                        </span>
                        <FieldInput f={f} value={form[f.key] ?? ""} onChange={(v) => setField(f.key, v)} onFillMany={setMany} />
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button disabled={busy} onClick={submitCreate} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-bold text-white" style={{ background: "var(--status-good)" }}>
                      <Check size={13} /> 保存 / Save
                    </button>
                    <button disabled={busy} onClick={cancel} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-bold" style={{ background: "var(--surface-2)" }}>
                      <X size={13} /> 取消 / Cancel
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!creating && (
        <button
          onClick={startCreate}
          className="mt-3.5 flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-bold text-white"
          style={{ background: "var(--cat-1)" }}
        >
          <Plus size={14} />
          {addLabel}
        </button>
      )}
    </div>
  );
}
