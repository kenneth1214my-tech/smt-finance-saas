import "server-only";
import { Resend } from "resend";

const FROM_ADDRESS = "noreply@gaumga.com";

function getClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is missing. Set it in .env.");
  return new Resend(apiKey);
}

export async function sendPasswordResetEmail(to: string, resetUrl: string, isZh: boolean) {
  const resend = getClient();
  const subject = isZh ? "重置密码 - 财务分析平台" : "Reset your password - Finance Platform";
  const html = isZh
    ? `<p>我们收到了重置你账号密码的请求。</p>
       <p><a href="${resetUrl}">点击此处重置密码</a></p>
       <p>此链接 1 小时内有效。如果不是你本人操作，请忽略此邮件。</p>`
    : `<p>We received a request to reset your account password.</p>
       <p><a href="${resetUrl}">Click here to reset your password</a></p>
       <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>`;

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
  });
  if (error) throw new Error(`Failed to send password reset email: ${error.message}`);
}
