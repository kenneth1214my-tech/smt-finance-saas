"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { AlertTriangle, Building2, ChevronRight, X } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import type { Locale, DICTIONARIES } from "@/lib/i18n/dictionaries";

type Dict = (typeof DICTIONARIES)[Locale];

// Company accounts used on this device, so the next sign-in is "tap your company, type the password". Only the e-mail,
// company name and role are remembered — never a password.
type Recent = { email: string; company: string; role: string };
const RECENT_KEY = "smt_recent_accounts";
const RECENT_MAX = 6;

function loadRecent(): Recent[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((r) => r && typeof r.email === "string" && typeof r.company === "string") : [];
  } catch {
    return [];
  }
}
function saveRecent(entries: Recent[]) {
  try {
    const merged = [...entries, ...loadRecent()];
    const seen = new Set<string>();
    const out = merged.filter((r) => {
      const k = r.email.toLowerCase() + "|" + r.company;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    localStorage.setItem(RECENT_KEY, JSON.stringify(out.slice(0, RECENT_MAX)));
  } catch {
    /* private mode / blocked storage: the shortcut just won't be remembered */
  }
}
function forgetRecent(r: Recent) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(loadRecent().filter((x) => !(x.email === r.email && x.company === r.company))));
  } catch {
    /* ignore */
  }
}

