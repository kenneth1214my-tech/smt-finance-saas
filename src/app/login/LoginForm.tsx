"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { AlertTriangle } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import type { Locale, DICTIONARIES } from "@/lib/i18n/dictionaries";

type Dict = (typeof DICTIONARIES)[Locale];

export default function LoginForm({ dict, locale }: { dict: Dict; locale: Locale }) {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

        <form onSubmit={submit} className="space-y-3">
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
          <div className="space-y-1.5">
            <label className="text-xs font-bold" style={{ color: "var(--ink-600)" }}>
              {dict.auth.password}
            </label>
            <input
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
