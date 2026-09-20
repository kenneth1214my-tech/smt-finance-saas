import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary } from "@/lib/i18n/dictionaries";
import ForgotPasswordForm from "./ForgotPasswordForm";

export default async function ForgotPasswordPage() {
  const user = await getCurrentUser();
  if (user) redirect("/overview");

  const locale = await getServerLocale();
  const dict = getDictionary(locale);

  return <ForgotPasswordForm dict={dict} locale={locale} />;
}
