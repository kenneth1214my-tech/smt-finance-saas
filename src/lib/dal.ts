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

// Company accounts reachable from this session without signing in again (same e-mail + password at login).
export const getLinkedCompanies = cache(async () => {
  const session = await readSessionFromCookies();
  if (!session?.userId) return [];
  const ids = [...new Set([session.userId as string, ...(Array.isArray(session.linked) ? session.linked : [])])];
  if (ids.length < 2) return [];
  const rows = await db.user.findMany({ where: { id: { in: ids }, status: "ACTIVE" }, include: { organization: { select: { name: true, jurisdiction: true } } } });
  return rows
    .map((u) => ({ userId: u.id, company: u.organization.name, jurisdiction: u.organization.jurisdiction, role: u.role, current: u.id === session.userId }))
    .sort((a, b) => a.company.localeCompare(b.company));
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
