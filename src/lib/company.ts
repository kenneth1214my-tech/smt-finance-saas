import "server-only";
import { db } from "@/lib/db";

export async function getCompanyName(organizationId: string): Promise<string> {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  return org.name;
}

export async function setCompanyName(organizationId: string, name: string) {
  return db.organization.update({ where: { id: organizationId }, data: { name } });
}

export function generateInviteCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export async function findOrganizationByInviteCode(code: string) {
  return db.organization.findUnique({ where: { inviteCode: code.trim().toUpperCase() } });
}
