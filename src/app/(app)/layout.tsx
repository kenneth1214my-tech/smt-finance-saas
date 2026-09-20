import { requireUser } from "@/lib/dal";
import Sidebar from "@/components/Sidebar";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getCompanyName } from "@/lib/company";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const locale = await getServerLocale();
  const dict = getDictionary(locale);
  const companyName = await getCompanyName(user.organizationId);

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
      <Sidebar dict={dict} companyName={companyName} />
      <main className="flex min-w-0 flex-1 flex-col">
        {children}
        <footer className="px-[26px] py-4 text-center text-[11px]" style={{ color: "var(--ink-400)" }}>
          © smt-finance. All rights reserved
        </footer>
      </main>
    </div>
  );
}
