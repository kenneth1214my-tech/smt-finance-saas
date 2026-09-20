"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Settings as SettingsIcon, LogOut } from "lucide-react";
import type { Locale, DICTIONARIES } from "@/lib/i18n/dictionaries";

type Dict = (typeof DICTIONARIES)[Locale];
type Role = "ADMIN" | "DIRECTOR" | "FINANCE" | "MANAGER" | "VIEWER";

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase();
}

export default function UserMenu({ dict, name, email, role }: { dict: Dict; name: string; email: string; role: Role }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border py-[5px] pl-[5px] pr-3 shadow-sm"
        style={{ background: "var(--surface)", borderColor: "var(--border-strong)" }}
      >
        <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white" style={{ background: "var(--cat-1)" }}>
          {initials(name)}
        </div>
        <div className="text-left">
          <div className="text-[12.5px] font-bold leading-tight" style={{ color: "var(--ink-900)" }}>
            {name}
          </div>
          <div className="text-[10px] font-semibold" style={{ color: "var(--ink-400)" }}>
            {dict.role[role]}
          </div>
        </div>
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[200px] rounded-xl border p-2 shadow-lg" style={{ background: "var(--surface)", borderColor: "var(--border-strong)" }}>
          <div className="px-2.5 py-2 text-xs" style={{ color: "var(--ink-400)" }}>
            {email}
          </div>
          <div className="my-1 h-px" style={{ background: "var(--border)" }} />
          <Link href="/settings" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] font-semibold" style={{ color: "var(--ink-900)" }}>
            <SettingsIcon size={14} style={{ color: "var(--ink-400)" }} />
            {dict.nav.settings}
          </Link>
          <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold" style={{ color: "var(--ink-900)" }}>
            <LogOut size={14} style={{ color: "var(--ink-400)" }} />
            {dict.common.logout}
          </button>
        </div>
      )}
    </div>
  );
}
