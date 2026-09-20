import type { Metadata } from "next";
import { Noto_Sans_SC } from "next/font/google";
import { getServerLocale } from "@/lib/i18n/locale";
import "./globals.css";

const notoSansSC = Noto_Sans_SC({
  variable: "--font-noto-sans-sc",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
});

export const metadata: Metadata = {
  title: "财务分析平台",
  description: "Group finance analysis platform",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getServerLocale();

  return (
    <html lang={locale} className={`${notoSansSC.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col" style={{ fontFamily: "var(--font-noto-sans-sc), sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
