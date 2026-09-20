import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary } from "@/lib/i18n/dictionaries";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/overview");

  const locale = await getServerLocale();
  const dict = getDictionary(locale);

  return <LoginForm dict={dict} locale={locale} />;
}
