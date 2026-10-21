"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Settings as SettingsIcon, LogOut, Building2, Check, Plus } from "lucide-react";
import type { Locale, DICTIONARIES } from "@/lib/i18n/dictionaries";

type Dict = (typeof DICTIONARIES)[Locale];
type Role = "ADMIN" | "DIRECTOR" | "FINANCE" | "MANAGER" | "VIEWER";

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase();
}

type Company = { userId: string; company: string; jurisdiction: string; role: Role; current: boolean };

export default function UserMenu({ dict, name, email, role, isZh = false, companies = [] }: { dict: Dict; name: string; email: string; role: Role; isZh?: boolean; companies?: Company[] }) {
  const [open, setOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkPassword, setLinkPassword] = useState("");
  const [linkError, setLinkError] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  async function switchTo(userId: string) {
    setBusy(true);
    const res = await fetch("/api/auth/switch-company", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
    setBusy(false);
    if (res.ok) {
      window.location.href = "/overview"; // full reload: every cached server render belongs to the previous company
    }
  }

  async function linkCompany(e: React.FormEvent) {
    e.preventDefault();
    setLinkError("");
    setBusy(true);
    const res = await fetch("/api/auth/link-company", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: linkEmail, password: linkPassword }) });
    setBusy(false);
    if (res.ok) {
      window.location.reload();
      return;
    }
    setLinkError(res.status === 429 ? (isZh ? "尝试次数过多，请稍后再试。" : "Too many attempts. Try again later.") : isZh ? "邮箱或密码不正确。" : "Incorrect email or password.");
  }

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
        <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[250px] rounded-xl border p-2 shadow-lg" style={{ background: "var(--surface)", borderColor: "var(--border-strong)" }}>
          <div className="px-2.5 py-2 text-xs" style={{ color: "var(--ink-400)" }}>
            {email}
          </div>
          <div className="my-1 h-px" style={{ background: "var(--border)" }} />
          {companies.length > 1 && (
            <>
              <div className="px-2.5 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "var(--ink-400)" }}>
                {isZh ? "切换公司" : "Switch company"}
              </div>
              {companies.map((c) => (
                <button
                  key={c.userId}
                  disabled={busy || c.current}
                  onClick={() => switchTo(c.userId)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold disabled:cursor-default"
                  style={{ color: "var(--ink-900)", background: c.current ? "color-mix(in srgb, var(--cat-1) 8%, transparent)" : "transparent" }}
                >
                  <Building2 size={14} style={{ color: "var(--ink-400)" }} />
                  <span className="min-w-0 flex-1 truncate">{c.company}</span>
                  <span className="shrink-0 text-[10px]" style={{ color: "var(--ink-400)" }}>
                    {c.jurisdiction}
                  </span>
                  {c.current && <Check size={14} style={{ color: "var(--cat-1)" }} />}
                </button>
              ))}
              <div className="my-1 h-px" style={{ background: "var(--border)" }} />
            </>
          )}
          {linking ? (
            <form onSubmit={linkCompany} className="space-y-1.5 px-1.5 py-1.5">
              <div className="text-[11px]" style={{ color: "var(--ink-400)" }}>
                {isZh ? "输入另一个公司账号的邮箱和密码，即可在此登录中一键切换。" : "Enter the other company account's e-mail and password to switch between them from this login."}
              </div>
              <input type="email" required value={linkEmail} onChange={(e) => setLinkEmail(e.target.value)} placeholder={isZh ? "邮箱" : "E-mail"} className="w-full rounded-md border px-2 py-1.5 text-[12px] outline-none" style={{ borderColor: "var(--border-strong)", background: "var(--surface)", color: "var(--ink-900)" }} />
              <input type="password" required value={linkPassword} onChange={(e) => setLinkPassword(e.target.value)} placeholder={isZh ? "密码" : "Password"} className="w-full rounded-md border px-2 py-1.5 text-[12px] outline-none" style={{ borderColor: "var(--border-strong)", background: "var(--surface)", color: "var(--ink-900)" }} />
              {linkError && (
                <div className="text-[11px] font-semibold" style={{ color: "var(--status-critical)" }}>
                  {linkError}
                </div>
              )}
              <div className="flex gap-1.5">
                <button type="submit" disabled={busy} className="flex-1 rounded-md py-1.5 text-[12px] font-bold text-white disabled:opacity-60" style={{ background: "var(--cat-1)" }}>
                  {isZh ? "添加" : "Add"}
                </button>
                <button type="button" onClick={() => setLinking(false)} className="rounded-md border px-2.5 py-1.5 text-[12px] font-semibold" style={{ borderColor: "var(--border-strong)", color: "var(--ink-600)" }}>
                  {isZh ? "取消" : "Cancel"}
                </button>
              </div>
            </form>
          ) : (
            <button onClick={() => setLinking(true)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold" style={{ color: "var(--ink-900)" }}>
              <Plus size={14} style={{ color: "var(--ink-400)" }} />
              {isZh ? "添加已有公司账号" : "Add existing company account"}
            </button>
          )}
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
