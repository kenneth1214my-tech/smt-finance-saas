"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import { Check, X, Users, Globe, Database, Building2, ShieldAlert, Landmark, Briefcase, Coins, UserCircle, Plus, Pencil } from "lucide-react";
import type { AccessRequest, User, Subsidiary, Region, MonthlyFinancial, RegionMonthlyFinancial, Budget, BankAccount, CashFlowMonthly, ARCustomer, Payable, Project, RiskAlert, ReportDoc, ExchangeRate, ImportBatch, XeroConnection, ExpenseCategoryMapping } from "@prisma/client";
import { applyCategoryMapping, suggestCategory, type ExpenseCategory } from "@/lib/expense-categories";
import { localizedName } from "@/lib/localize";
import { formatMsg } from "@/lib/formatMsg";
import { CURRENCY_OPTIONS } from "@/lib/currency-options";
import { MONTH_OPTIONS_ZH, MONTH_OPTIONS_EN } from "@/lib/month-options";
import { BANK_PRESETS } from "@/lib/bank-presets";
import { REGION_COUNTRY_PRESETS } from "@/lib/region-presets";
import { IMPORT_VARIANTS, findImportVariant } from "@/lib/import-types";
import { parsePnlReport } from "@/lib/pnl-parser";
import { parseBalanceSheetReport } from "@/lib/balance-sheet-parser";
import { parseAgingSummary } from "@/lib/aging-summary-parser";
import type { Locale, DICTIONARIES } from "@/lib/i18n/dictionaries";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/dictionaries";
import KpiTile from "@/components/ui/KpiTile";
import Card from "@/components/ui/Card";
import StatusPill from "@/components/ui/StatusPill";
import CrudTable, { type FieldConfig } from "@/components/admin/CrudTable";

type Dict = (typeof DICTIONARIES)[Locale];
type PendingRequest = AccessRequest & { subsidiary: Subsidiary | null };
type UserWithSub = User & { subsidiary: Subsidiary | null };
type ImportBatchWithUser = ImportBatch & { importedBy: User };
type Row = Record<string, unknown>;

type Tab = "profile" | "users" | "org" | "financials" | "business" | "currency" | "data" | "lang";

