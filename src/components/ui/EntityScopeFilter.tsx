"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { Locale } from "@/lib/i18n/dictionaries";

export type EntityScope = "all" | "hq" | "subsidiary";

const TABS: { value: EntityScope; zh: string; en: string }[] = [
  { value: "all", zh: "全部", en: "All" },
  { value: "hq", zh: "集团总部", en: "Group HQ" },
  { value: "subsidiary", zh: "子公司", en: "Subsidiaries" },
];

export default function EntityScopeFilter({ scope, locale }: { scope: EntityScope; locale: Locale }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isZh = locale === "zh" || locale === "zh-Hant";

  function onSelect(next: EntityScope) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("scope");
    else params.set("scope", next);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: "var(--border)" }}>
      {TABS.map((t) => (
        <button
          key={t.value}
          onClick={() => onSelect(t.value)}
          className="rounded-md px-3 py-1.5 text-[12.5px] font-semibold"
          style={{
            background: scope === t.value ? "var(--cat-1)" : "transparent",
            color: scope === t.value ? "#fff" : "var(--ink-600)",
          }}
        >
          {isZh ? t.zh : t.en}
        </button>
      ))}
    </div>
  );
}
