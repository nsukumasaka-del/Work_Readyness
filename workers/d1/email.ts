/**
 * Transactional email for Cloudflare Workers (Resend HTTP API only).
 * Edge-safe: uses fetch — no SMTP / Nodemailer / TCP sockets.
 *
 * Secrets (wrangler):
 *   RESEND_API_KEY
 *   EMAIL_FROM   e.g. BonList <noreply@your-verified-domain.com>
 *
 * Vars:
 *   AUTH_ALLOW_DEV_OTP=true → return codes in API JSON when Resend is unset (local only)
 */

export type MailEnv = {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  AUTH_ALLOW_DEV_OTP?: string;
  APP_BASE_URL?: string;
};

export type SendResult = {
  sent: boolean;
  provider: "resend" | "none";
  devCode?: string;
};

function allowDevOtp(env: MailEnv): boolean {
  const flag = String(env.AUTH_ALLOW_DEV_OTP || "")
    .trim()
    .toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

function fromAddress(env: MailEnv): string {
  return env.EMAIL_FROM?.trim() || "BonList <onboarding@resend.dev>";
}

const RESEND_FALLBACK_FROM = "BonList <onboarding@resend.dev>";

export function isEmailDeliveryConfigured(env: MailEnv): boolean {
  return Boolean(env.RESEND_API_KEY?.trim());
}

async function sendResend(
  env: MailEnv,
  input: { to: string; subject: string; text: string; html: string },
): Promise<boolean> {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.error("[bonlist-email] CRITICAL: RESEND_API_KEY is not configured on this Worker.");
    return false;
  }

  const sendFrom = (from: string) => fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text, html: input.html }),
  });

  const configuredFrom = fromAddress(env);
  let response = await sendFrom(configuredFrom);
  if (!response.ok) {
    let detail = await response.text().catch(() => "");
    const senderNotVerified = /(domain|from address).*(not verified|verification|verified|verify)|not verified.*(domain|from address)/i.test(detail);
    if (configuredFrom !== RESEND_FALLBACK_FROM && senderNotVerified) {
      console.warn("[bonlist-email] Configured sender is not verified; retrying with Resend's onboarding sender.");
      response = await sendFrom(RESEND_FALLBACK_FROM);
      if (!response.ok) detail = await response.text().catch(() => "");
    }
    if (!response.ok) throw new Error(`Resend failed (${response.status}): ${detail.slice(0, 200)}`);
  }
  return true;
}

async function deliver(
  env: MailEnv,
  input: { to: string; subject: string; text: string; html: string },
): Promise<SendResult> {
  if (await sendResend(env, input)) {
    return { sent: true, provider: "resend" };
  }
  return { sent: false, provider: "none" };
}

export async function sendSignupOtpEmail(
  env: MailEnv,
  to: string,
  code: string,
): Promise<SendResult> {
  const subject = "Your BonList verification code";
  const text = `Your BonList verification code is ${code}. It expires in 15 minutes. If you did not sign up, ignore this email.`;
  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a">
      <h2 style="margin:0 0 12px">Verify your BonList email</h2>
      <p>Use this code to finish creating your account:</p>
      <p style="font-size:28px;letter-spacing:6px;font-weight:700">${code}</p>
      <p style="color:#64748b;font-size:14px">Expires in 15 minutes. If you did not sign up for BonList, you can ignore this email.</p>
    </div>
  `;

  try {
    const result = await deliver(env, { to, subject, text, html });
    if (result.sent) return result;
  } catch (err) {
    console.error("[bonlist-email] signup otp failed", err);
    if (!allowDevOtp(env)) throw err;
  }

  if (allowDevOtp(env)) {
    return { sent: false, provider: "none", devCode: code };
  }
  throw new Error(
    "Email delivery is not configured. Set Worker secrets RESEND_API_KEY and EMAIL_FROM (verified domain in Resend).",
  );
}

export async function sendPasswordResetEmail(
  env: MailEnv,
  to: string,
  resetUrl: string,
): Promise<SendResult> {
  const subject = "Reset your BonList password";
  const text = `Reset your BonList password using this link (expires in 1 hour):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`;
  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a">
      <h2 style="margin:0 0 12px">Reset your password</h2>
      <p>We received a request to reset your BonList password.</p>
      <p><a href="${resetUrl}" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Choose a new password</a></p>
      <p style="color:#64748b;font-size:14px">This link expires in 1 hour. If you did not request a reset, you can ignore this email.</p>
    </div>
  `;

  try {
    const result = await deliver(env, { to, subject, text, html });
    if (result.sent) return result;
  } catch (err) {
    console.error("[bonlist-email] password reset failed", err);
    if (!allowDevOtp(env)) throw err;
  }

  if (allowDevOtp(env)) {
    return { sent: false, provider: "none", devCode: resetUrl };
  }
  throw new Error(
    "Email delivery is not configured. Set Worker secrets RESEND_API_KEY and EMAIL_FROM.",
  );
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0] || "*"}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}
