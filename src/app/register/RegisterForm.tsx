"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { localizedName } from "@/lib/localize";
import type { Locale, DICTIONARIES } from "@/lib/i18n/dictionaries";
import type { Subsidiary } from "@prisma/client";

type Dict = (typeof DICTIONARIES)[Locale];

const ROLE_OPTIONS = ["FINANCE", "MANAGER", "VIEWER"] as const;

export default function RegisterForm({ dict, locale }: { dict: Dict; locale: Locale }) {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const [mode, setMode] = useState<"create" | "join">("create");

  const wrapStyle: React.CSSProperties = {
    background:
      "radial-gradient(900px 500px at 15% -10%, color-mix(in srgb, var(--cat-1) 10%, transparent), transparent), radial-gradient(900px 600px at 100% 110%, color-mix(in srgb, var(--side-accent) 12%, transparent), transparent), var(--bg)",
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={wrapStyle}>
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

        <div className="mb-5 flex rounded-lg border p-1" style={{ borderColor: "var(--border-strong)" }}>
          <button
            onClick={() => setMode("create")}
            className="flex-1 rounded-md py-2 text-[12.5px] font-bold"
            style={{ background: mode === "create" ? "var(--cat-1)" : "transparent", color: mode === "create" ? "#fff" : "var(--ink-600)" }}
          >
            {isZh ? "创建新公司" : "Create a company"}
          </button>
          <button
            onClick={() => setMode("join")}
            className="flex-1 rounded-md py-2 text-[12.5px] font-bold"
            style={{ background: mode === "join" ? "var(--cat-1)" : "transparent", color: mode === "join" ? "#fff" : "var(--ink-600)" }}
          >
            {isZh ? "加入已有公司" : "Join a company"}
          </button>
        </div>

        {mode === "create" ? <CreateOrgForm dict={dict} locale={locale} isZh={isZh} /> : <JoinOrgForm dict={dict} locale={locale} isZh={isZh} />}

        <div className="mt-4 text-center text-xs" style={{ color: "var(--ink-400)" }}>
          {dict.auth.haveAccount}{" "}
          <Link href="/login" className="font-bold" style={{ color: "var(--cat-1)" }}>
            {dict.auth.backToLogin}
          </Link>
        </div>
      </div>

      <style>{`.hr-input{width:100%;border:1px solid var(--border-strong);border-radius:9px;padding:9px 11px;font-size:13px;background:var(--surface);color:var(--ink-900);outline:none}`}</style>
    </div>
  );
}

function CreateOrgForm({ isZh }: { dict: Dict; locale: Locale; isZh: boolean }) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ companyName: "", name: "", email: "", password: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/register-organization", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setLoading(false);
    if (res.ok) {
      setDone(true);
      router.push("/overview");
      router.refresh();
      return;
    }
    const body = await res.json().catch(() => ({}));
    if (body.error === "email_taken") setError(isZh ? "该邮箱已注册。" : "This email is already registered.");
    else setError(isZh ? "提交失败，请检查填写内容。" : "Something went wrong. Please check your input.");
  }

  return (
    <>
      <h1 className="text-lg font-extrabold" style={{ color: "var(--ink-900)" }}>
        {isZh ? "创建新公司" : "Create a new company"}
      </h1>
      <p className="mb-5 mt-1 text-[12.5px]" style={{ color: "var(--ink-400)" }}>
        {isZh ? "你将成为该公司的系统管理员，可立即登录使用。" : "You'll become that company's system admin and can sign in right away."}
      </p>
      {error && <ErrorBanner text={error} />}
      <form onSubmit={submit} className="space-y-3">
        <Field label={isZh ? "公司/集团名称" : "Company / group name"}>
          <input required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="hr-input" />
        </Field>
        <Field label={isZh ? "你的姓名" : "Your name"}>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="hr-input" />
        </Field>
        <Field label={isZh ? "邮箱" : "Email"}>
          <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="hr-input" />
        </Field>
        <Field label={isZh ? "密码（至少8位）" : "Password (min 8 characters)"}>
          <input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="hr-input" />
        </Field>
        <button type="submit" disabled={loading || done} className="mt-2 w-full rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: "var(--cat-1)" }}>
          {loading || done ? "…" : isZh ? "创建并登录" : "Create and sign in"}
        </button>
      </form>
    </>
  );
}

