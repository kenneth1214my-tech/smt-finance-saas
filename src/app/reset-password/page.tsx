import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary } from "@/lib/i18n/dictionaries";
import ResetPasswordForm from "./ResetPasswordForm";

export default async function ResetPasswordPage(props: PageProps<"/reset-password">) {
  const user = await getCurrentUser();
  if (user) redirect("/overview");

  const searchParams = await props.searchParams;
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  const locale = await getServerLocale();
  const dict = getDictionary(locale);

  return <ResetPasswordForm dict={dict} locale={locale} token={token} />;
}
