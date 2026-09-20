import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { readSessionFromCookies } from "@/lib/session";

export const verifySession = cache(async () => {
  const session = await readSessionFromCookies();
  if (!session?.userId) return null;
  return { userId: session.userId as string };
});

export const getCurrentUser = cache(async () => {
  const session = await verifySession();
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: { subsidiary: true },
  });

  if (!user || user.status !== "ACTIVE") return null;
  return user;
});

export const requireUser = cache(async () => {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
});

export const requireAdmin = cache(async () => {
  const user = await requireUser();
  if (user.role !== "ADMIN" && user.role !== "DIRECTOR") redirect("/overview");
  return user;
});

export function canApprove(role: string) {
  return role === "ADMIN" || role === "DIRECTOR";
}
