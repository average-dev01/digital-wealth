/**
 * Transactional email (password reset) via Resend's HTTP API.
 *
 * Deliberately NOT SMTP: Railway (like most container PaaS  Vercel, Render,
 * etc.) blocks outbound SMTP ports (25/465/587) to prevent abuse, so a
 * nodemailer SMTP transport times out in production even with valid
 * credentials. The HTTP API is a plain HTTPS call, which is never blocked.
 *
 * - Falls back to logging the link to the console when `RESEND_API_KEY` is
 *   unset, or under test  same "no-op under test" idiom as `priceFeed.ts`, so
 *   local dev needs no Resend account and vitest never makes a network call.
 * - Resend's free tier only delivers to the account owner's own address until
 *   a sending domain is verified in the Resend dashboard  see
 *   docs/RAILWAY_DEPLOY.md.
 */
import { Resend } from "resend";

const isTest = process.env.NODE_ENV === "test" || process.env.VITEST !== undefined;

let resend: Resend | null = null;

function getResend(): Resend {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

if (!isTest && process.env.NODE_ENV === "production" && !process.env.RESEND_API_KEY) {
  console.error(
    "[mailer] RESEND_API_KEY is not set in production  password reset emails will not be delivered.",
  );
}

function resetPasswordEmailHtml(resetUrl: string): string {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; background: #0b1622; padding: 32px; color: #e6ebf2;">
      <div style="max-width: 480px; margin: 0 auto; background: #101f30; border-radius: 8px; padding: 32px;">
        <h1 style="color: #d4af37; font-size: 20px; margin: 0 0 16px;">Digital Wealth Partners</h1>
        <p style="margin: 0 0 16px; line-height: 1.5;">
          We received a request to reset your password. Click the button below to
          choose a new one. This link expires in 1 hour.
        </p>
        <p style="margin: 0 0 24px;">
          <a href="${resetUrl}"
             style="display: inline-block; background: #d4af37; color: #0b1622; text-decoration: none;
                    padding: 12px 24px; border-radius: 6px; font-weight: bold;">
            Reset your password
          </a>
        </p>
        <p style="margin: 0; font-size: 13px; color: #9aa7b8; line-height: 1.5;">
          If you didn't request this, you can safely ignore this email  your
          password will not be changed.
        </p>
      </div>
    </div>
  `;
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  if (isTest || !process.env.RESEND_API_KEY) {
    console.log(`[auth] Password reset link for ${to}: ${resetUrl}`);
    return;
  }

  try {
    const { error } = await getResend().emails.send({
      from: process.env.EMAIL_FROM ?? "Digital Wealth Partners <onboarding@resend.dev>",
      to,
      subject: "Reset your Digital Wealth Partners password",
      text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
      html: resetPasswordEmailHtml(resetUrl),
    });
    if (error) {
      console.error(`[mailer] Failed to send password reset email to ${to}: ${error.message}`);
    }
  } catch (err) {
    console.error(
      `[mailer] Failed to send password reset email to ${to}: ${err instanceof Error ? err.message : err}`,
    );
  }
}
