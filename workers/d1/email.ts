/**
 * Transactional email for Cloudflare Workers.
 * Prefer Resend (RESEND_API_KEY). Fallback: POST to Render SMTP bridge
 * (`API_UPSTREAM_URL` + `INTERNAL_EMAIL_SECRET`).
 * Dev: AUTH_ALLOW_DEV_OTP=true returns codes in API JSON when email isn't configured.
 */

export type MailEnv = {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  SMTP_FROM?: string;
  AUTH_ALLOW_DEV_OTP?: string;
  APP_BASE_URL?: string;
  API_UPSTREAM_URL?: string;
  INTERNAL_EMAIL_SECRET?: string;
};

export type SendResult = {
  sent: boolean;
  provider: "resend" | "upstream" | "none";
  devCode?: string;
};

function allowDevOtp(env: MailEnv): boolean {
  const flag = String(env.AUTH_ALLOW_DEV_OTP || "")
    .trim()
    .toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

function fromAddress(env: MailEnv): string {
  return (
    env.EMAIL_FROM?.trim() ||
    env.SMTP_FROM?.trim() ||
    "BonList <onboarding@resend.dev>"
  );
}

export function isEmailDeliveryConfigured(env: MailEnv): boolean {
  if (env.RESEND_API_KEY?.trim()) return true;
  const upstream = String(env.API_UPSTREAM_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const secret = env.INTERNAL_EMAIL_SECRET?.trim();
  return Boolean(upstream && secret);
}

async function sendResend(
  env: MailEnv,
  input: { to: string; subject: string; text: string; html: string },
): Promise<boolean> {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) return false;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(env),
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend failed (${response.status}): ${detail.slice(0, 160)}`);
  }
  return true;
}

/** Bridge to Render api-server SMTP when Workers have no Resend key. */
async function sendViaUpstream(
  env: MailEnv,
  input: { to: string; subject: string; text: string; html: string },
): Promise<boolean> {
  const upstream = String(env.API_UPSTREAM_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const secret = env.INTERNAL_EMAIL_SECRET?.trim();
  if (!upstream || !secret) return false;

  const response = await fetch(`${upstream}/api/internal/send-email`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      from: fromAddress(env),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Upstream email failed (${response.status}): ${detail.slice(0, 160)}`);
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
  if (await sendViaUpstream(env, input)) {
    return { sent: true, provider: "upstream" };
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
    "Email delivery is not configured. Set RESEND_API_KEY (and EMAIL_FROM) on the Worker, or INTERNAL_EMAIL_SECRET plus Render SMTP, or AUTH_ALLOW_DEV_OTP=true for local testing.",
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
    "Email delivery is not configured. Set RESEND_API_KEY (and EMAIL_FROM) on the Worker, or INTERNAL_EMAIL_SECRET plus Render SMTP.",
  );
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0] || "*"}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}