export default function SettingsClient({
  dict,
  locale,
  isAdmin,
  currentUserId,
  currentUserName,
  currentUserEmail,
  pendingRequests,
  users,
  subsidiaries,
  regions,
  monthlyFinancials,
  regionFinancials,
  budgets,
  banks,
  cashflow,
  arCustomers,
  payables,
  projects,
  risks,
  reports,
  baseCurrency,
  fyeMonth,
  exchangeRates,
  importBatches,
  companyName,
  inviteCode,
  hqEquity,
  hqDebtRatio,
  hqHeadcount,
  xeroConnections,
  xeroGroupConnected,
  xeroGroupTenantName,
  xeroConfigured,
  expenseCategoryMappings,
}: {
  dict: Dict;
  locale: Locale;
  isAdmin: boolean;
  currentUserId: string;
  currentUserName: string;
  currentUserEmail: string;
  pendingRequests: PendingRequest[];
  users: UserWithSub[];
  subsidiaries: Subsidiary[];
  regions: Region[];
  monthlyFinancials: (MonthlyFinancial & { subsidiary: Subsidiary | null })[];
  regionFinancials: (RegionMonthlyFinancial & { region: Region })[];
  budgets: (Budget & { subsidiary: Subsidiary | null })[];
  banks: BankAccount[];
  cashflow: CashFlowMonthly[];
  arCustomers: (ARCustomer & { subsidiary: Subsidiary | null })[];
  payables: (Payable & { subsidiary: Subsidiary | null })[];
  projects: (Project & { subsidiary: Subsidiary })[];
  risks: (RiskAlert & { subsidiary: Subsidiary | null })[];
  reports: ReportDoc[];
  baseCurrency: string;
  fyeMonth: number;
  exchangeRates: ExchangeRate[];
  importBatches: ImportBatchWithUser[];
  companyName: string;
  inviteCode: string;
  hqEquity: number;
  hqDebtRatio: number;
  hqHeadcount: number;
  xeroConnections: XeroConnection[];
  xeroGroupConnected: boolean;
  xeroGroupTenantName: string | null;
  xeroConfigured: boolean;
  expenseCategoryMappings: ExpenseCategoryMapping[];
}) {
  // Some actions (e.g. the Xero OAuth callback) redirect back here with ?tab=... so the user
  // lands back on the tab they started from instead of always resetting to My Profile.
  const initialTabParam = useSearchParams().get("tab");
  const ADMIN_TABS: Tab[] = ["users", "org", "financials", "business", "currency", "data", "lang"];
  const [tab, setTab] = useState<Tab>(() => {
    if (initialTabParam === "profile") return "profile";
    if (isAdmin && ADMIN_TABS.includes(initialTabParam as Tab)) return initialTabParam as Tab;
    return "profile";
  });
  const [toast, setToast] = useState("");
  const isZh = locale === "zh" || locale === "zh-Hant";

  const profileTabEntry = { id: "profile" as const, label: isZh ? "个人资料" : "My Profile", icon: UserCircle };
  const tabs: { id: Tab; label: string; icon: typeof Users }[] = isAdmin
    ? [
        profileTabEntry,
        { id: "users", label: dict.settings.tabUsers, icon: Users },
        { id: "org", label: dict.settings.tabOrg, icon: Building2 },
        { id: "financials", label: isZh ? "财务数据" : "Financial Data", icon: Landmark },
        { id: "business", label: isZh ? "经营数据" : "Business Data", icon: Briefcase },
        { id: "currency", label: isZh ? "集团设置" : "Group Settings", icon: Coins },
        { id: "data", label: dict.settings.tabData, icon: Database },
        { id: "lang", label: dict.settings.tabLang, icon: Globe },
      ]
    : [profileTabEntry, { id: "lang", label: dict.settings.tabLang, icon: Globe }];

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 border-b" style={{ borderColor: "var(--border)" }}>
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 border-b-2 px-1 pb-2.5 text-sm font-bold"
              style={{ borderColor: active ? "var(--cat-1)" : "transparent", color: active ? "var(--ink-900)" : "var(--ink-400)" }}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "profile" && (
        <ProfileTab locale={locale} name={currentUserName} email={currentUserEmail} onToast={showToast} />
      )}
      {tab === "users" && isAdmin && (
        <UsersTab dict={dict} locale={locale} currentUserId={currentUserId} pendingRequests={pendingRequests} users={users} subsidiaries={subsidiaries} onToast={showToast} />
      )}
      {tab === "org" && isAdmin && <OrgTab locale={locale} subsidiaries={subsidiaries} regions={regions} />}
      {tab === "financials" && isAdmin && (
        <FinancialsTab locale={locale} subsidiaries={subsidiaries} regions={regions} monthlyFinancials={monthlyFinancials} regionFinancials={regionFinancials} budgets={budgets} banks={banks} cashflow={cashflow} />
      )}
      {tab === "business" && isAdmin && <BusinessTab locale={locale} subsidiaries={subsidiaries} arCustomers={arCustomers} payables={payables} projects={projects} risks={risks} reports={reports} />}
      {tab === "currency" && isAdmin && (
        <CurrencyTab
          locale={locale}
          companyName={companyName}
          inviteCode={inviteCode}
          baseCurrency={baseCurrency}
          fyeMonth={fyeMonth}
          hqEquity={hqEquity}
          hqDebtRatio={hqDebtRatio}
          hqHeadcount={hqHeadcount}
          exchangeRates={exchangeRates as unknown as Row[]}
          onToast={showToast}
        />
      )}
      {tab === "data" && isAdmin && (
        <DataTab
          locale={locale}
          onToast={showToast}
          importBatches={importBatches}
          subsidiaries={subsidiaries}
          xeroConnections={xeroConnections}
          xeroGroupConnected={xeroGroupConnected}
          xeroGroupTenantName={xeroGroupTenantName}
          xeroConfigured={xeroConfigured}
          expenseCategoryMappings={expenseCategoryMappings}
        />
      )}
      {tab === "lang" && <LangTab locale={locale} />}
      {!isAdmin && tab !== "lang" && tab !== "profile" && (
        <Card title="">
          <div className="flex items-start gap-2.5 text-sm" style={{ color: "var(--ink-600)" }}>
            <ShieldAlert size={16} className="mt-0.5 shrink-0" style={{ color: "var(--cat-1)" }} />
            {dict.settings.noAccess}
          </div>
        </Card>
      )}

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl px-4.5 py-3 text-[12.8px] font-semibold text-white shadow-xl"
          style={{ background: "var(--ink-900)" }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function ProfileTab({
  locale,
  name,
  email,
  onToast,
}: {
  locale: Locale;
  name: string;
  email: string;
  onToast: (m: string) => void;
}) {
  const router = useRouter();
  const isZh = locale === "zh" || locale === "zh-Hant";
  const [nameVal, setNameVal] = useState(name);
  const [emailVal, setEmailVal] = useState(email);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveProfile() {
    setSavingProfile(true);
    const res = await fetch("/api/auth/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameVal, email: emailVal }),
    });
    setSavingProfile(false);
    if (res.ok) {
      onToast(isZh ? "个人资料已更新" : "Profile updated");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      onToast(body.error === "email_taken" ? (isZh ? "该邮箱已被使用" : "Email already in use") : isZh ? "更新失败" : "Update failed");
    }
  }

  async function savePassword() {
    if (newPassword.length < 8) {
      onToast(isZh ? "新密码至少需要 8 位" : "New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      onToast(isZh ? "两次输入的新密码不一致" : "New passwords don't match");
      return;
    }
    setSavingPassword(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setSavingPassword(false);
    if (res.ok) {
      onToast(isZh ? "密码已修改" : "Password changed");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      const body = await res.json().catch(() => ({}));
      onToast(body.error === "wrong_password" ? (isZh ? "当前密码不正确" : "Current password is incorrect") : isZh ? "修改失败" : "Change failed");
    }
  }

  return (
    <div className="space-y-4">
      <Card title={isZh ? "基本信息" : "Basic info"}>
        <div className="grid max-w-md gap-3">
          <label className="flex flex-col gap-1 text-[12.5px]">
            <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
              {isZh ? "姓名" : "Name"}
            </span>
            <input
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              className="rounded-lg border px-3 py-2 text-[12.8px]"
              style={{ borderColor: "var(--border)" }}
            />
          </label>
          <label className="flex flex-col gap-1 text-[12.5px]">
            <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
              Email
            </span>
            <input
              type="email"
              value={emailVal}
              onChange={(e) => setEmailVal(e.target.value)}
              className="rounded-lg border px-3 py-2 text-[12.8px]"
              style={{ borderColor: "var(--border)" }}
            />
          </label>
          <button
            disabled={savingProfile}
            onClick={saveProfile}
            className="w-fit rounded-lg px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
            style={{ background: "var(--cat-1)" }}
          >
            {savingProfile ? (isZh ? "保存中…" : "Saving…") : isZh ? "保存" : "Save"}
          </button>
        </div>
      </Card>

      <Card title={isZh ? "修改密码" : "Change password"}>
        <div className="grid max-w-md gap-3">
          <label className="flex flex-col gap-1 text-[12.5px]">
            <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
              {isZh ? "当前密码" : "Current password"}
            </span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="rounded-lg border px-3 py-2 text-[12.8px]"
              style={{ borderColor: "var(--border)" }}
            />
          </label>
          <label className="flex flex-col gap-1 text-[12.5px]">
            <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
              {isZh ? "新密码" : "New password"}
            </span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded-lg border px-3 py-2 text-[12.8px]"
              style={{ borderColor: "var(--border)" }}
            />
          </label>
          <label className="flex flex-col gap-1 text-[12.5px]">
            <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
              {isZh ? "确认新密码" : "Confirm new password"}
            </span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="rounded-lg border px-3 py-2 text-[12.8px]"
              style={{ borderColor: "var(--border)" }}
            />
          </label>
          <button
            disabled={savingPassword || !currentPassword || !newPassword}
            onClick={savePassword}
            className="w-fit rounded-lg px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
            style={{ background: "var(--cat-1)" }}
          >
            {savingPassword ? (isZh ? "修改中…" : "Changing…") : isZh ? "修改密码" : "Change password"}
          </button>
        </div>
      </Card>
    </div>
  );
}

type UserFormState = { name: string; email: string; role: string; subsidiaryId: string };
const EMPTY_USER_FORM: UserFormState = { name: "", email: "", role: "VIEWER", subsidiaryId: "" };

function UsersTab({
  dict,
  locale,
  currentUserId,
  pendingRequests,
  users,
  subsidiaries,
  onToast,
}: {
  dict: Dict;
  locale: Locale;
  currentUserId: string;
  pendingRequests: PendingRequest[];
  users: UserWithSub[];
  subsidiaries: Subsidiary[];
  onToast: (m: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const isZh = locale === "zh" || locale === "zh-Hant";

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UserFormState>(EMPTY_USER_FORM);
  const [saving, setSaving] = useState(false);

  const roleOptions = (Object.keys(dict.role) as (keyof typeof dict.role)[]).map((k) => ({ value: k, label: dict.role[k] }));
  const subsidiarySelectOptions = [{ value: "", label: dict.auth.headOffice }, ...subOptions(subsidiaries, locale)];

  async function decide(id: string, name: string, approve: boolean) {
    setBusy(id);
    const res = await fetch(`/api/admin/requests/${id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve }),
    });
    setBusy(null);
    if (res.ok) {
      const body = await res.json();
      if (approve) onToast(formatMsg(dict.settings.approvedToast, { name, pwd: body.tempPassword }));
      else onToast(formatMsg(dict.settings.rejectedToast, { name }));
      router.refresh();
    }
  }

  async function toggle(id: string) {
    setBusy(id);
    const res = await fetch(`/api/admin/users/${id}/toggle`, { method: "POST" });
    setBusy(null);
    if (res.ok) router.refresh();
  }

  async function resetPassword(id: string, name: string) {
    setBusy(id);
    const res = await fetch(`/api/admin/users/${id}/reset-password`, { method: "POST" });
    setBusy(null);
    if (res.ok) {
      const body = await res.json();
      onToast(isZh ? `${name} 的新临时密码：${body.tempPassword}（请通过其他渠道告知本人）` : `New temp password for ${name}: ${body.tempPassword} (share it with them out of band)`);
    }
  }

  function startCreate() {
    setForm(EMPTY_USER_FORM);
    setEditingId(null);
    setCreating(true);
  }

  function startEdit(u: UserWithSub) {
    setForm({ name: u.name, email: u.email, role: u.role, subsidiaryId: u.subsidiaryId ?? "" });
    setCreating(false);
    setEditingId(u.id);
  }

  function cancelForm() {
    setCreating(false);
    setEditingId(null);
  }

  async function submitCreate() {
    setSaving(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, subsidiaryId: form.subsidiaryId || null }),
    });
    setSaving(false);
    if (res.ok) {
      const body = await res.json();
      onToast(
        isZh
          ? `已添加用户 ${form.name}，临时密码：${body.tempPassword}（请通过其他渠道告知本人）`
          : `Added ${form.name} — temp password: ${body.tempPassword} (share it with them out of band)`
      );
      setCreating(false);
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      onToast(body.error === "email_taken" ? (isZh ? "该邮箱已被使用" : "That email is already in use") : isZh ? "添加失败" : "Failed to add user");
    }
  }

  async function submitEdit() {
    if (!editingId) return;
    setSaving(true);
    const res = await fetch(`/api/admin/users/${editingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, subsidiaryId: form.subsidiaryId || null }),
    });
    setSaving(false);
    if (res.ok) {
      onToast(isZh ? "已更新用户信息" : "User updated");
      setEditingId(null);
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      onToast(body.error === "email_taken" ? (isZh ? "该邮箱已被使用" : "That email is already in use") : isZh ? "更新失败" : "Failed to update user");
    }
  }

  const activeCount = users.filter((u) => u.status === "ACTIVE").length;
  const disabledCount = users.filter((u) => u.status === "DISABLED").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile icon={Users} color="var(--cat-1)" label={dict.settings.totalUsers} value={String(users.length)} />
        <KpiTile icon={Users} color="var(--status-warning)" label={dict.settings.pending} value={String(pendingRequests.length)} />
        <KpiTile icon={Users} color="var(--status-good)" label={locale === "en" ? "Active" : "正常"} value={String(activeCount)} />
        <KpiTile icon={Users} color="var(--status-critical)" label={locale === "en" ? "Disabled" : "已禁用"} value={String(disabledCount)} />
      </div>

      <Card title={dict.settings.pendingTitle}>
        {pendingRequests.length === 0 ? (
          <div className="py-2 text-[12.5px]" style={{ color: "var(--ink-400)" }}>
            {dict.settings.noPending}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.6px]">
              <thead>
                <tr className="text-left text-[11.3px] font-semibold" style={{ color: "var(--ink-400)" }}>
                  <th className="pb-2">{locale === "en" ? "Name" : "姓名"}</th>
                  <th className="pb-2">Email</th>
                  <th className="pb-2">{locale === "en" ? "Role" : "角色"}</th>
                  <th className="pb-2">{locale === "en" ? "Department" : "部门"}</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {pendingRequests.map((r) => (
                  <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 font-semibold" style={{ color: "var(--ink-900)" }}>
                      {r.name}
                    </td>
                    <td className="py-2.5" style={{ color: "var(--ink-400)" }}>
                      {r.email}
                    </td>
                    <td className="py-2.5" style={{ color: "var(--ink-400)" }}>
                      {dict.role[r.requestedRole]}
                    </td>
                    <td className="py-2.5" style={{ color: "var(--ink-400)" }}>
                      {r.subsidiary ? localizedName(r.subsidiary, locale) : dict.auth.headOffice}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        disabled={busy === r.id}
                        onClick={() => decide(r.id, r.name, true)}
                        className="mr-1.5 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11.8px] font-bold text-white disabled:opacity-50"
                        style={{ background: "var(--status-good)" }}
                      >
                        <Check size={12} /> {dict.common.approve}
                      </button>
                      <button
                        disabled={busy === r.id}
                        onClick={() => decide(r.id, r.name, false)}
                        className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11.8px] font-bold disabled:opacity-50"
                        style={{ borderColor: "color-mix(in srgb, var(--status-critical) 40%, transparent)", color: "var(--status-critical)" }}
                      >
                        <X size={12} /> {dict.common.reject}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={dict.settings.listTitle}>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.6px]">
            <thead>
              <tr className="text-left text-[11.3px] font-semibold" style={{ color: "var(--ink-400)" }}>
                <th className="pb-2">{locale === "en" ? "Name" : "姓名"}</th>
                <th className="pb-2">Email</th>
                <th className="pb-2">{locale === "en" ? "Role" : "角色"}</th>
                <th className="pb-2">{locale === "en" ? "Status" : "状态"}</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                if (editingId === u.id) {
                  return (
                    <tr key={u.id} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                      <td colSpan={5} className="py-3">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <label className="flex flex-col gap-1">
                            <span className="text-[10.8px] font-semibold" style={{ color: "var(--ink-400)" }}>
                              {locale === "en" ? "Name" : "姓名"}
                            </span>
                            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="crud-input" />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[10.8px] font-semibold" style={{ color: "var(--ink-400)" }}>
                              Email
                            </span>
                            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="crud-input" />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[10.8px] font-semibold" style={{ color: "var(--ink-400)" }}>
                              {locale === "en" ? "Role" : "角色"}
                            </span>
                            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="crud-input">
                              {roleOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[10.8px] font-semibold" style={{ color: "var(--ink-400)" }}>
                              {locale === "en" ? "Subsidiary" : "子公司"}
                            </span>
                            <select value={form.subsidiaryId} onChange={(e) => setForm({ ...form, subsidiaryId: e.target.value })} className="crud-input">
                              {subsidiarySelectOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button disabled={saving} onClick={submitEdit} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-bold text-white" style={{ background: "var(--status-good)" }}>
                            <Check size={13} /> {dict.common.save}
                          </button>
                          <button disabled={saving} onClick={cancelForm} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-bold" style={{ background: "var(--surface-2)" }}>
                            <X size={13} /> {dict.common.cancel}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={u.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 font-semibold" style={{ color: "var(--ink-900)" }}>
                      {u.name}
                    </td>
                    <td className="py-2.5" style={{ color: "var(--ink-400)" }}>
                      {u.email}
                    </td>
                    <td className="py-2.5" style={{ color: "var(--ink-400)" }}>
                      {dict.role[u.role]}
                    </td>
                    <td className="py-2.5">
                      <StatusPill tone={u.status === "ACTIVE" ? "good" : "critical"} label={u.status === "ACTIVE" ? dict.status.active : dict.status.disabled} />
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <button
                        disabled={busy === u.id || creating}
                        onClick={() => startEdit(u)}
                        className="mr-1.5 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11.8px] font-bold disabled:opacity-40"
                        style={{ background: "var(--surface-2)", color: "var(--ink-900)" }}
                      >
                        <Pencil size={12} /> {isZh ? "编辑" : "Edit"}
                      </button>
                      <button
                        disabled={busy === u.id}
                        onClick={() => resetPassword(u.id, u.name)}
                        className="mr-1.5 rounded-lg px-2.5 py-1.5 text-[11.8px] font-bold disabled:opacity-40"
                        style={{ background: "var(--surface-2)", color: "var(--ink-900)" }}
                      >
                        {isZh ? "重置密码" : "Reset password"}
                      </button>
                      <button
                        disabled={busy === u.id || u.id === currentUserId}
                        onClick={() => toggle(u.id)}
                        className="rounded-lg px-2.5 py-1.5 text-[11.8px] font-bold disabled:opacity-40"
                        style={{ background: "var(--surface-2)", color: "var(--ink-900)" }}
                      >
                        {u.status === "ACTIVE" ? dict.common.disable : dict.common.enable}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {creating && (
                <tr className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                  <td colSpan={5} className="py-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10.8px] font-semibold" style={{ color: "var(--ink-400)" }}>
                          {locale === "en" ? "Name" : "姓名"}
                        </span>
                        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="crud-input" />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10.8px] font-semibold" style={{ color: "var(--ink-400)" }}>
                          Email
                        </span>
                        <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="crud-input" />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10.8px] font-semibold" style={{ color: "var(--ink-400)" }}>
                          {locale === "en" ? "Role" : "角色"}
                        </span>
                        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="crud-input">
                          {roleOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10.8px] font-semibold" style={{ color: "var(--ink-400)" }}>
                          {locale === "en" ? "Subsidiary" : "子公司"}
                        </span>
                        <select value={form.subsidiaryId} onChange={(e) => setForm({ ...form, subsidiaryId: e.target.value })} className="crud-input">
                          {subsidiarySelectOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button disabled={saving} onClick={submitCreate} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-bold text-white" style={{ background: "var(--status-good)" }}>
                        <Check size={13} /> {dict.common.save}
                      </button>
                      <button disabled={saving} onClick={cancelForm} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-bold" style={{ background: "var(--surface-2)" }}>
                        <X size={13} /> {dict.common.cancel}
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <style>{`.crud-input{width:100%;border:1px solid var(--border-strong);border-radius:7px;padding:6px 8px;font-size:12.3px;background:var(--surface);color:var(--ink-900);outline:none}`}</style>
        {!creating && !editingId && (
          <button
            onClick={startCreate}
            className="mt-3.5 flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-bold text-white"
            style={{ background: "var(--cat-1)" }}
          >
            <Plus size={14} />
            {isZh ? "新增用户" : "Add user"}
          </button>
        )}
      </Card>
    </div>
  );
}

/* ============================================================
   Field config builders (shared select options, display helpers)
   ============================================================ */
function subOptions(subsidiaries: Subsidiary[], locale: Locale) {
  return subsidiaries.map((s) => ({ value: s.id, label: localizedName(s, locale) }));
}
function regionOptions(regions: Region[], locale: Locale) {
  return regions.map((r) => ({ value: r.id, label: localizedName(r, locale) }));
}
function subLabel(row: Row) {
  const s = row.subsidiary as Subsidiary | undefined;
  return s ? s.nameZh : "—";
}
function regionLabel(row: Row) {
  const r = row.region as Region | undefined;
  return r ? r.nameZh : "—";
}
const RISK_LEVEL_OPTIONS = [
  { value: "GOOD", label: "GOOD" },
  { value: "WARNING", label: "WARNING" },
  { value: "SERIOUS", label: "SERIOUS" },
  { value: "CRITICAL", label: "CRITICAL" },
];

function CurrencyTab({
  locale,
  companyName,
  inviteCode,
  baseCurrency,
  fyeMonth,
  hqEquity,
  hqDebtRatio,
  hqHeadcount,
  exchangeRates,
  onToast,
}: {
  locale: Locale;
  companyName: string;
  inviteCode: string;
  baseCurrency: string;
  fyeMonth: number;
  hqEquity: number;
  hqDebtRatio: number;
  hqHeadcount: number;
  exchangeRates: Row[];
  onToast: (m: string) => void;
}) {
  const router = useRouter();
  const isZh = locale === "zh" || locale === "zh-Hant";
  const [name, setName] = useState(companyName);
  const [savingName, setSavingName] = useState(false);
  const [base, setBase] = useState(baseCurrency);
  const [busy, setBusy] = useState(false);
  const [fye, setFye] = useState(String(fyeMonth));
  const [savingFye, setSavingFye] = useState(false);
  const [equity, setEquity] = useState(String(hqEquity));
  const [debtRatio, setDebtRatio] = useState(String(hqDebtRatio));
  const [savingBs, setSavingBs] = useState(false);
  const [headcount, setHeadcount] = useState(String(hqHeadcount));
  const [savingHeadcount, setSavingHeadcount] = useState(false);

  async function saveHqBalanceSheet() {
    setSavingBs(true);
    const res = await fetch("/api/admin/hq-balance-sheet", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ equity, debtRatio }),
    });
    setSavingBs(false);
    if (res.ok) {
      onToast(isZh ? "集团资产负债表已更新" : "Group balance sheet updated");
      router.refresh();
    }
  }

  async function saveHqHeadcount() {
    setSavingHeadcount(true);
    const res = await fetch("/api/admin/hq-headcount", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ headcount }),
    });
    setSavingHeadcount(false);
    if (res.ok) {
      onToast(isZh ? "集团总部员工人数已更新" : "Group HQ headcount updated");
      router.refresh();
    }
  }

  async function saveCompanyName() {
    setSavingName(true);
    const res = await fetch("/api/admin/company-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyName: name }),
    });
    setSavingName(false);
    if (res.ok) {
      onToast(isZh ? "集团名称已更新" : "Group name updated");
      router.refresh();
    }
  }

  async function saveBase() {
    setBusy(true);
    const res = await fetch("/api/admin/currency-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseCurrency: base }),
    });
    setBusy(false);
    if (res.ok) {
      onToast(isZh ? "本位币已更新" : "Base currency updated");
      router.refresh();
    }
  }

  async function saveFye() {
    setSavingFye(true);
    const res = await fetch("/api/admin/fye-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fyeMonth: fye }),
    });
    setSavingFye(false);
    if (res.ok) {
      onToast(isZh ? "财年结束月份已更新" : "Financial year end updated");
      router.refresh();
    }
  }

  const rateFields: FieldConfig[] = [
    { key: "currency", label: isZh ? "币种" : "Currency", type: "select", options: CURRENCY_OPTIONS.filter((c) => c.value !== base), required: true },
    { key: "rateToBase", label: isZh ? `兑 ${base} 汇率` : `Rate to ${base}`, type: "number", step: "0.000001", required: true },
  ];

  return (
    <div className="space-y-4">
      <Card title={isZh ? "集团名称" : "Group name"}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[12.5px]">
            <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
              {isZh ? "显示名称" : "Display name"}
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="w-64 rounded-lg border px-3 py-2 text-[12.8px]"
              style={{ borderColor: "var(--border)" }}
            />
          </label>
          <button
            disabled={savingName || !name.trim() || name === companyName}
            onClick={saveCompanyName}
            className="rounded-lg px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
            style={{ background: "var(--cat-1)" }}
          >
            {isZh ? "保存" : "Save"}
          </button>
        </div>
        <p className="mt-2 text-[11.8px]" style={{ color: "var(--ink-400)" }}>
          {isZh ? "显示在侧边栏底部，所有用户可见。" : "Shown at the bottom of the sidebar for all users."}
        </p>
      </Card>

      <Card title={isZh ? "邀请码" : "Invite code"}>
        <div className="flex flex-wrap items-center gap-3">
          <code className="rounded-lg border px-3.5 py-2 text-[13px] font-bold tracking-wide" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
            {inviteCode}
          </code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(inviteCode);
              onToast(isZh ? "已复制" : "Copied");
            }}
            className="rounded-lg border px-3.5 py-2 text-[12.5px] font-bold"
            style={{ borderColor: "var(--border-strong)", color: "var(--ink-900)" }}
          >
            {isZh ? "复制" : "Copy"}
          </button>
        </div>
        <p className="mt-2 text-[11.8px]" style={{ color: "var(--ink-400)" }}>
          {isZh
            ? "把这个邀请码发给同事，他们在注册页选择「加入已有公司」并填入此码即可申请加入贵公司（仍需管理员审批）。"
            : "Share this code with colleagues — on the register page they choose \"Join a company\", enter this code, and their request lands in your approval queue."}
        </p>
      </Card>

      <Card title={isZh ? "本位币（集团报表货币）" : "Base Currency (group reporting currency)"}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[12.5px]">
            <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
              {isZh ? "本位币" : "Base currency"}
            </span>
            <select
              value={base}
              onChange={(e) => setBase(e.target.value)}
              className="rounded-lg border px-3 py-2 text-[12.8px]"
              style={{ borderColor: "var(--border)" }}
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={busy || base === baseCurrency}
            onClick={saveBase}
            className="rounded-lg px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
            style={{ background: "var(--cat-1)" }}
          >
            {isZh ? "保存" : "Save"}
          </button>
        </div>
        <p className="mt-2 text-[11.8px]" style={{ color: "var(--ink-400)" }}>
          {isZh
            ? "所有金额将以本位币汇总；其他币种账户会按下方汇率换算。"
            : "All amounts are aggregated in the base currency; accounts in other currencies are converted using the rates below."}
        </p>
      </Card>

      <Card title={isZh ? "集团财年结束月份" : "Group financial year end"}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[12.5px]">
            <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
              {isZh ? "财年结束月份" : "Financial year end month"}
            </span>
            <select value={fye} onChange={(e) => setFye(e.target.value)} className="rounded-lg border px-3 py-2 text-[12.8px]" style={{ borderColor: "var(--border)" }}>
              {(isZh ? MONTH_OPTIONS_ZH : MONTH_OPTIONS_EN).map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={savingFye || fye === String(fyeMonth)}
            onClick={saveFye}
            className="rounded-lg px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
            style={{ background: "var(--cat-1)" }}
          >
            {isZh ? "保存" : "Save"}
          </button>
        </div>
        <p className="mt-2 text-[11.8px]" style={{ color: "var(--ink-400)" }}>
          {isZh
            ? "集团整体的财年结束月份（12 月即为自然年度）。各子公司可在下方「子公司主数据」单独设置自己的财年结束月份，用于合并/审计报表按各自结账期间取数。"
            : "The group's overall financial year end (December = calendar year). Each subsidiary can set its own FYE month separately under Subsidiary master data below — used to pull year-end figures from each entity's own closing period for consolidated/audit reporting."}
        </p>
      </Card>

      <Card title={isZh ? "集团资产负债表（总部）" : "Group balance sheet (HQ)"}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[12.5px]">
            <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
              {isZh ? "股东权益(万元)" : "Equity"}
            </span>
            <input value={equity} onChange={(e) => setEquity(e.target.value)} className="w-40 rounded-lg border px-3 py-2 text-[12.8px]" style={{ borderColor: "var(--border)" }} />
          </label>
          <label className="flex flex-col gap-1 text-[12.5px]">
            <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
              {isZh ? "资产负债率 %" : "Debt ratio %"}
            </span>
            <input value={debtRatio} onChange={(e) => setDebtRatio(e.target.value)} className="w-40 rounded-lg border px-3 py-2 text-[12.8px]" style={{ borderColor: "var(--border)" }} />
          </label>
          <button
            disabled={savingBs || (equity === String(hqEquity) && debtRatio === String(hqDebtRatio))}
            onClick={saveHqBalanceSheet}
            className="rounded-lg px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
            style={{ background: "var(--cat-1)" }}
          >
            {isZh ? "保存" : "Save"}
          </button>
        </div>
        <p className="mt-2 text-[11.8px]" style={{ color: "var(--ink-400)" }}>
          {isZh
            ? "集团/总部层面的股东权益与资产负债率（与各子公司「子公司主数据」中的字段是同一类数据，但归属于总部本身，不属于任何子公司）。可在此直接编辑，或使用下方「智能导入资产负债表」/「批量导入」并选择「集团总部」来更新。"
            : "Group/HQ-level equity and debt ratio (the same kind of field as each subsidiary's own Equity/Debt Ratio under Subsidiary master data, but belonging to the holding entity itself, not any subsidiary). Edit directly here, or update it via the Smart Balance Sheet import / Bulk import tools below by choosing \"Group HQ\"."}
        </p>
      </Card>

      <Card title={isZh ? "集团总部员工人数" : "Group HQ headcount"}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[12.5px]">
            <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
              {isZh ? "员工人数（当前）" : "Headcount (current)"}
            </span>
            <input value={headcount} onChange={(e) => setHeadcount(e.target.value)} className="w-40 rounded-lg border px-3 py-2 text-[12.8px]" style={{ borderColor: "var(--border)" }} />
          </label>
          <button
            disabled={savingHeadcount || headcount === String(hqHeadcount)}
            onClick={saveHqHeadcount}
            className="rounded-lg px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
            style={{ background: "var(--cat-1)" }}
          >
            {isZh ? "保存" : "Save"}
          </button>
        </div>
        <p className="mt-2 text-[11.8px]" style={{ color: "var(--ink-400)" }}>
          {isZh
            ? "集团/总部层面的员工人数（与各子公司「子公司主数据」中的员工人数是同一类数据，但归属于总部本身）。用于统计集团整体人员编制。"
            : "Group/HQ-level headcount (the same kind of field as each subsidiary's own Headcount under Subsidiary master data, but belonging to the holding entity itself). Used to track the group's overall headcount."}
        </p>
      </Card>

      <Card title={isZh ? "汇率设置（1 单位币种 = ? 本位币）" : "Exchange rates (1 unit of currency = ? base currency)"}>
        <CrudTable
          apiBase="/api/admin/exchange-rates"
          fields={rateFields}
          initialRows={exchangeRates}
          emptyLabel={isZh ? "暂无汇率设置" : "No exchange rates yet"}
          addLabel={isZh ? "新增汇率" : "Add exchange rate"}
        />
      </Card>
    </div>
  );
}

