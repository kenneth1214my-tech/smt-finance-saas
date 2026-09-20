"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  CircleDollarSign,
  Wallet,
  Landmark,
  FileSpreadsheet,
  Receipt,
  Building2,
  MapPin,
  ClipboardList,
  ShieldAlert,
  FileText,
  ClipboardCheck,
  Settings as SettingsIcon,
} from "lucide-react";
import type { Locale, DICTIONARIES } from "@/lib/i18n/dictionaries";

type Dict = (typeof DICTIONARIES)[Locale];

const NAV = [
  { id: "overview", href: "/overview", icon: LayoutDashboard },
  { id: "ops", href: "/ops", icon: TrendingUp },
  { id: "profit", href: "/profit", icon: CircleDollarSign },
  { id: "budget", href: "/budget", icon: Wallet },
  { id: "fund", href: "/fund", icon: Landmark },
  { id: "ar", href: "/ar", icon: FileSpreadsheet },
  { id: "ap", href: "/ap", icon: Receipt },
  { id: "sub", href: "/sub", icon: Building2 },
  { id: "region", href: "/region", icon: MapPin },
  { id: "project", href: "/project", icon: ClipboardList },
  { id: "risk", href: "/risk", icon: ShieldAlert },
  { id: "report", href: "/report", icon: FileText },
  { id: "audit", href: "/audit", icon: ClipboardCheck },
] as const;

export default function Sidebar({ dict, companyName }: { dict: Dict; companyName: string }) {
  const pathname = usePathname();

  return (
    <aside
      className="sticky top-0 flex h-screen w-[236px] shrink-0 flex-col border-r"
      style={{
        background: "linear-gradient(180deg, var(--side-bg-2), var(--side-bg) 40%)",
        borderColor: "var(--side-border)",
        color: "var(--side-text)",
      }}
    >
      <div className="flex items-center gap-2.5 border-b px-[18px] py-5" style={{ borderColor: "var(--side-border)" }}>
        <Image src="/logo.png" alt="SMT" width={34} height={34} className="h-[34px] w-[34px] shrink-0 rounded-[9px] object-cover" />
        <div>
          <div className="text-[14.5px] font-bold tracking-tight" style={{ color: "#f3fbf7" }}>
            {dict.appName}
          </div>
          <div className="mt-px text-[10.5px] tracking-wide" style={{ color: "var(--side-text-dim)" }}>
            {dict.tagline}
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2.5">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.id}
              href={item.href}
              className="relative mb-0.5 flex items-center gap-2.5 rounded-[9px] px-[11px] py-[9px] text-[13.3px] font-medium"
              style={{
                background: active ? "var(--side-active)" : "transparent",
                color: active ? "#fff" : "var(--side-text-dim)",
              }}
            >
              {active && (
                <span
                  className="absolute -left-2.5 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-r-[3px]"
                  style={{ background: "var(--side-accent)" }}
                />
              )}
              <Icon size={16} className="shrink-0 opacity-90" />
              <span className="flex-1 truncate">{dict.nav[item.id]}</span>
            </Link>
          );
        })}
        <div className="my-2 h-px" style={{ background: "var(--side-border)" }} />
        <Link
          href="/settings"
          className="flex items-center gap-2.5 rounded-[9px] px-[11px] py-[9px] text-[13.3px] font-medium"
          style={{
            background: pathname?.startsWith("/settings") ? "var(--side-active)" : "transparent",
            color: pathname?.startsWith("/settings") ? "#fff" : "var(--side-text-dim)",
          }}
        >
          <SettingsIcon size={16} className="shrink-0 opacity-90" />
          <span className="flex-1 truncate">{dict.nav.settings}</span>
        </Link>
      </nav>

      <div className="border-t px-4 py-4 text-[11px]" style={{ borderColor: "var(--side-border)", color: "var(--side-text-dim)" }}>
        {companyName}
      </div>
    </aside>
  );
}