function JoinOrgForm({ dict, locale, isZh }: { dict: Dict; locale: Locale; isZh: boolean }) {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [codeStatus, setCodeStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [orgName, setOrgName] = useState("");
  const [subsidiaries, setSubsidiaries] = useState<Subsidiary[]>([]);
  const [form, setForm] = useState({
    inviteCode: "",
    name: "",
    email: "",
    phone: "",
    subsidiaryId: "",
    requestedRole: "FINANCE" as (typeof ROLE_OPTIONS)[number],
    reason: "",
  });

  useEffect(() => {
    const code = form.inviteCode.trim();
    const t = setTimeout(async () => {
      if (!code) {
        setCodeStatus("idle");
        setOrgName("");
        setSubsidiaries([]);
        return;
      }
      setCodeStatus("checking");
      const res = await fetch(`/api/auth/org-lookup?code=${encodeURIComponent(code)}`);
      if (res.ok) {
        const body = await res.json();
        setOrgName(body.name);
        setSubsidiaries(body.subsidiaries);
        setCodeStatus("valid");
      } else {
        setOrgName("");
        setSubsidiaries([]);
        setCodeStatus("invalid");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [form.inviteCode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, subsidiaryId: form.subsidiaryId || null }),
    });
    setLoading(false);
    if (res.ok) {
      setSubmitted(true);
      return;
    }
    const body = await res.json().catch(() => ({}));
    if (body.error === "email_taken" || body.error === "already_pending") {
      setError(isZh ? "该邮箱已注册或申请正在审批中。" : "This email is already registered or pending review.");
    } else if (body.error === "invalid_invite_code") {
      setError(isZh ? "邀请码无效。" : "Invalid invite code.");
    } else {
      setError(isZh ? "提交失败，请检查填写内容。" : "Something went wrong. Please check your input.");
    }
  }

  if (submitted) {
    return (
      <div className="text-center">
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--status-good) 14%, transparent)", color: "var(--status-good)" }}
        >
          <CheckCircle2 size={28} />
        </div>
        <h1 className="text-lg font-extrabold" style={{ color: "var(--ink-900)" }}>
          {dict.auth.pendingTitle}
        </h1>
        <p className="mt-2 text-[12.5px]" style={{ color: "var(--ink-400)" }}>
          {dict.auth.pendingDesc}
        </p>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-lg font-extrabold" style={{ color: "var(--ink-900)" }}>
        {dict.auth.regTitle}
      </h1>
      <p className="mb-5 mt-1 text-[12.5px]" style={{ color: "var(--ink-400)" }}>
        {isZh ? "向你所在公司的管理员索取邀请码，填写以下信息，提交后由该公司管理员审核。" : "Ask your company's admin for an invite code, fill in the details, then wait for their approval."}
      </p>
      {error && <ErrorBanner text={error} />}
      <form onSubmit={submit} className="space-y-3">
        <Field label={isZh ? "邀请码" : "Invite code"}>
          <input required value={form.inviteCode} onChange={(e) => setForm({ ...form, inviteCode: e.target.value })} className="hr-input" />
          {codeStatus === "valid" && (
            <p className="mt-1 text-[11px] font-semibold" style={{ color: "var(--status-good)" }}>
              {isZh ? `将加入：${orgName}` : `Will join: ${orgName}`}
            </p>
          )}
          {codeStatus === "invalid" && (
            <p className="mt-1 text-[11px] font-semibold" style={{ color: "var(--status-critical)" }}>
              {isZh ? "邀请码无效" : "Invalid invite code"}
            </p>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={dict.auth.fullName}>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="hr-input" />
          </Field>
          <Field label={dict.auth.phone}>
            <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="hr-input" />
          </Field>
        </div>
        <Field label={dict.auth.email}>
          <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="hr-input" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={dict.auth.dept}>
            <select value={form.subsidiaryId} onChange={(e) => setForm({ ...form, subsidiaryId: e.target.value })} className="hr-input" disabled={codeStatus !== "valid"}>
              <option value="">{dict.auth.headOffice}</option>
              {subsidiaries.map((s) => (
                <option key={s.id} value={s.id}>
                  {localizedName(s, locale)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={dict.auth.reqRole}>
            <select
              value={form.requestedRole}
              onChange={(e) => setForm({ ...form, requestedRole: e.target.value as typeof form.requestedRole })}
              className="hr-input"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {dict.role[r]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={dict.auth.reason}>
          <textarea
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder={dict.auth.reasonPh}
            rows={3}
            className="hr-input resize-none"
          />
        </Field>
        <button
          type="submit"
          disabled={loading || codeStatus !== "valid"}
          className="mt-2 w-full rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60"
          style={{ background: "var(--cat-1)" }}
        >
          {loading ? "…" : dict.common.submit}
        </button>
      </form>
    </>
  );
}

function ErrorBanner({ text }: { text: string }) {
  return (
    <div
      className="mb-3.5 flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold"
      style={{ background: "color-mix(in srgb, var(--status-critical) 12%, transparent)", color: "var(--status-critical)" }}
    >
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold" style={{ color: "var(--ink-600)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
