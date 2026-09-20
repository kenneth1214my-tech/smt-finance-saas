"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import type { Locale, DICTIONARIES } from "@/lib/i18n/dictionaries";

type Dict = (typeof DICTIONARIES)[Locale];

export default function ForgotPasswordForm({ dict, locale }: { dict: Dict; locale: Locale }) {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    setSent(true);
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

        {sent ? (
          <div className="text-center">
            <div
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: "color-mix(in srgb, var(--status-good) 14%, transparent)", color: "var(--status-good)" }}
            >
              <CheckCircle2 size={28} />
            </div>
            <h1 className="text-lg font-extrabold" style={{ color: "var(--ink-900)" }}>
              {isZh ? "邮件已发送" : "Email sent"}
            </h1>
            <p className="mt-2 text-[12.5px]" style={{ color: "var(--ink-400)" }}>
              {isZh
                ? "如果该邮箱已注册，重置密码的链接已发送过去，请查收（含垃圾邮件箱），链接 1 小时内有效。"
                : "If that email is registered, a reset link has been sent — check your inbox (and spam folder). The link expires in 1 hour."}
            </p>
            <Link href="/login" className="mt-5 inline-block w-full rounded-lg py-2.5 text-sm font-bold" style={{ background: "var(--surface-2)", color: "var(--ink-900)" }}>
              {dict.auth.backToLogin}
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-extrabold" style={{ color: "var(--ink-900)" }}>
              {isZh ? "找回密码" : "Reset your password"}
            </h1>
            <p className="mb-5 mt-1 text-[12.5px]" style={{ color: "var(--ink-400)" }}>
              {isZh ? "输入你的账号邮箱，我们会发一个重置密码的链接给你。" : "Enter your account email and we'll send you a link to reset your password."}
            </p>
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
              <button type="submit" disabled={loading} className="mt-2 w-full rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: "var(--cat-1)" }}>
                {loading ? "…" : isZh ? "发送重置链接" : "Send reset link"}
              </button>
            </form>
            <div className="mt-4 text-center text-xs" style={{ color: "var(--ink-400)" }}>
              <Link href="/login" className="font-bold" style={{ color: "var(--cat-1)" }}>
                {dict.auth.backToLogin}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
