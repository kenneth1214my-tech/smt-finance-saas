import { Clock } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import GlobalSearch from "@/components/GlobalSearch";
import UserMenu from "@/components/UserMenu";
import { getLastDataUpdate } from "@/lib/lastUpdate";
import type { Locale, DICTIONARIES } from "@/lib/i18n/dictionaries";

type Dict = (typeof DICTIONARIES)[Locale];
type Role = "ADMIN" | "DIRECTOR" | "FINANCE" | "MANAGER" | "VIEWER";

function formatUpdateTime(d: Date, locale: Locale) {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (locale === "en") return d.toISOString().slice(0, 16).replace("T", " ");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function Topbar({
  dict,
  locale,
  title,
  desc,
  user,
}: {
  dict: Dict;
  locale: Locale;
  title: string;
  desc?: string;
  user: { name: string; email: string; role: Role; organizationId: string };
}) {
  const lastUpdate = await getLastDataUpdate(user.organizationId);
  return (
    <div
      className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b px-[26px] py-[14px] backdrop-blur"
      style={{ background: "color-mix(in srgb, var(--bg) 88%, transparent)", borderColor: "var(--border)" }}
    >
      <div className="min-w-[200px]">
        <div className="text-[19px] font-bold" style={{ color: "var(--ink-900)" }}>
          {title}
        </div>
        {desc && (
          <div className="text-xs" style={{ color: "var(--ink-400)" }}>
            {desc}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <GlobalSearch isZh={locale === "zh" || locale === "zh-Hant"} />
        <LanguageSwitcher current={locale} />
        <div className="flex items-center gap-1.5 whitespace-nowrap px-1 text-[11.5px]" style={{ color: "var(--ink-400)" }}>
          <Clock size={13} />
          {dict.common.updateTime}: {lastUpdate ? formatUpdateTime(lastUpdate, locale) : locale === "en" ? "No data yet" : "暂无数据"}
        </div>
        <UserMenu dict={dict} name={user.name} email={user.email} role={user.role} />
      </div>
    </div>
  );
}
