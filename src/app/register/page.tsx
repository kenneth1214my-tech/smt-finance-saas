import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary } from "@/lib/i18n/dictionaries";
import RegisterForm from "./RegisterForm";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/overview");

  const locale = await getServerLocale();
  const dict = getDictionary(locale);

  return <RegisterForm dict={dict} locale={locale} />;
}
