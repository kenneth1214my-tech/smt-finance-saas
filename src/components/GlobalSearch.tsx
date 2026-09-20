"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Building2, FileSpreadsheet, Receipt, ClipboardList, ShieldAlert } from "lucide-react";

interface SearchResult {
  id: string;
  label: string;
  category: "subsidiary" | "ar" | "ap" | "project" | "risk";
  href: string;
}

const CATEGORY_META: Record<SearchResult["category"], { icon: typeof Building2; labelZh: string; labelEn: string }> = {
  subsidiary: { icon: Building2, labelZh: "子公司", labelEn: "Subsidiary" },
  ar: { icon: FileSpreadsheet, labelZh: "应收客户", labelEn: "AR Customer" },
  ap: { icon: Receipt, labelZh: "应付供应商", labelEn: "AP Vendor" },
  project: { icon: ClipboardList, labelZh: "项目", labelEn: "Project" },
  risk: { icon: ShieldAlert, labelZh: "风险预警", labelEn: "Risk Alert" },
};

// A "jump to an entity" search, not a data browser: the app has no per-entity detail pages, so
// a match navigates to that entity's shared category list page (e.g. all AR customers), not a
// deep link to the specific row.
export default function GlobalSearch({ isZh }: { isZh: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const showResults = query.trim().length >= 2;

  useEffect(() => {
    if (!open || !showResults) return;
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/admin/search?q=${encodeURIComponent(query.trim())}`)
        .then((r) => r.json())
        .then((body) => setResults(body.results ?? []))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold"
        style={{ borderColor: "var(--border-strong)", color: "var(--ink-400)" }}
      >
        <Search size={13} />
        {isZh ? "搜索" : "Search"}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[12vh]" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-lg rounded-xl border shadow-lg"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
              <Search size={16} style={{ color: "var(--ink-400)" }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
                placeholder={isZh ? "搜索子公司、客户、供应商、项目、风险预警…" : "Search subsidiaries, customers, vendors, projects, risk alerts…"}
                className="flex-1 bg-transparent text-[14px] outline-none"
                style={{ color: "var(--ink-900)" }}
              />
              <button onClick={() => setOpen(false)}>
                <X size={16} style={{ color: "var(--ink-400)" }} />
              </button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-2">
              {loading && (
                <div className="px-3 py-4 text-center text-[12.5px]" style={{ color: "var(--ink-400)" }}>
                  {isZh ? "搜索中…" : "Searching…"}
                </div>
              )}
              {!loading && showResults && results.length === 0 && (
                <div className="px-3 py-4 text-center text-[12.5px]" style={{ color: "var(--ink-400)" }}>
                  {isZh ? "未找到匹配结果" : "No matches found"}
                </div>
              )}
              {!showResults && (
                <div className="px-3 py-4 text-center text-[12.5px]" style={{ color: "var(--ink-400)" }}>
                  {isZh ? "至少输入 2 个字符" : "Type at least 2 characters"}
                </div>
              )}
              {showResults &&
                results.map((r) => {
                const meta = CATEGORY_META[r.category];
                const Icon = meta.icon;
                return (
                  <button
                    key={`${r.category}-${r.id}`}
                    onClick={() => go(r.href)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left"
                    style={{ background: "transparent" }}
                  >
                    <Icon size={15} style={{ color: "var(--ink-400)" }} />
                    <span className="flex-1 text-[13px] font-semibold" style={{ color: "var(--ink-900)" }}>
                      {r.label}
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--ink-400)" }}>
                      {isZh ? meta.labelZh : meta.labelEn}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
