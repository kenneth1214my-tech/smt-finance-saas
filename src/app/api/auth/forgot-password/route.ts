import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { forgotPasswordSchema } from "@/lib/validation";
import { sendPasswordResetEmail } from "@/lib/email";
import { rateLimit, clientKeyFromRequest } from "@/lib/rateLimit";
import { getServerLocale } from "@/lib/i18n/locale";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: Request) {
  const ip = clientKeyFromRequest(req);
  const limit = rateLimit(`forgot-password-ip:${ip}`, 10, 60 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });

  const raw = await req.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const email = parsed.data.email.toLowerCase();
  const emailLimit = rateLimit(`forgot-password-email:${email}`, 5, 60 * 60 * 1000);
  if (!emailLimit.ok) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });

  // Always respond ok regardless of whether the email exists — don't let this endpoint be
  // used to enumerate registered accounts.
  const user = await db.user.findUnique({ where: { email } });
  if (user && user.status === "ACTIVE") {
    const token = crypto.randomBytes(32).toString("hex");
    await db.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
    });
    const origin = new URL(req.url).origin;
    const resetUrl = `${origin}/reset-password?token=${token}`;
    const locale = await getServerLocale();
    const isZh = locale === "zh" || locale === "zh-Hant";
    try {
      await sendPasswordResetEmail(user.email, resetUrl, isZh);
    } catch (err) {
      console.error("sendPasswordResetEmail failed", err);
    }
  }

  return NextResponse.json({ ok: true });
}