export default function LoginForm({ dict, locale }: { dict: Dict; locale: Locale }) {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Set when this e-mail + password belongs to several companies: the user picks which one to open.
  const [choices, setChoices] = useState<{ userId: string; company: string; role: string; current: boolean }[] | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [selected, setSelected] = useState<Recent | null>(null); // company account picked from the shortcut list
  const [useOther, setUseOther] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  function choose(r: Recent) {
    setSelected(r);
    setEmail(r.email);
    setError("");
    setTimeout(() => passwordRef.current?.focus(), 0);
  }

  async function pick(userId: string) {
    setLoading(true);
    const res = await fetch("/api/auth/switch-company", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
    if (res.ok) {
      window.location.href = "/overview";
      return;
    }
    setLoading(false);
    setError(dict.auth.errInvalid);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (res.ok) {
      const ok = await res.json().catch(() => ({}));
      const mail = email.trim().toLowerCase();
      if (Array.isArray(ok.choices) && ok.choices.length > 1) {
        const list = ok.choices as { userId: string; company: string; role: string; current: boolean }[];
        saveRecent(list.map((c) => ({ email: mail, company: c.company, role: c.role })));
        // The company tapped in the shortcut list opens straight away; otherwise ask which one.
        const wanted = selected && list.find((c) => c.company === selected.company);
        if (wanted) {
          if (wanted.current) {
            router.push("/overview");
            router.refresh();
          } else {
            await pick(wanted.userId);
          }
          return;
        }
        setChoices(list);
        return;
      }
      if (typeof ok.company === "string") saveRecent([{ email: mail, company: ok.company, role: String(ok.role ?? "") }]);
      router.push("/overview");
      router.refresh();
      return;
    }
    const body = await res.json().catch(() => ({}));
    if (body.error === "account_disabled") setError(dict.auth.errDisabled);
    else if (res.status === 429) setError(dict.auth.errPending);
    else setError(dict.auth.errInvalid);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{
        background:
          "radial-gradient(900px 500px at 15% -10%, color-mix(in srgb, var(--cat-1) 10%, transparent), transparent), radial-gradient(900px 600px at 100% 110%, color-mix(in srgb, var(--side-accent) 12%, transparent), transparent), var(--bg)",
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-8 shadow-xl"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="mb-4 flex justify-start">
          <LanguageSwitcher current={locale} />
        </div>

        <div className="mb-6 flex items-center gap-2.5">
          <Image src="/logo.png" alt="SMT" width={36} height={36} className="h-9 w-9 rounded-lg object-cover" />
          <div>
            <div className="text-[15px] font-bold" style={{ color: "var(--ink-900)" }}>
              {dict.appName}
            </div>
            <div className="text-[10.5px] font-medium tracking-wide" style={{ color: "var(--ink-400)" }}>
              {dict.tagline}
            </div>
          </div>
        </div>

        <h1 className="text-lg font-extrabold" style={{ color: "var(--ink-900)" }}>
          {dict.auth.loginTitle}
        </h1>
        <p className="mb-5 mt-1 text-[12.5px]" style={{ color: "var(--ink-400)" }}>
          {dict.auth.loginDesc}
        </p>

        {error && (
          <div
            className="mb-3.5 flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold"
            style={{ background: "color-mix(in srgb, var(--status-critical) 12%, transparent)", color: "var(--status-critical)" }}
          >
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {choices && (
          <div className="space-y-2">
            <div className="text-[13px] font-bold" style={{ color: "var(--ink-900)" }}>
              {isZh ? "选择要进入的公司" : "Choose a company"}
            </div>
            {choices.map((c) => (
              <button
                key={c.userId}
                disabled={loading}
                onClick={() => pick(c.userId)}
                className="flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm font-semibold disabled:opacity-60"
                style={{ borderColor: c.current ? "var(--cat-1)" : "var(--border-strong)", color: "var(--ink-900)" }}
              >
                <span>{c.company}</span>
                <span className="text-[11px]" style={{ color: "var(--ink-400)" }}>
                  {dict.role[c.role as keyof typeof dict.role]}
                </span>
              </button>
            ))}
          </div>
        )}

        {!choices && !selected && !useOther && recent.length > 0 && (
          <div className="mb-4 space-y-2">
            <div className="text-[13px] font-bold" style={{ color: "var(--ink-900)" }}>
              {isZh ? "选择公司账号" : "Choose your company account"}
            </div>
            {recent.map((r) => (
              <div key={r.email + r.company} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => choose(r)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left"
                  style={{ borderColor: "var(--border-strong)", color: "var(--ink-900)" }}
                >
                  <Building2 size={16} style={{ color: "var(--cat-1)" }} className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{r.company}</span>
                    <span className="block truncate text-[11px]" style={{ color: "var(--ink-400)" }}>
                      {r.email}
                      {r.role && dict.role[r.role as keyof typeof dict.role] ? ` · ${dict.role[r.role as keyof typeof dict.role]}` : ""}
                    </span>
                  </span>
                  <ChevronRight size={16} style={{ color: "var(--ink-400)" }} className="shrink-0" />
                </button>
                <button
                  type="button"
                  aria-label={isZh ? "从列表移除" : "Remove from list"}
                  title={isZh ? "从列表移除" : "Remove from list"}
                  onClick={() => {
                    forgetRecent(r);
                    setRecent(loadRecent());
                  }}
                  className="rounded-md p-1.5 opacity-60 hover:opacity-100"
                  style={{ color: "var(--ink-400)" }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setUseOther(true)} className="text-xs font-bold" style={{ color: "var(--cat-1)" }}>
              {isZh ? "使用其他账号登录" : "Use a different account"}
            </button>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3" hidden={!!choices || (!selected && !useOther && recent.length > 0)}>
          {selected ? (
            <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--cat-1)" }}>
              <Building2 size={16} style={{ color: "var(--cat-1)" }} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold" style={{ color: "var(--ink-900)" }}>
                  {selected.company}
                </div>
                <div className="truncate text-[11px]" style={{ color: "var(--ink-400)" }}>
                  {selected.email}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setPassword("");
                  setError("");
                }}
                className="text-xs font-bold"
                style={{ color: "var(--cat-1)" }}
              >
                {isZh ? "更换" : "Change"}
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-bold" style={{ color: "var(--ink-600)" }}>
                {dict.auth.email}
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: "var(--border-strong)", background: "var(--surface)", color: "var(--ink-900)" }}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-bold" style={{ color: "var(--ink-600)" }}>
              {dict.auth.password}
            </label>
            <input
              ref={passwordRef}
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: "var(--border-strong)", background: "var(--surface)", color: "var(--ink-900)" }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: "var(--cat-1)" }}
          >
            {loading ? "…" : dict.auth.loginBtn}
          </button>
        </form>

        <div className="mt-4 text-center text-xs" style={{ color: "var(--ink-400)" }}>
          {dict.auth.noAccount}{" "}
          <Link href="/register" className="font-bold" style={{ color: "var(--cat-1)" }}>
            {dict.auth.applyNow}
          </Link>
        </div>
        <div className="mt-1.5 text-center text-xs" style={{ color: "var(--ink-400)" }}>
          <Link href="/forgot-password" className="font-bold" style={{ color: "var(--cat-1)" }}>
            {isZh ? "忘记密码？" : "Forgot your password?"}
          </Link>
        </div>

      </div>
    </div>
  );
}
