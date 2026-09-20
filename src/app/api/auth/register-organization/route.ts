import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createSessionCookie } from "@/lib/session";
import { createOrganizationSchema } from "@/lib/validation";
import { generateInviteCode } from "@/lib/company";
import { rateLimit, clientKeyFromRequest } from "@/lib/rateLimit";

export async function POST(req: Request) {
  const ip = clientKeyFromRequest(req);
  const limit = rateLimit(`register-org-ip:${ip}`, 10, 60 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });

  const raw = await req.json().catch(() => null);
  const parsed = createOrganizationSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { companyName, name, email, password } = parsed.data;

  const emailLower = email.toLowerCase();
  const existingUser = await db.user.findUnique({ where: { email: emailLower } });
  if (existingUser) return NextResponse.json({ error: "email_taken" }, { status: 409 });

  const passwordHash = await hashPassword(password);

  // Retry on the astronomically rare invite-code collision rather than failing the signup.
  let user;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      user = await db.$transaction(async (tx) => {
        const org = await tx.organization.create({ data: { name: companyName, inviteCode: generateInviteCode() } });
        return tx.user.create({ data: { organizationId: org.id, name, email: emailLower, passwordHash, role: "ADMIN", status: "ACTIVE" } });
      });
      break;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code !== "P2002" || attempt === 4) throw err;
    }
  }
  if (!user) return NextResponse.json({ error: "server_error" }, { status: 500 });

  await createSessionCookie(user.id);
  return NextResponse.json({ ok: true });
}
