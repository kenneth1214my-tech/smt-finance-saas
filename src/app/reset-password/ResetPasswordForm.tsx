"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import type { Locale, DICTIONARIES } from "@/lib/i18n/dictionaries";

type Dict = (typeof DICTIONARIES)[Locale];

export default function ResetPasswordForm({ dict, locale, token }: { dict: Dict; locale: Locale; token: string }) {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError(isZh ? "两次输入的密码不一致" : "Passwords don't match");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword: password }),
    });
    setLoading(false);
    if (res.ok) {
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
      return;
    }
    setError(isZh ? "链接已失效或过期，请重新申请。" : "This link is invalid or expired — please request a new one.");
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{
        background:
          "radial-gradient(900px 500px at 15% -10%, color-mix(in srgb, var(--cat-1) 10%, transparent), transparent), radial-gradient(900px 600px at 100% 110%, color-mix(in srgb, var(--side-accent) 12%, transparent), transparent), var(--bg)",
      }}
    >
      <div className="w-full max-w-md rounded-2xl border p-8 shadow-xl" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="mb-4 flex justify-start">
          <LanguageSwitcher current={locale} />
        </div>
        <div className="mb-6 flex items-center gap-2.5">
          <Image src="/logo.png" alt="SMT" width={36} height={36} className="h-9 w-9 rounded-lg object-cover" />
          <div className="text-[15px] font-bold" style={{ color: "var(--ink-900)" }}>
            {dict.appName}
          </div>
        </div>

        {!token ? (
          <div className="text-center">
            <p className="text-[12.5px]" style={{ color: "var(--status-critical)" }}>
              {isZh ? "链接无效。" : "Invalid link."}
            </p>
            <Link href="/forgot-password" className="mt-5 inline-block w-full rounded-lg py-2.5 text-sm font-bold text-white" style={{ background: "var(--cat-1)" }}>
              {isZh ? "重新申请" : "Request a new link"}
            </Link>
          </div>
        ) : done ? (
          <div className="text-center">
            <div
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: "color-mix(in srgb, var(--status-good) 14%, transparent)", color: "var(--status-good)" }}
            >
              <CheckCircle2 size={28} />
            </div>
            <h1 className="text-lg font-extrabold" style={{ color: "var(--ink-900)" }}>
              {isZh ? "密码已重置" : "Password reset"}
            </h1>
            <p className="mt-2 text-[12.5px]" style={{ color: "var(--ink-400)" }}>
              {isZh ? "正在跳转到登录页…" : "Redirecting to sign in…"}
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-extrabold" style={{ color: "var(--ink-900)" }}>
              {isZh ? "设置新密码" : "Set a new password"}
            </h1>
            {error && (
              <div
                className="mb-3.5 mt-3 flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold"
                style={{ background: "color-mix(in srgb, var(--status-critical) 12%, transparent)", color: "var(--status-critical)" }}
              >
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <form onSubmit={submit} className="mt-5 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold" style={{ color: "var(--ink-600)" }}>
                  {isZh ? "新密码（至少8位）" : "New password (min 8 characters)"}
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: "var(--border-strong)", background: "var(--surface)", color: "var(--ink-900)" }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold" style={{ color: "var(--ink-600)" }}>
                  {isZh ? "确认新密码" : "Confirm new password"}
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: "var(--border-strong)", background: "var(--surface)", color: "var(--ink-900)" }}
                />
              </div>
              <button type="submit" disabled={loading} className="mt-2 w-full rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: "var(--cat-1)" }}>
                {loading ? "…" : isZh ? "重置密码" : "Reset password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