function OrgTab({ locale, subsidiaries, regions }: { locale: Locale; subsidiaries: Subsidiary[]; regions: Region[] }) {
  const isZh = locale === "zh" || locale === "zh-Hant";

  // Only 名称 is required — key, per-language names/segments and color are all auto-derived
  // from it server-side (see subsidiarySchema), so adding a single-entity company takes one
  // field. Advanced customization (distinct per-language names, custom color/key) can still be
  // done directly if a real multi-subsidiary group needs it later.
  const subFields: FieldConfig[] = [
    { key: "nameZh", label: isZh ? "名称" : "Name", type: "text", required: true },
    { key: "segmentZh", label: isZh ? "板块（可选，默认同名称）" : "Segment (optional, defaults to name)", type: "text" },
    { key: "equity", label: isZh ? "股东权益(万元，用于计算ROE，可选)" : "Equity (used to compute ROE, optional)", type: "number", step: "0.01" },
    { key: "debtRatio", label: isZh ? "资产负债率 % （可选）" : "Debt Ratio % (optional)", type: "number", step: "0.1" },
    { key: "headcount", label: isZh ? "员工人数（当前）" : "Headcount (current)", type: "number" },
    {
      key: "riskRating",
      label: isZh ? "风险评级（若已连接 Xero，同步时会自动上调，不会自动下调）" : "Risk Rating (auto-escalated on Xero sync if connected — never auto-downgraded)",
      type: "select",
      options: RISK_LEVEL_OPTIONS,
    },
    { key: "fyeMonth", label: isZh ? "财年结束月份" : "Financial Year End", type: "select", options: isZh ? MONTH_OPTIONS_ZH : MONTH_OPTIONS_EN },
  ];
  const subTableKeys = ["nameZh", "segmentZh", "equity", "debtRatio", "headcount", "riskRating"];

  const regionFields: FieldConfig[] = [
    { key: "_country", label: isZh ? "国家/地区（选择自动填充）" : "Country (auto-fills fields)", type: "preset", presets: REGION_COUNTRY_PRESETS, virtual: true },
    { key: "key", label: "Key", type: "text" },
    { key: "nameZh", label: "名称(简)", type: "text" },
    // Only Key + 名称(简) + Name (EN) are truly required — the other three locale variants
    // fall back to one of those two if left blank, since typing out 5 near-duplicate "name in
    // language X" fields by hand (instead of using the Country preset above) was reported as
    // confusing and blocked submission with no indication of which field was the problem.
    { key: "nameZhTw", label: "名称(繁)", type: "text", fallbackFrom: "nameZh" },
    { key: "nameEn", label: "Name (EN)", type: "text" },
    { key: "nameMs", label: "Name (MS)", type: "text", fallbackFrom: "nameEn" },
    { key: "nameId", label: "Name (ID)", type: "text", fallbackFrom: "nameEn" },
    { key: "sortOrder", label: isZh ? "排序" : "Order", type: "number" },
  ];
  const regionTableKeys = ["nameZh", "nameEn", "sortOrder"];

  return (
    <div className="space-y-4">
      <Card title={isZh ? "子公司主数据" : "Subsidiary master data"}>
        <div className="mb-3 text-[11.8px]" style={{ color: "var(--ink-400)" }}>
          {isZh
            ? "子公司 = 集团下的法律实体/业务单位。利润表、预算、应收应付、Xero 连接等数据都记录在某个子公司名下 — 新增子公司后会自动出现在这些数据录入表单和 ERP 连接列表中，无需额外设置。"
            : "A subsidiary is a legal entity / business unit under the group. Financial data (P&L, budgets, AR/AP, Xero connections, etc.) is recorded against a subsidiary — a newly added one automatically appears in every relevant data-entry form and the ERP connection list, no extra setup needed."}
        </div>
        <CrudTable
          apiBase="/api/admin/subsidiaries"
          fields={subFields}
          tableKeys={subTableKeys}
          initialRows={subsidiaries as unknown as Row[]}
          emptyLabel={isZh ? "暂无子公司" : "No subsidiaries yet"}
          addLabel={isZh ? "新增子公司" : "Add subsidiary"}
        />
      </Card>
      <Card title={isZh ? "区域主数据" : "Region master data"}>
        <div className="mb-3 text-[11.8px]" style={{ color: "var(--ink-400)" }}>
          {isZh
            ? "区域是集团层面的地理维度（如新加坡、马来西亚），与上方的子公司维度相互独立 — 一个区域不属于任何单一子公司，用于按国家/地区查看整体营收分布。如果暂时不需要按地理位置分析，可以不填写此项。"
            : "Region is a group-level geographic dimension (e.g. Singapore, Malaysia) — independent from the subsidiary dimension above; a region doesn't belong to any single subsidiary. It's used to view overall revenue by country. Skip this section if geographic breakdowns aren't needed yet."}
        </div>
        <CrudTable
          apiBase="/api/admin/regions"
          fields={regionFields}
          tableKeys={regionTableKeys}
          initialRows={regions as unknown as Row[]}
          emptyLabel={isZh ? "暂无区域" : "No regions yet"}
          addLabel={isZh ? "新增区域" : "Add region"}
        />
      </Card>
    </div>
  );
}

