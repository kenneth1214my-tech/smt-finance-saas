"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Globe } from "lucide-react";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/dictionaries";

export default function LanguageSwitcher({ current, variant = "pill" }: { current: Locale; variant?: "pill" | "bare" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    startTransition(async () => {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      router.refresh();
    });
  }

  const selectEl = (
    <select
      value={current}
      disabled={pending}
      onChange={(e) => onChange(e.target.value)}
      className="bg-transparent text-sm font-semibold outline-none cursor-pointer disabled:opacity-50"
      style={{ color: "var(--ink-900)" }}
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {LOCALE_LABELS[l]}
        </option>
      ))}
    </select>
  );

  if (variant === "bare") return selectEl;

  return (
    <label
      className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-sm"
      style={{ background: "var(--surface)", borderColor: "var(--border-strong)" }}
    >
      <Globe size={13} style={{ color: "var(--ink-400)" }} />
      {selectEl}
    </label>
  );
}