function FinancialsTab({
  locale,
  subsidiaries,
  regions,
  monthlyFinancials,
  regionFinancials,
  budgets,
  banks,
  cashflow,
}: {
  locale: Locale;
  subsidiaries: Subsidiary[];
  regions: Region[];
  monthlyFinancials: Row[];
  regionFinancials: Row[];
  budgets: Row[];
  banks: Row[];
  cashflow: Row[];
}) {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const [sub, setSub] = useState<"monthly" | "region" | "budget" | "bank" | "cashflow">("monthly");

  const subTabs: { id: typeof sub; label: string }[] = [
    { id: "monthly", label: isZh ? "子公司月度财务" : "Subsidiary Monthly" },
    { id: "region", label: isZh ? "区域月度财务" : "Region Monthly" },
    { id: "budget", label: isZh ? "年度预算" : "Annual Budget" },
    { id: "bank", label: isZh ? "银行账户" : "Bank Accounts" },
    { id: "cashflow", label: isZh ? "月度现金流" : "Monthly Cash Flow" },
  ];

  // Shared by every FieldConfig below whose subsidiaryId is nullable (= group/HQ-level row) —
  // mirrors BankAccount's "所属主体" pattern.
  const subsidiaryOrHqOptions = [{ value: "", label: isZh ? "集团总部" : "Group HQ" }, ...subOptions(subsidiaries, locale)];
  const subsidiaryOrHqLabel = (row: Row) => {
    const s = row.subsidiary as Subsidiary | null | undefined;
    return s ? localizedName(s, locale) : isZh ? "集团总部" : "Group HQ";
  };

  const monthlyFields: FieldConfig[] = [
    { key: "subsidiaryId", label: isZh ? "子公司" : "Subsidiary", type: "select", options: subsidiaryOrHqOptions, displayValue: subsidiaryOrHqLabel },
    { key: "year", label: isZh ? "年度" : "Year", type: "number" },
    { key: "month", label: isZh ? "月份" : "Month", type: "number" },
    { key: "revenue", label: isZh ? "营业收入(万元)" : "Revenue", type: "number", step: "0.01" },
    { key: "netProfit", label: isZh ? "净利润(万元)" : "Net Profit", type: "number", step: "0.01" },
    { key: "grossMarginPct", label: isZh ? "毛利率 %" : "Gross Margin %", type: "number", step: "0.1" },
    { key: "opCost", label: isZh ? "营业成本(万元，销售成本)" : "Op. Cost (cost of sales)", type: "number", step: "0.01" },
    { key: "sellExp", label: isZh ? "销售费用(万元)" : "Selling Expense", type: "number", step: "0.01" },
    { key: "adminExp", label: isZh ? "管理费用(万元)" : "Admin Expense", type: "number", step: "0.01" },
    { key: "rndExp", label: isZh ? "研发费用(万元)" : "R&D Expense", type: "number", step: "0.01" },
    { key: "financeExp", label: isZh ? "财务费用(万元)" : "Finance Expense", type: "number", step: "0.01" },
    { key: "headcount", label: isZh ? "员工人数（当月末）" : "Headcount (end of month)", type: "number" },
  ];
  const monthlyTableKeys = ["subsidiaryId", "year", "month", "revenue", "netProfit", "grossMarginPct", "opCost"];

  const regionFieldsCfg: FieldConfig[] = [
    { key: "regionId", label: isZh ? "区域" : "Region", type: "select", options: regionOptions(regions, locale), displayValue: regionLabel },
    { key: "year", label: isZh ? "年度" : "Year", type: "number" },
    { key: "month", label: isZh ? "月份" : "Month", type: "number" },
    { key: "revenue", label: isZh ? "营业收入(万元)" : "Revenue", type: "number", step: "0.01" },
    { key: "netProfit", label: isZh ? "净利润(万元)" : "Net Profit", type: "number", step: "0.01" },
  ];

  const budgetFields: FieldConfig[] = [
    { key: "subsidiaryId", label: isZh ? "子公司" : "Subsidiary", type: "select", options: subsidiaryOrHqOptions, displayValue: subsidiaryOrHqLabel },
    { key: "year", label: isZh ? "年度" : "Year", type: "number" },
    { key: "revenueBudget", label: isZh ? "年度收入预算(万元)" : "Revenue Budget", type: "number", step: "0.01" },
    { key: "costBudgetRate", label: isZh ? "成本预算执行率 %" : "Cost Budget Rate %", type: "number", step: "0.1" },
    { key: "expenseBudgetRate", label: isZh ? "费用预算执行率 %" : "Expense Budget Rate %", type: "number", step: "0.1" },
  ];

  const bankFields: FieldConfig[] = [
    { key: "_bank", label: isZh ? "银行（选择自动填充）" : "Bank (auto-fills fields)", type: "preset", presets: BANK_PRESETS, virtual: true },
    { key: "bankZh", label: isZh ? "银行(简)" : "Bank (ZH)", type: "text", uppercase: true },
    { key: "bankEn", label: "Bank (EN)", type: "text", uppercase: true },
    { key: "acctType", label: isZh ? "账户类型" : "Account Type", type: "select", options: [{ value: "main", label: "基本户/main" }, { value: "general", label: "一般户/general" }, { value: "fx", label: "外汇/fx" }] },
    { key: "balance", label: isZh ? "余额(万元)" : "Balance", type: "number", step: "0.01" },
    { key: "currency", label: isZh ? "币种" : "Currency", type: "select", options: CURRENCY_OPTIONS },
    { key: "subsidiaryId", label: isZh ? "所属主体" : "Owner", type: "select", options: subsidiaryOrHqOptions, displayValue: subsidiaryOrHqLabel },
  ];
  const bankTableKeys = ["bankZh", "acctType", "balance", "currency", "subsidiaryId"];

  const cashflowFields: FieldConfig[] = [
    { key: "year", label: isZh ? "年度" : "Year", type: "number" },
    { key: "month", label: isZh ? "月份" : "Month", type: "number" },
    { key: "ocf", label: isZh ? "经营活动净额" : "Operating (net)", type: "number", step: "0.01" },
    { key: "icf", label: isZh ? "投资活动净额" : "Investing (net)", type: "number", step: "0.01" },
    { key: "fcf", label: isZh ? "筹资活动净额" : "Financing (net)", type: "number", step: "0.01" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {subTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className="rounded-full px-3 py-1.5 text-[12px] font-bold"
            style={{ background: sub === t.id ? "var(--cat-1)" : "var(--surface-2)", color: sub === t.id ? "#fff" : "var(--ink-600)" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === "monthly" && (
        <Card title={isZh ? "子公司月度财务数据" : "Subsidiary Monthly Financials"}>
          <CrudTable apiBase="/api/admin/monthly-financials" fields={monthlyFields} tableKeys={monthlyTableKeys} initialRows={monthlyFinancials} emptyLabel={isZh ? "暂无数据" : "No data yet"} addLabel={isZh ? "新增记录" : "Add record"} />
        </Card>
      )}
      {sub === "region" && (
        <Card title={isZh ? "区域月度财务数据" : "Region Monthly Financials"}>
          <CrudTable apiBase="/api/admin/region-financials" fields={regionFieldsCfg} initialRows={regionFinancials} emptyLabel={isZh ? "暂无数据" : "No data yet"} addLabel={isZh ? "新增记录" : "Add record"} />
        </Card>
      )}
      {sub === "budget" && (
        <Card title={isZh ? "年度预算" : "Annual Budget"}>
          <CrudTable apiBase="/api/admin/budgets" fields={budgetFields} initialRows={budgets} emptyLabel={isZh ? "暂无预算" : "No budgets yet"} addLabel={isZh ? "新增预算" : "Add budget"} />
        </Card>
      )}
      {sub === "bank" && (
        <Card title={isZh ? "银行账户" : "Bank Accounts"}>
          <div className="mb-3 text-[11.8px]" style={{ color: "var(--ink-400)" }}>
            {isZh
              ? "「余额」= 该账户当前（截至今天）的最新余额，不是某个月份的历史记录 — 每次修改都会直接覆盖为最新数字。资金管理页面会用这个数字倒推出各月份的期初余额，所以请保持这里是最新的实际余额。"
              : "\"Balance\" is the account's current balance as of today — a single up-to-date snapshot, not a historical record for a specific month. Editing it overwrites the number directly. The Fund Management page works backwards from this figure to reconstruct each month's opening balance, so keep this field updated to the actual current balance."}
          </div>
          <CrudTable apiBase="/api/admin/banks" fields={bankFields} tableKeys={bankTableKeys} initialRows={banks} emptyLabel={isZh ? "暂无账户" : "No accounts yet"} addLabel={isZh ? "新增账户" : "Add account"} />
        </Card>
      )}
      {sub === "cashflow" && (
        <Card title={isZh ? "月度现金流" : "Monthly Cash Flow"}>
          <CrudTable apiBase="/api/admin/cashflow" fields={cashflowFields} initialRows={cashflow} emptyLabel={isZh ? "暂无数据" : "No data yet"} addLabel={isZh ? "新增记录" : "Add record"} />
        </Card>
      )}
    </div>
  );
}

function BusinessTab({
  locale,
  subsidiaries,
  arCustomers,
  payables,
  projects,
  risks,
  reports,
}: {
  locale: Locale;
  subsidiaries: Subsidiary[];
  arCustomers: Row[];
  payables: Row[];
  projects: Row[];
  risks: Row[];
  reports: Row[];
}) {
  const isZh = locale === "zh" || locale === "zh-Hant";
  // The AR/AP dashboard pages' "Edit" links land here with ?sub=ar|ap&q=<name> so a specific
  // row opens pre-filtered instead of an unfiltered list of thousands of rows.
  const searchParams = useSearchParams();
  const initialSubParam = searchParams.get("sub");
  const SUB_TABS = ["ar", "ap", "project", "risk", "report"] as const;
  const [sub, setSub] = useState<(typeof SUB_TABS)[number]>(
    SUB_TABS.includes(initialSubParam as (typeof SUB_TABS)[number]) ? (initialSubParam as (typeof SUB_TABS)[number]) : "ar"
  );
  const qParam = searchParams.get("q") ?? "";

  const subTabs: { id: typeof sub; label: string }[] = [
    { id: "ar", label: isZh ? "应收客户" : "AR Customers" },
    { id: "ap", label: isZh ? "应付供应商" : "AP Vendors" },
    { id: "project", label: isZh ? "项目" : "Projects" },
    { id: "risk", label: isZh ? "风险预警" : "Risk Alerts" },
    { id: "report", label: isZh ? "报表" : "Reports" },
  ];

  // null subsidiaryId = a group/HQ-level receivable/payable (see BankAccount.subsidiaryId).
  const subsidiaryOrHqOptions = [{ value: "", label: isZh ? "集团总部" : "Group HQ" }, ...subOptions(subsidiaries, locale)];
  const subsidiaryOrHqLabel = (row: Row) => {
    const s = row.subsidiary as Subsidiary | null | undefined;
    return s ? localizedName(s, locale) : isZh ? "集团总部" : "Group HQ";
  };

  const arFields: FieldConfig[] = [
    { key: "nameZh", label: isZh ? "客户(简)" : "Customer (ZH)", type: "text" },
    { key: "nameEn", label: "Customer (EN)", type: "text" },
    { key: "subsidiaryId", label: isZh ? "子公司" : "Subsidiary", type: "select", options: subsidiaryOrHqOptions, displayValue: subsidiaryOrHqLabel },
    { key: "balance", label: isZh ? "余额(万元)" : "Balance", type: "number", step: "0.01" },
    { key: "agingDays", label: isZh ? "账龄(天)" : "Aging (days)", type: "number" },
    { key: "status", label: isZh ? "状态" : "Status", type: "select", options: RISK_LEVEL_OPTIONS },
  ];

  const apFields: FieldConfig[] = [
    { key: "nameZh", label: isZh ? "供应商(简)" : "Vendor (ZH)", type: "text" },
    { key: "nameEn", label: "Vendor (EN)", type: "text" },
    { key: "subsidiaryId", label: isZh ? "子公司" : "Subsidiary", type: "select", options: subsidiaryOrHqOptions, displayValue: subsidiaryOrHqLabel },
    { key: "balance", label: isZh ? "余额(万元)" : "Balance", type: "number", step: "0.01" },
    { key: "agingDays", label: isZh ? "账龄(天)" : "Aging (days)", type: "number" },
    { key: "status", label: isZh ? "状态" : "Status", type: "select", options: RISK_LEVEL_OPTIONS },
  ];

  const projectFields: FieldConfig[] = [
    { key: "nameZh", label: isZh ? "项目(简)" : "Project (ZH)", type: "text" },
    { key: "nameEn", label: "Project (EN)", type: "text" },
    { key: "subsidiaryId", label: isZh ? "子公司" : "Subsidiary", type: "select", options: subOptions(subsidiaries, locale), displayValue: subLabel },
    { key: "budget", label: isZh ? "预算(万元)" : "Budget", type: "number", step: "0.01" },
    { key: "spent", label: isZh ? "已投资(万元)" : "Spent", type: "number", step: "0.01" },
    { key: "progressPct", label: isZh ? "进度 %" : "Progress %", type: "number" },
    { key: "status", label: isZh ? "状态" : "Status", type: "select", options: [{ value: "ON_TRACK", label: "ON_TRACK" }, { value: "AHEAD", label: "AHEAD" }, { value: "DELAYED", label: "DELAYED" }] },
    { key: "owner", label: isZh ? "负责人" : "Owner", type: "text" },
  ];

  const riskFields: FieldConfig[] = [
    { key: "severity", label: isZh ? "严重程度" : "Severity", type: "select", options: RISK_LEVEL_OPTIONS },
    {
      key: "category",
      label: isZh ? "类别" : "Category",
      type: "select",
      options: ["opRisk", "costRisk", "creditRisk", "marketRisk", "liquidityRisk", "complianceRisk"].map((v) => ({ value: v, label: v })),
    },
    { key: "tag", label: "Tag", type: "text" },
    { key: "subsidiaryId", label: isZh ? "关联子公司(可空)" : "Subsidiary (optional)", type: "select", options: [{ value: "", label: isZh ? "无" : "None" }, ...subOptions(subsidiaries, locale)], displayValue: subLabel },
    { key: "entityLabel", label: isZh ? "实体名称" : "Entity label", type: "text" },
    { key: "textZh", label: "文本(简)", type: "textarea" },
    { key: "textZhTw", label: "文本(繁)", type: "textarea" },
    { key: "textEn", label: "Text (EN)", type: "textarea" },
    { key: "textMs", label: "Text (MS)", type: "textarea" },
    { key: "textId", label: "Text (ID)", type: "textarea" },
    { key: "occurredAt", label: isZh ? "发生日期" : "Occurred at", type: "date" },
  ];
  const riskTableKeys = ["severity", "category", "tag", "entityLabel", "textZh", "occurredAt"];

  const reportFields: FieldConfig[] = [
    { key: "nameZh", label: isZh ? "名称(简)" : "Name (ZH)", type: "text" },
    { key: "nameEn", label: "Name (EN)", type: "text" },
    { key: "type", label: isZh ? "类型" : "Type", type: "select", options: [{ value: "MANAGEMENT", label: "MANAGEMENT" }, { value: "SPECIAL", label: "SPECIAL" }, { value: "STATUTORY", label: "STATUTORY" }] },
    { key: "status", label: isZh ? "状态" : "Status", type: "select", options: [{ value: "GENERATED", label: "GENERATED" }, { value: "GENERATING", label: "GENERATING" }, { value: "ARCHIVED", label: "ARCHIVED" }] },
    { key: "period", label: isZh ? "期间" : "Period", type: "text" },
    { key: "generatedAt", label: isZh ? "生成日期" : "Generated at", type: "date" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {subTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className="rounded-full px-3 py-1.5 text-[12px] font-bold"
            style={{ background: sub === t.id ? "var(--cat-1)" : "var(--surface-2)", color: sub === t.id ? "#fff" : "var(--ink-600)" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === "ar" && (
        <Card title={isZh ? "应收客户" : "AR Customers"}>
          <CrudTable apiBase="/api/admin/ar-customers" fields={arFields} initialRows={arCustomers} emptyLabel={isZh ? "暂无客户" : "No customers yet"} addLabel={isZh ? "新增客户" : "Add customer"} defaultSearch={qParam} />
        </Card>
      )}
      {sub === "ap" && (
        <Card title={isZh ? "应付供应商" : "AP Vendors"}>
          <CrudTable apiBase="/api/admin/payables" fields={apFields} initialRows={payables} emptyLabel={isZh ? "暂无供应商" : "No vendors yet"} addLabel={isZh ? "新增供应商" : "Add vendor"} defaultSearch={qParam} />
        </Card>
      )}
      {sub === "project" && (
        <Card title={isZh ? "项目" : "Projects"}>
          <CrudTable apiBase="/api/admin/projects" fields={projectFields} initialRows={projects} emptyLabel={isZh ? "暂无项目" : "No projects yet"} addLabel={isZh ? "新增项目" : "Add project"} />
        </Card>
      )}
      {sub === "risk" && (
        <Card title={isZh ? "风险预警" : "Risk Alerts"}>
          <CrudTable apiBase="/api/admin/risks" fields={riskFields} tableKeys={riskTableKeys} initialRows={risks} emptyLabel={isZh ? "暂无预警" : "No alerts yet"} addLabel={isZh ? "新增预警" : "Add alert"} />
        </Card>
      )}
      {sub === "report" && (
        <Card title={isZh ? "报表" : "Reports"}>
          <CrudTable apiBase="/api/admin/reports" fields={reportFields} initialRows={reports} emptyLabel={isZh ? "暂无报表" : "No reports yet"} addLabel={isZh ? "新增报表" : "Add report"} />
        </Card>
      )}
    </div>
  );
}

function relativeTime(date: Date | string | null | undefined, isZh: boolean): string {
  if (!date) return isZh ? "从未" : "never";
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return isZh ? "刚刚" : "just now";
  if (diffMin < 60) return isZh ? `${diffMin} 分钟前` : `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return isZh ? `${diffHr} 小时前` : `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return isZh ? `${diffDay} 天前` : `${diffDay}d ago`;
}

function DataTab({
  locale,
  onToast,
  importBatches,
  subsidiaries,
  xeroConnections,
  xeroGroupConnected,
  xeroGroupTenantName,
  xeroConfigured,
  expenseCategoryMappings,
}: {
  locale: Locale;
  onToast: (m: string) => void;
  importBatches: ImportBatchWithUser[];
  subsidiaries: Subsidiary[];
  xeroConnections: XeroConnection[];
  xeroGroupConnected: boolean;
  xeroGroupTenantName: string | null;
  xeroConfigured: boolean;
  expenseCategoryMappings: ExpenseCategoryMapping[];
}) {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const router = useRouter();
  const searchParams = useSearchParams();
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deletingImportId, setDeletingImportId] = useState<string | null>(null);
  const [pendingChoice, setPendingChoice] = useState<
    | { kind: "group"; tenants: { tenantId: string; tenantName: string }[] }
    | { kind: "subsidiary"; subsidiaryId: string; subsidiaryName: string; tenants: { tenantId: string; tenantName: string }[] }
    | null
  >(null);
  const [chosenTenantId, setChosenTenantId] = useState("");
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    const xero = searchParams.get("xero");
    if (!xero) return;
    if (xero === "connected") onToast(isZh ? "Xero 已连接成功" : "Xero connected successfully");
    else if (xero === "not_configured") onToast(isZh ? "Xero 集成尚未配置，请联系管理员完成设置" : "Xero integration isn't configured yet — ask your administrator to finish setup");
    else if (xero === "error") onToast(isZh ? "Xero 连接失败，请重试" : "Xero connection failed — please try again");
    else if (xero === "choose_tenant") {
      fetch("/api/admin/erp/xero/pending")
        .then((r) => r.json())
        .then((body) => {
          if (body.pending) {
            setPendingChoice(body.pending);
            setChosenTenantId(body.pending.tenants[0]?.tenantId ?? "");
          }
        });
    }
    router.replace("/settings?tab=data");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // subsidiaryId omitted disconnects the group/HQ-level connection instead of a subsidiary's.
  async function disconnectXero(subsidiaryId?: string) {
    setDisconnectingId(subsidiaryId ?? "group");
    const res = await fetch("/api/admin/erp/xero/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subsidiaryId ? { subsidiaryId } : {}),
    });
    setDisconnectingId(null);
    if (res.ok) {
      onToast(isZh ? "已断开 Xero 连接" : "Xero disconnected");
      router.refresh();
    }
  }

  async function syncAll(subsidiaryId: string) {
    setSyncingId(subsidiaryId);
    const res = await fetch("/api/admin/erp/xero/sync-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subsidiaryId }),
    });
    setSyncingId(null);
    if (res.ok) {
      const r = await res.json();
      if (r.ok) {
        onToast(
          isZh
            ? `已从 Xero 同步：${r.monthsSynced} 个月利润表、${r.customersSynced} 个应收客户、${r.payablesSynced} 个应付供应商、年度预算、${r.bankAccountsSynced} 个银行账户、股东权益与资产负债率、风险评级（${r.riskRating ?? "—"}）`
            : `Synced from Xero: ${r.monthsSynced} months of P&L, ${r.customersSynced} AR customers, ${r.payablesSynced} AP vendors, annual budget, ${r.bankAccountsSynced} bank accounts, equity & debt ratio, risk rating (${r.riskRating ?? "—"})`
        );
      } else {
        onToast(isZh ? `部分同步失败：${r.errors?.[0] ?? "未知错误"}（可能需要重新连接 Xero 以授予新权限）` : `Some steps failed: ${r.errors?.[0] ?? "unknown error"} (may need to reconnect Xero to grant new permissions)`);
      }
      router.refresh();
    } else {
      onToast(isZh ? "同步失败，请重试" : "Sync failed — please try again");
    }
  }

  async function deleteImportBatch(id: string) {
    if (!confirm(isZh ? "确定要删除这条导入记录吗？（仅删除日志，不影响已导入的数据）" : "Delete this import log entry? (only removes the log — the data it imported stays untouched)")) return;
    setDeletingImportId(id);
    const res = await fetch(`/api/admin/import-batches/${id}`, { method: "DELETE" });
    setDeletingImportId(null);
    if (res.ok) router.refresh();
    else onToast(isZh ? "删除失败，请重试" : "Delete failed — please try again");
  }

  async function confirmTenantChoice() {
    if (!pendingChoice || !chosenTenantId) return;
    setChoosing(true);
    const res = await fetch("/api/admin/erp/xero/choose-tenant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: chosenTenantId }),
    });
    setChoosing(false);
    if (res.ok) {
      onToast(isZh ? "Xero 已连接成功" : "Xero connected successfully");
      setPendingChoice(null);
      router.refresh();
    } else {
      onToast(isZh ? "选择失败，请重新连接" : "Selection failed — please reconnect");
      setPendingChoice(null);
    }
  }

  const connectionBySubsidiary = new Map(xeroConnections.map((c) => [c.subsidiaryId, c]));

  return (
    <div className="space-y-4">
      <Card title={locale === "en" ? "ERP Integration" : "ERP系统对接"}>
        <div className="space-y-3">
          <div className="text-[11.5px] font-semibold" style={{ color: "var(--ink-400)" }}>
            {isZh ? "集团 / 总部" : "Group / HQ"}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2.5">
              <span className="text-[13px] font-semibold" style={{ color: "var(--ink-900)" }}>
                Xero
              </span>
              {xeroGroupConnected ? (
                <StatusPill tone="good" label={isZh ? `已连接${xeroGroupTenantName ? ` · ${xeroGroupTenantName}` : ""}` : `Connected${xeroGroupTenantName ? ` · ${xeroGroupTenantName}` : ""}`} />
              ) : (
                <StatusPill tone="warning" label={isZh ? "未连接" : "Not connected"} />
              )}
            </div>
            {xeroGroupConnected ? (
              <button
                onClick={() => disconnectXero()}
                disabled={disconnectingId === "group"}
                className="rounded-lg px-3 py-1.5 text-[12px] font-bold disabled:opacity-50"
                style={{ background: "var(--surface-2)", color: "var(--status-critical)" }}
              >
                {isZh ? "断开连接" : "Disconnect"}
              </button>
            ) : (
              <a href="/api/admin/erp/xero/connect" className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-white" style={{ background: "var(--cat-1)" }}>
                {isZh ? "连接 Xero" : "Connect Xero"}
              </a>
            )}
          </div>
          <div className="pt-1 text-[11.5px] font-semibold" style={{ color: "var(--ink-400)" }}>
            {isZh ? "子公司" : "Subsidiaries"}
          </div>
          {subsidiaries.length === 0 && (
            <div className="text-[12px]" style={{ color: "var(--ink-400)" }}>
              {isZh ? "请先在「集团设置」添加子公司，才能为其连接 Xero" : "Add a subsidiary under Group Settings before connecting it to Xero"}
            </div>
          )}
          {subsidiaries.map((sub) => {
            const conn = connectionBySubsidiary.get(sub.id);
            const connected = Boolean(conn?.connectedAt);
            return (
              <div key={sub.id} className="flex flex-col gap-1.5 rounded-lg border px-3.5 py-2.5" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[13px] font-semibold" style={{ color: "var(--ink-900)" }}>
                      {localizedName(sub, locale)}
                    </span>
                    {connected ? (
                      <StatusPill tone="good" label={isZh ? `已连接${conn?.tenantName ? ` · ${conn.tenantName}` : ""}` : `Connected${conn?.tenantName ? ` · ${conn.tenantName}` : ""}`} />
                    ) : (
                      <StatusPill tone="warning" label={isZh ? "未连接" : "Not connected"} />
                    )}
                  </div>
                  {connected ? (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => syncAll(sub.id)}
                        disabled={syncingId === sub.id}
                        className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
                        style={{ background: "var(--cat-1)" }}
                      >
                        {syncingId === sub.id ? (isZh ? "同步中…" : "Syncing…") : isZh ? "全部同步" : "Sync all"}
                      </button>
                      <button
                        onClick={() => disconnectXero(sub.id)}
                        disabled={disconnectingId === sub.id}
                        className="rounded-lg px-3 py-1.5 text-[12px] font-bold disabled:opacity-50"
                        style={{ background: "var(--surface-2)", color: "var(--status-critical)" }}
                      >
                        {isZh ? "断开连接" : "Disconnect"}
                      </button>
                    </div>
                  ) : (
                    <a
                      href={`/api/admin/erp/xero/connect?subsidiaryId=${sub.id}`}
                      className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-white"
                      style={{ background: "var(--cat-1)" }}
                    >
                      {isZh ? "连接 Xero" : "Connect Xero"}
                    </a>
                  )}
                </div>
                {connected && (
                  <div className="flex items-center gap-1.5 text-[11px]" style={{ color: conn?.lastSyncError ? "var(--status-critical)" : "var(--ink-400)" }}>
                    {conn?.lastSyncError
                      ? isZh
                        ? `上次同步失败（${relativeTime(conn.lastSyncAt, isZh)}）：${conn.lastSyncError}`
                        : `Last sync failed (${relativeTime(conn.lastSyncAt, isZh)}): ${conn.lastSyncError}`
                      : conn?.lastSyncAt
                        ? isZh
                          ? `每日自动同步 · 上次同步：${relativeTime(conn.lastSyncAt, isZh)}`
                          : `Auto-syncs daily · Last synced ${relativeTime(conn.lastSyncAt, isZh)}`
                        : isZh
                          ? "每日自动同步 · 尚未同步过，请点击「全部同步」立即同步一次"
                          : "Auto-syncs daily · Not synced yet — click \"Sync all\" to run it now"}
                  </div>
                )}
              </div>
            );
          })}
          <button
            onClick={() =>
              onToast(
                isZh
                  ? "用友 / 金蝶 / SAP 等 ERP 系统对接即将推出，敬请期待"
                  : "Yonyou / Kingdee / SAP and other ERP integrations are coming soon"
              )
            }
            className="flex items-center gap-1.5 rounded-lg border border-dashed px-3.5 py-2.5 text-[12.5px] font-bold"
            style={{ borderColor: "var(--border-strong)", color: "var(--ink-400)" }}
          >
            <Plus size={14} />
            {isZh ? "新增子公司 ERP 系统对接（用友 / 金蝶 / SAP 等）" : "Add subsidiary ERP integration (Yonyou / Kingdee / SAP, etc.)"}
          </button>
          {!xeroConfigured && (
            <div className="rounded-lg px-3 py-2 text-[11.8px]" style={{ background: "color-mix(in srgb, var(--status-warning) 12%, transparent)", color: "var(--status-warning)" }}>
              {isZh
                ? "Xero 应用尚未配置（缺少 Client ID / Secret），点击「连接 Xero」会提示需要先完成配置。已连接后，系统可直接同步利润表、应收与应付数据；在此之前，请使用下方的智能利润表导入或批量导入功能。"
                : "The Xero app isn't configured yet (missing Client ID/Secret) — clicking \"Connect Xero\" will explain setup is needed first. Once connected, P&L, AR and AP data can sync directly; until then, use the smart P&L import or bulk import below."}
            </div>
          )}
        </div>
      </Card>
      {pendingChoice && (
        <Card title={isZh ? "选择 Xero 组织" : "Choose Xero organisation"}>
          <div className="space-y-3">
            <div className="text-[12.5px]" style={{ color: "var(--ink-400)" }}>
              {pendingChoice.kind === "group"
                ? isZh
                  ? "此 Xero 登录可访问多个组织 — 请选择要连接到集团/总部的那一个："
                  : "This Xero login has access to multiple organisations — pick the one to connect to Group/HQ:"
                : isZh
                  ? `此 Xero 登录可访问多个组织 — 请选择要连接到「${pendingChoice.subsidiaryName}」的那一个：`
                  : `This Xero login has access to multiple organisations — pick the one to connect to "${pendingChoice.subsidiaryName}":`}
            </div>
            <div className="space-y-1.5">
              {pendingChoice.tenants.map((t) => (
                <label key={t.tenantId} className="flex items-center gap-2 text-[13px]" style={{ color: "var(--ink-900)" }}>
                  <input type="radio" name="xero-tenant" checked={chosenTenantId === t.tenantId} onChange={() => setChosenTenantId(t.tenantId)} />
                  {t.tenantName}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={confirmTenantChoice}
                disabled={choosing || !chosenTenantId}
                className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
                style={{ background: "var(--cat-1)" }}
              >
                {isZh ? "确认" : "Confirm"}
              </button>
              <button onClick={() => setPendingChoice(null)} className="rounded-lg px-3 py-1.5 text-[12px] font-bold" style={{ background: "var(--surface-2)" }}>
                {isZh ? "取消" : "Cancel"}
              </button>
            </div>
          </div>
        </Card>
      )}
      <Card title={isZh ? "智能导入利润表（P&L）" : "Smart P&L import"}>
        <PnlImport locale={locale} onToast={onToast} subsidiaries={subsidiaries} expenseCategoryMappings={expenseCategoryMappings} />
      </Card>
      <Card title={isZh ? "费用分类映射" : "Expense category mapping"}>
        <div className="mb-3 text-[11.8px]" style={{ color: "var(--ink-400)" }}>
          {isZh
            ? "真实的利润表报告通常把所有营业费用列成一份平铺的明细（如「工资」「银行手续费」「办公室租金」），并不会自动分成销售/管理/研发/财务四类 — 这里记录每个费用科目名称对应哪一类，导入利润表时可直接分类（会自动记住），也可以在这里手动增删改。「利息」「银行手续费」类科目已可自动识别为财务费用。"
            : "A real P&L report usually lists all operating expenses as one flat list (e.g. \"Salaries\", \"Bank Charges\", \"Office Rental\") — it's never automatically split into Selling/Admin/R&D/Finance. This records which category each real expense line item belongs to; classify inline while importing a P&L (remembered automatically), or manage entries directly here. \"Interest\"/\"Bank Charges\"-type items are already auto-recognized as Finance."}
        </div>
        <CrudTable
          apiBase="/api/admin/expense-category-mappings"
          fields={[
            { key: "accountLabel", label: isZh ? "费用科目名称" : "Account label", type: "text" },
            {
              key: "category",
              label: isZh ? "分类" : "Category",
              type: "select",
              options: [
                { value: "SELLING", label: isZh ? "销售费用" : "Selling" },
                { value: "ADMIN", label: isZh ? "管理费用" : "Admin" },
                { value: "RND", label: isZh ? "研发费用" : "R&D" },
                { value: "FINANCE", label: isZh ? "财务费用" : "Finance" },
              ],
            },
          ]}
          initialRows={expenseCategoryMappings as unknown as Row[]}
          emptyLabel={isZh ? "暂无分类映射" : "No mappings yet"}
          addLabel={isZh ? "新增映射" : "Add mapping"}
        />
      </Card>
      <Card title={isZh ? "智能导入资产负债表" : "Smart Balance Sheet import"}>
        <BalanceSheetImport locale={locale} onToast={onToast} subsidiaries={subsidiaries} />
      </Card>
      <Card title={isZh ? "智能导入应收账龄汇总表" : "Smart AR Aging import"}>
        <SmartAgingImport kind="ar" locale={locale} onToast={onToast} subsidiaries={subsidiaries} />
      </Card>
      <Card title={isZh ? "智能导入应付账龄汇总表" : "Smart AP Aging import"}>
        <SmartAgingImport kind="ap" locale={locale} onToast={onToast} subsidiaries={subsidiaries} />
      </Card>
      <Card title={locale === "en" ? "Bulk import" : "批量导入"}>
        <CsvImport locale={locale} onToast={onToast} />
      </Card>
      <Card title={locale === "en" ? "Recent imports" : "最近导入记录"}>
        {importBatches.length === 0 ? (
          <div className="py-2 text-[12.5px]" style={{ color: "var(--ink-400)" }}>
            {isZh ? "暂无导入记录" : "No imports yet"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.6px]">
              <thead>
                <tr className="text-left text-[11.3px] font-semibold" style={{ color: "var(--ink-400)" }}>
                  <th className="pb-2">{isZh ? "文件名" : "File"}</th>
                  <th className="pb-2 text-right">{isZh ? "成功行数" : "Rows"}</th>
                  <th className="pb-2">{isZh ? "操作人" : "By"}</th>
                  <th className="pb-2">{isZh ? "时间" : "Time"}</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {importBatches.map((b) => (
                  <tr key={b.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 font-semibold" style={{ color: "var(--ink-900)" }}>
                      {b.fileName}
                    </td>
                    <td className="tabular-nums py-2.5 text-right">{b.rowCount}</td>
                    <td className="py-2.5" style={{ color: "var(--ink-400)" }}>
                      {b.importedBy.name}
                    </td>
                    <td className="py-2.5" style={{ color: "var(--ink-400)" }}>
                      {new Date(b.createdAt).toLocaleString(isZh ? "zh-CN" : "en-US")}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => deleteImportBatch(b.id)}
                        disabled={deletingImportId === b.id}
                        className="rounded-lg px-2.5 py-1 text-[11.5px] font-bold disabled:opacity-50"
                        style={{ background: "var(--surface-2)", color: "var(--status-critical)" }}
                      >
                        {isZh ? "删除" : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

async function parseSpreadsheetToRows(file: File): Promise<string[][]> {
  const isExcel = /\.xlsx?$/i.test(file.name);
  if (isExcel) {
    const buf = await file.arrayBuffer();
    const workbook = XLSX.read(buf, { type: "array" });
    // Some exports bundle more than one sheet (e.g. a cover/notes sheet ahead of the actual
    // report). Picking by name used to only ever look for "P&L"/"profit", so every OTHER report
    // type (Balance Sheet, etc.) silently fell back to whichever sheet happened to be first —
    // which returned all-zero results when that wasn't the report data. The sheet with the most
    // rows is reliably the actual report, regardless of what any sheet is named.
    let best: string[][] = [];
    for (const name of workbook.SheetNames) {
      const parsed = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name], { header: 1, raw: false, defval: "" });
      if (parsed.length > best.length) best = parsed;
    }
    return best.map((r) => r.map((c) => String(c ?? "").trim()));
  }
  const text = await file.text();
  return text.split(/\r?\n/).map((l) => l.split(",").map((c) => c.trim()));
}

// Distinct from "" (the unselected placeholder) so the dropdown can tell "nothing chosen yet"
// apart from "deliberately chose Group HQ".
const HQ_OPTION_VALUE = "__group_hq__";

function PnlImport({
  locale,
  onToast,
  subsidiaries,
  expenseCategoryMappings,
}: {
  locale: Locale;
  onToast: (m: string) => void;
  subsidiaries: Subsidiary[];
  expenseCategoryMappings: ExpenseCategoryMapping[];
}) {
  const router = useRouter();
  const isZh = locale === "zh" || locale === "zh-Hant";
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ReturnType<typeof parsePnlReport> | null>(null);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [revenue, setRevenue] = useState("0");
  const [opCost, setOpCost] = useState("0");
  const [netProfit, setNetProfit] = useState("0");
  const [subsidiaryId, setSubsidiaryId] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [submitting, setSubmitting] = useState(false);
  // Per-line-item category choice for this import — seeded from the org's saved mapping (or the
  // narrow finance-keyword auto-suggestion) so a repeat import of the same chart of accounts
  // needs no reclassification; any change here is saved back to the mapping on submit.
  const [categoryByLabel, setCategoryByLabel] = useState<Record<string, ExpenseCategory | "">>({});

  const savedMapping = Object.fromEntries(expenseCategoryMappings.map((m) => [m.accountLabel, m.category as ExpenseCategory]));

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const rows = await parseSpreadsheetToRows(file);
      const result = parsePnlReport(rows);
      setParsed(result);
      setRawRows(rows);
      setRevenue(result.revenue.toFixed(2));
      setOpCost(result.costOfSales.toFixed(2));
      setNetProfit((result.netProfit ?? 0).toFixed(2));
      const initial: Record<string, ExpenseCategory | ""> = {};
      for (const item of result.expenseLineItems) {
        initial[item.label] = savedMapping[item.label] ?? suggestCategory(item.label) ?? "";
      }
      setCategoryByLabel(initial);
    } catch {
      setParsed(null);
      onToast(isZh ? "文件解析失败，请确认是有效的 CSV 或 Excel 文件" : "Couldn't parse this file — make sure it's a valid CSV or Excel file");
    }
  }

  const revenueNum = parseFloat(revenue) || 0;
  const opCostNum = parseFloat(opCost) || 0;
  const grossMarginPct = revenueNum > 0 ? ((revenueNum - opCostNum) / revenueNum) * 100 : 0;

  const confirmedMapping = Object.fromEntries(
    Object.entries(categoryByLabel).filter((entry): entry is [string, ExpenseCategory] => entry[1] !== "")
  );
  const categorized = parsed ? applyCategoryMapping(parsed.expenseLineItems, confirmedMapping) : null;

  async function confirmImport() {
    if (!subsidiaryId) {
      onToast(isZh ? "请选择子公司或集团总部" : "Please select a subsidiary or Group HQ");
      return;
    }
    // Sentinel value for "no subsidiary" — the group/HQ-level P&L. A blank subsidiaryKey tells
    // the import route to store this against organizationId only (see BankAccount.subsidiaryId).
    const isHq = subsidiaryId === HQ_OPTION_VALUE;
    const sub = isHq ? null : subsidiaries.find((s) => s.id === subsidiaryId);
    if (!isHq && !sub) return;
    setSubmitting(true);
    // Save any new/changed classifications so the next import of this chart of accounts is
    // already pre-filled — only entries that actually changed from what's already saved.
    const changedMappings = Object.entries(confirmedMapping)
      .filter(([label, category]) => savedMapping[label] !== category)
      .map(([accountLabel, category]) => ({ accountLabel, category }));
    if (changedMappings.length > 0) {
      await fetch("/api/admin/expense-category-mappings/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: changedMappings }),
      });
    }
    const res = await fetch("/api/admin/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "monthlyFinancial",
        fileName,
        rows: [
          {
            subsidiaryKey: sub?.key ?? "",
            year,
            month,
            revenue,
            netProfit,
            grossMarginPct: grossMarginPct.toFixed(2),
            opCost,
            sellExp: String(categorized?.sellExp ?? 0),
            adminExp: String(categorized?.adminExp ?? 0),
            rndExp: String(categorized?.rndExp ?? 0),
            financeExp: String(categorized?.financeExp ?? 0),
          },
        ],
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      const body = await res.json();
      if (body.successCount > 0) {
        onToast(isZh ? "已导入" : "Imported");
        setParsed(null);
        setFileName("");
        setCategoryByLabel({});
        router.refresh();
      } else {
        onToast(isZh ? `导入失败：${body.failed?.[0]?.error ?? "未知错误"}` : `Import failed: ${body.failed?.[0]?.error ?? "unknown error"}`);
      }
    } else {
      onToast(isZh ? "导入失败" : "Import failed");
    }
  }

  return (
    <div className="space-y-3.5">
      <div className="text-[11.8px]" style={{ color: "var(--ink-400)" }}>
        {isZh
          ? "适用于导出的利润表报告（如 Xero、MYOB ABSS 等常见格式：科目分类 + 明细行 + 小计），会自动识别营业收入、销售成本、净利润。目前仅支持单一期间（一整年或一个月）的报表，不支持按月分栏的报表。"
          : "For exported P&L reports (common Xero/MYOB ABSS-style layout: section headers + line items + subtotals) — automatically detects revenue, cost of sales, and net profit. Only single-period reports (one year or one month) are supported; reports with a separate column per month are not yet supported."}
      </div>

      <label
        className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center"
        style={{ borderColor: "var(--border-strong)" }}
      >
        <Database size={26} style={{ color: "var(--ink-400)" }} />
        <div className="text-[13px] font-bold" style={{ color: "var(--ink-900)" }}>
          {isZh ? "点击或拖拽利润表文件到此处上传" : "Click or drag a P&L report file here"}
        </div>
        <div className="text-[11.5px]" style={{ color: "var(--ink-400)" }}>
          {isZh ? "支持 .csv、.xlsx、.xls 文件" : ".csv, .xlsx and .xls supported"}
        </div>
        <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
      </label>

      {parsed && (
        <div className="space-y-3">
          <div className="text-[13px] font-bold" style={{ color: "var(--ink-900)" }}>
            {isZh ? "识别结果" : "Detected figures"} — {fileName}
          </div>
          {parsed.sectionsFound.length > 0 && (
            <div className="text-[11.5px]" style={{ color: "var(--ink-400)" }}>
              {isZh ? "识别到的科目分类：" : "Sections detected: "}
              {parsed.sectionsFound.join(", ")}
            </div>
          )}
          {parsed.usedComputedNetProfit && (
            <div className="rounded-lg px-3 py-2 text-[11.8px]" style={{ background: "color-mix(in srgb, var(--status-warning) 12%, transparent)", color: "var(--status-warning)" }}>
              {isZh ? "文件中没有明确的「Net Profit」行，净利润是自动算出来的，请核对。" : "No explicit \"Net Profit\" row was found — net profit was computed automatically, please double-check it."}
            </div>
          )}
          <details className="rounded-lg border px-3 py-2 text-[11.5px]" style={{ borderColor: "var(--border)" }}>
            <summary className="cursor-pointer font-semibold" style={{ color: "var(--ink-600)" }}>
              {isZh ? "调试：查看文件解析出的原始数据行（如果识别结果不对，可复制这里的内容发给开发者）" : "Debug: view the raw parsed rows (if the detected figures look wrong, copy this and share it)"}
            </summary>
            <textarea
              readOnly
              value={JSON.stringify(rawRows, null, 1)}
              className="mt-2 h-48 w-full rounded-lg border p-2 font-mono text-[10.5px]"
              style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
              onFocus={(e) => e.currentTarget.select()}
            />
          </details>

          {parsed.expenseLineItems.length > 0 && (
            <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
              <div className="text-[12.8px] font-bold" style={{ color: "var(--ink-900)" }}>
                {isZh ? "费用分类" : "Expense categorization"} ({parsed.expenseLineItems.length})
              </div>
              <div className="text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                {isZh
                  ? "为每个费用科目选择所属类别（会保存下来，下次导入自动带入）。未分类的科目金额不会计入销售/管理/研发/财务费用的合计，但不影响营业收入/成本/净利润这些数字。"
                  : "Pick a category for each real expense line item (saved for next time). Unclassified items aren't counted in the Selling/Admin/R&D/Finance totals, but don't affect revenue/cost/net profit."}
              </div>
              {categorized && categorized.unmapped.length > 0 && (
                <div className="rounded-lg px-3 py-2 text-[11.5px]" style={{ background: "color-mix(in srgb, var(--status-warning) 12%, transparent)", color: "var(--status-warning)" }}>
                  {isZh
                    ? `还有 ${categorized.unmapped.length} 项未分类，合计 ${categorized.unmapped.reduce((a, i) => a + i.value, 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : `${categorized.unmapped.length} item(s) still unclassified, totaling ${categorized.unmapped.reduce((a, i) => a + i.value, 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </div>
              )}
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold" style={{ color: "var(--ink-400)" }}>
                      <th className="pb-1.5">{isZh ? "费用科目" : "Account label"}</th>
                      <th className="pb-1.5 text-right">{isZh ? "金额" : "Amount"}</th>
                      <th className="pb-1.5">{isZh ? "分类" : "Category"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.expenseLineItems.map((item) => (
                      <tr key={item.label} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="py-1.5" style={{ color: "var(--ink-900)" }}>
                          {item.label}
                        </td>
                        <td className="tabular-nums py-1.5 text-right">{item.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="py-1.5">
                          <select
                            value={categoryByLabel[item.label] ?? ""}
                            onChange={(e) => setCategoryByLabel((prev) => ({ ...prev, [item.label]: e.target.value as ExpenseCategory | "" }))}
                            className="rounded-lg border px-2 py-1 text-[12px]"
                            style={{ borderColor: "var(--border)" }}
                          >
                            <option value="">{isZh ? "未分类" : "Unclassified"}</option>
                            <option value="SELLING">{isZh ? "销售费用" : "Selling"}</option>
                            <option value="ADMIN">{isZh ? "管理费用" : "Admin"}</option>
                            <option value="RND">{isZh ? "研发费用" : "R&D"}</option>
                            <option value="FINANCE">{isZh ? "财务费用" : "Finance"}</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-[12.5px]">
              <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
                {isZh ? "营业收入" : "Revenue"}
              </span>
              <input value={revenue} onChange={(e) => setRevenue(e.target.value)} className="rounded-lg border px-3 py-2 text-[12.8px]" style={{ borderColor: "var(--border)" }} />
            </label>
            <label className="flex flex-col gap-1 text-[12.5px]">
              <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
                {isZh ? "销售成本" : "Cost of sales"}
              </span>
              <input value={opCost} onChange={(e) => setOpCost(e.target.value)} className="rounded-lg border px-3 py-2 text-[12.8px]" style={{ borderColor: "var(--border)" }} />
            </label>
            <label className="flex flex-col gap-1 text-[12.5px]">
              <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
                {isZh ? "净利润" : "Net profit"}
              </span>
              <input value={netProfit} onChange={(e) => setNetProfit(e.target.value)} className="rounded-lg border px-3 py-2 text-[12.8px]" style={{ borderColor: "var(--border)" }} />
            </label>
            <label className="flex flex-col gap-1 text-[12.5px]">
              <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
                {isZh ? "毛利率 %（自动计算）" : "Gross margin % (computed)"}
              </span>
              <input value={grossMarginPct.toFixed(1)} disabled className="rounded-lg border px-3 py-2 text-[12.8px] opacity-60" style={{ borderColor: "var(--border)" }} />
            </label>
            <label className="flex flex-col gap-1 text-[12.5px]">
              <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
                {isZh ? "子公司" : "Subsidiary"}
              </span>
              <select value={subsidiaryId} onChange={(e) => setSubsidiaryId(e.target.value)} className="rounded-lg border px-3 py-2 text-[12.8px]" style={{ borderColor: "var(--border)" }}>
                <option value="">{isZh ? "请选择" : "Select…"}</option>
                <option value={HQ_OPTION_VALUE}>{isZh ? "集团总部" : "Group HQ"}</option>
                {subsidiaries.map((s) => (
                  <option key={s.id} value={s.id}>
                    {localizedName(s, locale)}
                  </option>
                ))}
              </select>
              <span className="text-[11px]" style={{ color: "var(--ink-400)" }}>
                {isZh
                  ? "如果这份报表是集团/总部层面的数据（例如 Xero 尚未接入或对接失败时的备用录入），请选择「集团总部」，无需绑定到某个子公司。"
                  : "If this report is at the group/HQ level (e.g. a fallback while Xero isn't connected or a sync fails), choose \"Group HQ\" — it doesn't need to be tied to a subsidiary."}
              </span>
              {subsidiaries.length === 0 && (
                <span className="text-[11px] font-semibold" style={{ color: "var(--status-warning)" }}>
                  {isZh ? "还没有子公司 — 请先到「组织架构管理」新增一个（哪怕只有一家主体，也要建一条记录）" : "No subsidiaries yet — add one under \"Org structure\" first (even a single-entity company needs one record)"}
                </span>
              )}
            </label>
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1 text-[12.5px]">
                <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
                  {isZh ? "年" : "Year"}
                </span>
                <input value={year} onChange={(e) => setYear(e.target.value)} className="rounded-lg border px-3 py-2 text-[12.8px]" style={{ borderColor: "var(--border)" }} />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-[12.5px]">
                <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
                  {isZh ? "月" : "Month"}
                </span>
                <input value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border px-3 py-2 text-[12.8px]" style={{ borderColor: "var(--border)" }} />
              </label>
            </div>
          </div>
          <p className="text-[11.5px]" style={{ color: "var(--ink-400)" }}>
            {isZh
              ? "如果这份报表是整年数据（如 FY 25-26），请把「年/月」设为这份报表所代表的期间；系统里的月度数据只能按单月存储，不会自动拆分成 12 个月。"
              : "If this report covers a full year (e.g. FY 25–26), set Year/Month to whichever period you want this figure attributed to — the system stores monthly data and won't automatically split an annual figure across 12 months."}
          </p>

          <button
            disabled={submitting}
            onClick={confirmImport}
            className="rounded-lg px-4 py-2 text-[12.8px] font-bold text-white disabled:opacity-50"
            style={{ background: "var(--cat-1)" }}
          >
            {submitting ? (isZh ? "导入中…" : "Importing…") : isZh ? "确认导入" : "Confirm import"}
          </button>
        </div>
      )}
    </div>
  );
}

function BalanceSheetImport({ locale, onToast, subsidiaries }: { locale: Locale; onToast: (m: string) => void; subsidiaries: Subsidiary[] }) {
  const router = useRouter();
  const isZh = locale === "zh" || locale === "zh-Hant";
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ReturnType<typeof parseBalanceSheetReport> | null>(null);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [totalAssets, setTotalAssets] = useState("0");
  const [totalLiabilities, setTotalLiabilities] = useState("0");
  const [totalEquity, setTotalEquity] = useState("0");
  const [subsidiaryId, setSubsidiaryId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const rows = await parseSpreadsheetToRows(file);
      const result = parseBalanceSheetReport(rows);
      setParsed(result);
      setRawRows(rows);
      setTotalAssets(result.totalAssets.toFixed(2));
      setTotalLiabilities(result.totalLiabilities.toFixed(2));
      setTotalEquity(result.totalEquity.toFixed(2));
    } catch {
      setParsed(null);
      onToast(isZh ? "文件解析失败，请确认是有效的 CSV 或 Excel 文件" : "Couldn't parse this file — make sure it's a valid CSV or Excel file");
    }
  }

  const assetsNum = parseFloat(totalAssets) || 0;
  const liabilitiesNum = parseFloat(totalLiabilities) || 0;
  const debtRatio = assetsNum > 0 ? (liabilitiesNum / assetsNum) * 100 : 0;

  async function confirmImport() {
    if (!subsidiaryId) {
      onToast(isZh ? "请选择子公司或集团总部" : "Please select a subsidiary or Group HQ");
      return;
    }
    const isHq = subsidiaryId === HQ_OPTION_VALUE;
    const sub = isHq ? null : subsidiaries.find((s) => s.id === subsidiaryId);
    if (!isHq && !sub) return;
    setSubmitting(true);
    const res = await fetch("/api/admin/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "balanceSheet",
        fileName,
        rows: [{ subsidiaryKey: sub?.key ?? "", totalAssets, totalLiabilities, totalEquity }],
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      const body = await res.json();
      if (body.successCount > 0) {
        onToast(isZh ? "已导入" : "Imported");
        setParsed(null);
        setFileName("");
        router.refresh();
      } else {
        onToast(isZh ? `导入失败：${body.failed?.[0]?.error ?? "未知错误"}` : `Import failed: ${body.failed?.[0]?.error ?? "unknown error"}`);
      }
    } else {
      onToast(isZh ? "导入失败" : "Import failed");
    }
  }

  return (
    <div className="space-y-3.5">
      <div className="text-[11.8px]" style={{ color: "var(--ink-400)" }}>
        {isZh
          ? "适用于导出的资产负债表报告（如 Xero、MYOB ABSS 等常见格式：科目分类 + 明细行 + 小计），会自动识别资产总额、负债总额、股东权益，并计算资产负债率。这是一个时点快照，不按年/月存储。"
          : "For exported Balance Sheet reports (common Xero/MYOB ABSS-style layout: section headers + line items + subtotals) — automatically detects total assets, total liabilities, and total equity, and computes the debt ratio. This is a point-in-time snapshot, not stored per year/month."}
      </div>

      <label
        className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center"
        style={{ borderColor: "var(--border-strong)" }}
      >
        <Database size={26} style={{ color: "var(--ink-400)" }} />
        <div className="text-[13px] font-bold" style={{ color: "var(--ink-900)" }}>
          {isZh ? "点击或拖拽资产负债表文件到此处上传" : "Click or drag a Balance Sheet file here"}
        </div>
        <div className="text-[11.5px]" style={{ color: "var(--ink-400)" }}>
          {isZh ? "支持 .csv、.xlsx、.xls 文件" : ".csv, .xlsx and .xls supported"}
        </div>
        <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
      </label>

      {parsed && (
        <div className="space-y-3">
          <div className="text-[13px] font-bold" style={{ color: "var(--ink-900)" }}>
            {isZh ? "识别结果" : "Detected figures"} — {fileName}
          </div>
          {parsed.sectionsFound.length > 0 && (
            <div className="text-[11.5px]" style={{ color: "var(--ink-400)" }}>
              {isZh ? "识别到的科目分类：" : "Sections detected: "}
              {parsed.sectionsFound.join(", ")}
            </div>
          )}
          <details className="rounded-lg border px-3 py-2 text-[11.5px]" style={{ borderColor: "var(--border)" }}>
            <summary className="cursor-pointer font-semibold" style={{ color: "var(--ink-600)" }}>
              {isZh ? "调试：查看文件解析出的原始数据行（如果识别结果不对，可复制这里的内容发给开发者）" : "Debug: view the raw parsed rows (if the detected figures look wrong, copy this and share it)"}
            </summary>
            <textarea
              readOnly
              value={JSON.stringify(rawRows, null, 1)}
              className="mt-2 h-48 w-full rounded-lg border p-2 font-mono text-[10.5px]"
              style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
              onFocus={(e) => e.currentTarget.select()}
            />
          </details>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-[12.5px]">
              <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
                {isZh ? "资产总额" : "Total assets"}
              </span>
              <input value={totalAssets} onChange={(e) => setTotalAssets(e.target.value)} className="rounded-lg border px-3 py-2 text-[12.8px]" style={{ borderColor: "var(--border)" }} />
            </label>
            <label className="flex flex-col gap-1 text-[12.5px]">
              <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
                {isZh ? "负债总额" : "Total liabilities"}
              </span>
              <input value={totalLiabilities} onChange={(e) => setTotalLiabilities(e.target.value)} className="rounded-lg border px-3 py-2 text-[12.8px]" style={{ borderColor: "var(--border)" }} />
            </label>
            <label className="flex flex-col gap-1 text-[12.5px]">
              <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
                {isZh ? "股东权益" : "Total equity"}
              </span>
              <input value={totalEquity} onChange={(e) => setTotalEquity(e.target.value)} className="rounded-lg border px-3 py-2 text-[12.8px]" style={{ borderColor: "var(--border)" }} />
            </label>
            <label className="flex flex-col gap-1 text-[12.5px]">
              <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
                {isZh ? "资产负债率 %（自动计算）" : "Debt ratio % (computed)"}
              </span>
              <input value={debtRatio.toFixed(1)} disabled className="rounded-lg border px-3 py-2 text-[12.8px] opacity-60" style={{ borderColor: "var(--border)" }} />
            </label>
            <label className="flex flex-col gap-1 text-[12.5px]">
              <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
                {isZh ? "子公司" : "Subsidiary"}
              </span>
              <select value={subsidiaryId} onChange={(e) => setSubsidiaryId(e.target.value)} className="rounded-lg border px-3 py-2 text-[12.8px]" style={{ borderColor: "var(--border)" }}>
                <option value="">{isZh ? "请选择" : "Select…"}</option>
                <option value={HQ_OPTION_VALUE}>{isZh ? "集团总部" : "Group HQ"}</option>
                {subsidiaries.map((s) => (
                  <option key={s.id} value={s.id}>
                    {localizedName(s, locale)}
                  </option>
                ))}
              </select>
              <span className="text-[11px]" style={{ color: "var(--ink-400)" }}>
                {isZh
                  ? "如果这份报表是集团/总部层面的数据（例如 Xero 尚未接入或对接失败时的备用录入），请选择「集团总部」，无需绑定到某个子公司。"
                  : "If this report is at the group/HQ level (e.g. a fallback while Xero isn't connected or a sync fails), choose \"Group HQ\" — it doesn't need to be tied to a subsidiary."}
              </span>
              {subsidiaries.length === 0 && (
                <span className="text-[11px] font-semibold" style={{ color: "var(--status-warning)" }}>
                  {isZh ? "还没有子公司 — 请先到「组织架构管理」新增一个（哪怕只有一家主体，也要建一条记录）" : "No subsidiaries yet — add one under \"Org structure\" first (even a single-entity company needs one record)"}
                </span>
              )}
            </label>
          </div>
          <p className="text-[11.5px]" style={{ color: "var(--ink-400)" }}>
            {isZh
              ? "这份数据会更新所选主体的「股东权益」与「资产负债率」为最新值（用于计算 ROE），并覆盖上一次的数值 — 不会按年/月保留历史记录。"
              : "This overwrites the selected entity's current \"equity\" and \"debt ratio\" (used to compute ROE) with these figures — it doesn't keep a year/month history."}
          </p>

          <button
            disabled={submitting}
            onClick={confirmImport}
            className="rounded-lg px-4 py-2 text-[12.8px] font-bold text-white disabled:opacity-50"
            style={{ background: "var(--cat-1)" }}
          >
            {submitting ? (isZh ? "导入中…" : "Importing…") : isZh ? "确认导入" : "Confirm import"}
          </button>
        </div>
      )}
    </div>
  );
}

// Rows are POSTed to the existing /api/admin/import "arCustomer"/"payable" pipeline in chunks
// rather than one request — a real Xero Aged Receivables export can carry thousands of contacts
// (Kingston's real file: 2475), and that route writes one row at a time via Prisma `create`, so
// a single request for the full set risks exceeding the serverless function's time limit. This
// reuses the exact same validated row shape/endpoint as the plain Bulk Import tool — no backend
// changes — just submits it in smaller pieces with a visible running total.
const AGING_IMPORT_CHUNK_SIZE = 250;

function SmartAgingImport({ kind, locale, onToast, subsidiaries }: { kind: "ar" | "ap"; locale: Locale; onToast: (m: string) => void; subsidiaries: Subsidiary[] }) {
  const router = useRouter();
  const isZh = locale === "zh" || locale === "zh-Hant";
  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [result, setResult] = useState<ReturnType<typeof parseAgingSummary> | null>(null);
  const [subsidiaryId, setSubsidiaryId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; success: number; failed: number } | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setProgress(null);
    try {
      const rows = await parseSpreadsheetToRows(file);
      setRawRows(rows);
      setResult(parseAgingSummary(rows));
    } catch {
      setResult(null);
      onToast(isZh ? "文件解析失败，请确认是有效的 CSV 或 Excel 文件" : "Couldn't parse this file — make sure it's a valid CSV or Excel file");
    }
  }

  async function confirmImport() {
    if (!result || result.contacts.length === 0) return;
    if (!subsidiaryId) {
      onToast(isZh ? "请选择子公司或集团总部" : "Please select a subsidiary or Group HQ");
      return;
    }
    const isHq = subsidiaryId === HQ_OPTION_VALUE;
    const sub = isHq ? null : subsidiaries.find((s) => s.id === subsidiaryId);
    if (!isHq && !sub) return;
    const subsidiaryKey = sub?.key ?? "";
    const type = kind === "ar" ? "arCustomer" : "payable";

    setSubmitting(true);
    let successTotal = 0;
    let failedTotal = 0;
    for (let i = 0; i < result.contacts.length; i += AGING_IMPORT_CHUNK_SIZE) {
      const chunk = result.contacts.slice(i, i + AGING_IMPORT_CHUNK_SIZE);
      const rows = chunk.map((c) => ({ nameZh: c.name, nameEn: c.name, subsidiaryKey, balance: String(c.balance), agingDays: String(c.agingDays), status: c.status }));
      try {
        const res = await fetch("/api/admin/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, fileName, rows }),
        });
        if (res.ok) {
          const body = await res.json();
          successTotal += body.successCount;
          failedTotal += body.failedCount;
        } else {
          failedTotal += chunk.length;
        }
      } catch {
        failedTotal += chunk.length;
      }
      setProgress({ done: Math.min(i + AGING_IMPORT_CHUNK_SIZE, result.contacts.length), total: result.contacts.length, success: successTotal, failed: failedTotal });
    }
    setSubmitting(false);
    onToast(isZh ? `导入完成：成功 ${successTotal} 条，失败 ${failedTotal} 条` : `Import complete: ${successTotal} succeeded, ${failedTotal} failed`);
    if (successTotal > 0) router.refresh();
  }

  const reportLabel = isZh ? (kind === "ar" ? "应收账龄汇总表" : "应付账龄汇总表") : kind === "ar" ? "Aged Receivables Summary" : "Aged Payables Summary";

  return (
    <div className="space-y-3.5">
      <div className="text-[11.8px]" style={{ color: "var(--ink-400)" }}>
        {isZh
          ? `适用于 Xero 导出的「${reportLabel}」报告（联系人 + 账龄分段列：Current / &lt;1 Month / 1 Month / 2 Months / 3 Months / Older）。会自动识别每个联系人的账龄分段并汇总为总余额，取其最旧的有余额分段作为账龄天数。系统内部按单一「账龄天数」字段存储（不保留完整的分段明细）。`
          : `For a Xero-exported "${reportLabel}" report (Contact + aging-bucket columns: Current / <1 Month / 1 Month / 2 Months / 3 Months / Older). Automatically detects each contact's buckets, sums them into a total balance, and uses the oldest bucket with a nonzero amount as the aging days figure. This system stores a single "aging days" field per contact, not the full bucket breakdown.`}
      </div>

      <label
        className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center"
        style={{ borderColor: "var(--border-strong)" }}
      >
        <Database size={26} style={{ color: "var(--ink-400)" }} />
        <div className="text-[13px] font-bold" style={{ color: "var(--ink-900)" }}>
          {isZh ? `点击或拖拽${reportLabel}文件到此处上传` : `Click or drag a ${reportLabel} file here`}
        </div>
        <div className="text-[11.5px]" style={{ color: "var(--ink-400)" }}>
          {isZh ? "支持 .csv、.xlsx、.xls 文件" : ".csv, .xlsx and .xls supported"}
        </div>
        <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
      </label>

      {result && (
        <div className="space-y-3">
          <div className="text-[13px] font-bold" style={{ color: "var(--ink-900)" }}>
            {isZh ? "识别结果" : "Detected"} — {fileName}
          </div>
          {result.headerRowIndex === null ? (
            <div className="rounded-lg px-3 py-2 text-[11.8px]" style={{ background: "color-mix(in srgb, var(--status-critical) 12%, transparent)", color: "var(--status-critical)" }}>
              {isZh ? "未能在文件中找到「Contact」表头行，请确认这是 Xero 导出的账龄汇总报告。" : "Couldn't find a \"Contact\" header row in this file — make sure it's a Xero-exported aging summary report."}
            </div>
          ) : (
            <>
              <div className="text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                {isZh ? "识别到的账龄分段：" : "Aging buckets detected: "}
                {result.bucketLabels.join(", ")} · {isZh ? "有余额的联系人" : "contacts with a balance"}: {result.contacts.length} · {isZh ? "合计余额" : "total balance"}:{" "}
                {result.contacts.reduce((a, c) => a + c.balance, 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              {result.unrecognizedBuckets.length > 0 && (
                <div className="rounded-lg px-3 py-2 text-[11.5px]" style={{ background: "color-mix(in srgb, var(--status-warning) 12%, transparent)", color: "var(--status-warning)" }}>
                  {isZh
                    ? `以下列名未能识别为标准账龄分段（其金额仍计入余额，但不影响账龄天数判定）：${result.unrecognizedBuckets.join(", ")}`
                    : `These column headers weren't recognized as standard aging buckets (their amounts are still included in the balance, but don't influence the aging-days figure): ${result.unrecognizedBuckets.join(", ")}`}
                </div>
              )}
              <details className="rounded-lg border px-3 py-2 text-[11.5px]" style={{ borderColor: "var(--border)" }}>
                <summary className="cursor-pointer font-semibold" style={{ color: "var(--ink-600)" }}>
                  {isZh ? `调试：查看前 50 行解析出的原始数据（共 ${rawRows.length} 行）` : `Debug: view the first 50 parsed rows (${rawRows.length} total)`}
                </summary>
                <textarea
                  readOnly
                  value={JSON.stringify(rawRows.slice(0, 50), null, 1)}
                  className="mt-2 h-48 w-full rounded-lg border p-2 font-mono text-[10.5px]"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </details>

              <label className="flex flex-col gap-1 text-[12.5px]">
                <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
                  {isZh ? "子公司" : "Subsidiary"}
                </span>
                <select value={subsidiaryId} onChange={(e) => setSubsidiaryId(e.target.value)} className="w-full max-w-xs rounded-lg border px-3 py-2 text-[12.8px]" style={{ borderColor: "var(--border)" }}>
                  <option value="">{isZh ? "请选择" : "Select…"}</option>
                  <option value={HQ_OPTION_VALUE}>{isZh ? "集团总部" : "Group HQ"}</option>
                  {subsidiaries.map((s) => (
                    <option key={s.id} value={s.id}>
                      {localizedName(s, locale)}
                    </option>
                  ))}
                </select>
                <span className="text-[11px]" style={{ color: "var(--ink-400)" }}>
                  {isZh
                    ? "这份报告中的所有联系人都会归属到这里选择的主体。如果这份报表是集团/总部层面的数据，请选择「集团总部」。"
                    : "Every contact in this report will be attributed to the entity chosen here. If this report is at the group/HQ level, choose \"Group HQ\"."}
                </span>
              </label>

              <button
                disabled={submitting || !subsidiaryId}
                onClick={confirmImport}
                className="rounded-lg px-4 py-2 text-[12.8px] font-bold text-white disabled:opacity-50"
                style={{ background: "var(--cat-1)" }}
              >
                {submitting ? (isZh ? "导入中…" : "Importing…") : isZh ? `确认导入 ${result.contacts.length} 条` : `Confirm import (${result.contacts.length})`}
              </button>

              {progress && (
                <div className="text-[11.8px]" style={{ color: "var(--ink-600)" }}>
                  {isZh
                    ? `进度：${progress.done} / ${progress.total} · 成功 ${progress.success} · 失败 ${progress.failed}`
                    : `Progress: ${progress.done} / ${progress.total} · succeeded ${progress.success} · failed ${progress.failed}`}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CsvImport({ locale, onToast }: { locale: Locale; onToast: (m: string) => void }) {
  const router = useRouter();
  const isZh = locale === "zh" || locale === "zh-Hant";
  const [variantKey, setVariantKey] = useState(IMPORT_VARIANTS[0].key);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ successCount: number; failedCount: number; failed: { row: number; error: string }[] } | null>(null);

  const config = findImportVariant(variantKey)!;
  const headers = rows?.[0] ?? [];
  const missingRequired = config.columns.filter((c) => c.required && !headers.some((h) => h.toLowerCase() === c.key.toLowerCase()));
  // The "Subsidiary" variant requires every row to actually name a subsidiary — otherwise it
  // would silently fall through to Group HQ via the same blank-cell convention the "Group HQ"
  // variant relies on, defeating the point of picking an explicit scope.
  const subKeyIdx = headers.findIndex((h) => h.toLowerCase() === "subsidiarykey");
  const blankSubsidiaryRows =
    config.scope === "subsidiary" && subKeyIdx >= 0
      ? (rows ?? [])
          .slice(1)
          .map((r, i) => ({ row: i + 2, val: r[subKeyIdx] }))
          .filter((r) => !r.val || !r.val.trim())
          .map((r) => r.row)
      : [];

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const isExcel = /\.xlsx?$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (isExcel) {
          const workbook = XLSX.read(reader.result, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const parsed = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
          setRows(parsed.map((r) => r.map((c) => String(c ?? "").trim())).filter((r) => r.some((c) => c.length > 0)));
        } else {
          const text = String(reader.result || "");
          const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
          setRows(lines.map(parseCsvLine));
        }
      } catch {
        setRows(null);
        onToast(isZh ? "文件解析失败，请确认是有效的 CSV 或 Excel 文件" : "Couldn't parse this file — make sure it's a valid CSV or Excel file");
      }
    };
    if (isExcel) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  }

  function downloadTemplate() {
    const header = config.columns.map((c) => c.key).join(",");
    const example = config.columns.map((c) => c.example).join(",");
    const blob = new Blob([`${header}\n${example}\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.key.replace(":", "_")}_template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function confirmImport() {
    if (!rows || missingRequired.length > 0 || blankSubsidiaryRows.length > 0) return;
    setSubmitting(true);
    const [header, ...dataLines] = rows;
    const records = dataLines.map((line) => {
      const rec = Object.fromEntries(header.map((h, i) => [h, line[i] ?? ""]));
      // Group HQ variant: force every row to Group HQ regardless of what a pasted-in file might
      // still contain in a stray subsidiaryKey column — the whole point of picking this variant
      // is that the user shouldn't have to think about that column at all.
      if (config.scope === "hq") rec.subsidiaryKey = "";
      return rec;
    });
    const res = await fetch("/api/admin/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: config.id, fileName, rows: records }),
    });
    setSubmitting(false);
    if (res.ok) {
      const body = await res.json();
      setResult(body);
      if (body.successCount > 0) {
        onToast(isZh ? `成功导入 ${body.successCount} 行` : `Imported ${body.successCount} rows`);
        router.refresh();
      }
    } else {
      onToast(isZh ? "导入失败，请检查文件格式" : "Import failed — check the file format");
    }
  }

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[12.5px]">
          <span className="font-semibold" style={{ color: "var(--ink-600)" }}>
            {isZh ? "导入类型" : "Import type"}
          </span>
          <select
            value={variantKey}
            onChange={(e) => {
              setVariantKey(e.target.value);
              setRows(null);
              setResult(null);
            }}
            className="rounded-lg border px-3 py-2 text-[12.8px]"
            style={{ borderColor: "var(--border)" }}
          >
            {IMPORT_VARIANTS.map((v) => (
              <option key={v.key} value={v.key}>
                {isZh ? v.labelZh : v.labelEn}
              </option>
            ))}
          </select>
        </label>
        <button onClick={downloadTemplate} className="rounded-lg border px-3.5 py-2 text-[12.5px] font-bold" style={{ borderColor: "var(--border-strong)", color: "var(--ink-900)" }}>
          {isZh ? "下载模板" : "Download template"}
        </button>
      </div>
      {config.scope === "hq" && (
        <div className="rounded-lg px-3 py-2 text-[11.8px]" style={{ background: "color-mix(in srgb, var(--cat-1) 10%, transparent)", color: "var(--ink-600)" }}>
          {isZh ? "本次导入的所有行将记录为集团总部层面的数据，不归属任何子公司。" : "Every row in this import will be recorded at the Group HQ level, not tied to any subsidiary."}
        </div>
      )}
      <div className="text-[11.8px]" style={{ color: "var(--ink-400)" }}>
        {isZh ? "必填列：" : "Required columns: "}
        {config.columns
          .filter((c) => c.required)
          .map((c) => c.key)
          .join(", ")}
      </div>

      <label
        className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center"
        style={{ borderColor: "var(--border-strong)" }}
      >
        <Database size={26} style={{ color: "var(--ink-400)" }} />
        <div className="text-[13px] font-bold" style={{ color: "var(--ink-900)" }}>
          {locale === "en" ? "Click or drag a file here to upload" : "点击或拖拽文件到此处上传"}
        </div>
        <div className="text-[11.5px]" style={{ color: "var(--ink-400)" }}>
          {locale === "en" ? ".csv, .xlsx and .xls supported — parsed locally in your browser" : "支持 .csv、.xlsx、.xls 文件,将在浏览器本地解析预览"}
        </div>
        <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
      </label>

      {rows && rows.length > 0 && (
        <div>
          <div className="mb-2 text-[13px] font-bold" style={{ color: "var(--ink-900)" }}>
            {locale === "en" ? "Import Preview" : "导入预览"} — {fileName} ({rows.length - 1} {locale === "en" ? "rows" : "行"})
          </div>
          {missingRequired.length > 0 && (
            <div className="mb-3 rounded-lg px-3 py-2 text-[11.8px]" style={{ background: "color-mix(in srgb, var(--status-critical) 12%, transparent)", color: "var(--status-critical)" }}>
              {isZh ? "缺少必填列：" : "Missing required columns: "}
              {missingRequired.map((c) => c.key).join(", ")}
            </div>
          )}
          {blankSubsidiaryRows.length > 0 && (
            <div className="mb-3 rounded-lg px-3 py-2 text-[11.8px]" style={{ background: "color-mix(in srgb, var(--status-critical) 12%, transparent)", color: "var(--status-critical)" }}>
              {isZh
                ? `已选择「子公司」类型，但以下行未指定子公司代码：第 ${blankSubsidiaryRows.join("、")} 行。请填写子公司代码，或改用「集团总部」类型。`
                : `"Subsidiary" is selected, but these rows have no subsidiary code: row ${blankSubsidiaryRows.join(", ")}. Fill in a subsidiary code, or switch to the "Group HQ" variant instead.`}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr>
                  {rows[0].map((h, i) => (
                    <th key={i} className="border-b pb-1.5 text-left font-semibold" style={{ borderColor: "var(--border-strong)", color: "var(--ink-400)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(1, 11).map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, ci) => (
                      <td key={ci} className="border-b py-1.5" style={{ borderColor: "var(--border)", color: "var(--ink-400)" }}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            disabled={submitting || missingRequired.length > 0 || blankSubsidiaryRows.length > 0}
            onClick={confirmImport}
            className="mt-3.5 rounded-lg px-4 py-2 text-[12.8px] font-bold text-white disabled:opacity-50"
            style={{ background: "var(--cat-1)" }}
          >
            {submitting ? (isZh ? "导入中…" : "Importing…") : locale === "en" ? "Confirm import" : "确认导入"}
          </button>

          {result && (
            <div className="mt-3.5 space-y-2">
              <div className="text-[12.5px]" style={{ color: "var(--ink-600)" }}>
                {isZh
                  ? `成功 ${result.successCount} 行，失败 ${result.failedCount} 行`
                  : `${result.successCount} succeeded, ${result.failedCount} failed`}
              </div>
              {result.failed.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-lg border text-[11.8px]" style={{ borderColor: "var(--border)" }}>
                  {result.failed.map((f, i) => (
                    <div key={i} className="border-t px-3 py-1.5 first:border-t-0" style={{ borderColor: "var(--border)", color: "var(--status-critical)" }}>
                      {isZh ? `第 ${f.row} 行` : `Row ${f.row}`}：{f.error}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LangTab({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function setLocale(l: string) {
    setPending(true);
    await fetch("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: l }),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <Card title={locale === "en" ? "Choose Interface Language" : "选择界面语言"}>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {LOCALES.map((l) => {
          const active = locale === l;
          return (
            <button
              key={l}
              disabled={pending}
              onClick={() => setLocale(l)}
              className="rounded-xl border p-3.5 text-left disabled:opacity-60"
              style={{
                borderColor: active ? "var(--cat-1)" : "var(--border-strong)",
                background: active ? "color-mix(in srgb, var(--cat-1) 6%, transparent)" : "transparent",
              }}
            >
              <div className="text-[14.5px] font-bold" style={{ color: "var(--ink-900)" }}>
                {LOCALE_LABELS[l]}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
