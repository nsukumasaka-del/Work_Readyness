import nodemailer from "nodemailer";
import { logger } from "./logger";

type SendInput = {
  to: string;
  code: string;
  purpose: "signup";
};

export type EmailDeliveryResult = {
  sent: boolean;
  provider: "smtp" | "resend" | "none";
  /** Only returned when AUTH_ALLOW_DEV_OTP=true — never for normal production signup. */
  devCode?: string;
};

function resolveFromAddress(fallbackUser?: string): string {
  return (
    process.env.SMTP_FROM?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    (fallbackUser ? `BonList <${fallbackUser}>` : "BonList <noreply@bonlist.local>")
  );
}

function allowDevOtpFallback(): boolean {
  const flag = (process.env.AUTH_ALLOW_DEV_OTP || "").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

async function sendViaResend(input: SendInput, from: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return false;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: "Your BonList verification code",
      text: [
        `Your BonList verification code is ${input.code}.`,
        "",
        "This code expires in 10 minutes.",
        "If you did not request this, you can ignore this email.",
      ].join("\n"),
      html: `
        <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a">
          <p>Your BonList verification code is:</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${input.code}</p>
          <p>This code expires in <strong>10 minutes</strong>.</p>
          <p style="color:#64748b;font-size:13px">If you did not request this, you can ignore this email.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend email failed (${response.status}): ${detail.slice(0, 240)}`);
  }
  return true;
}

async function sendViaSmtp(input: SendInput, from: string): Promise<boolean> {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!host || !user || !pass) return false;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: {
      // Common with shared hosts / Gmail on some networks
      minVersion: "TLSv1.2",
    },
  });

  await transporter.sendMail({
    from,
    to: input.to,
    subject: "Your BonList verification code",
    text: [
      `Your BonList verification code is ${input.code}.`,
      "",
      "This code expires in 10 minutes.",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a">
        <p>Your BonList verification code is:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${input.code}</p>
        <p>This code expires in <strong>10 minutes</strong>.</p>
        <p style="color:#64748b;font-size:13px">If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });
  return true;
}

/**
 * Sends the signup verification code by email.
 * Never returns the code to callers unless AUTH_ALLOW_DEV_OTP is explicitly enabled.
 */
export async function sendAuthCodeEmail(input: SendInput): Promise<EmailDeliveryResult> {
  const from = resolveFromAddress(process.env.SMTP_USER?.trim());

  try {
    if (await sendViaResend(input, from)) {
      logger.info({ to: input.to, purpose: input.purpose, provider: "resend" }, "Auth OTP emailed");
      return { sent: true, provider: "resend" };
    }

    if (await sendViaSmtp(input, from)) {
      logger.info({ to: input.to, purpose: input.purpose, provider: "smtp" }, "Auth OTP emailed");
      return { sent: true, provider: "smtp" };
    }
  } catch (error) {
    logger.error({ err: error, to: input.to }, "Failed to send auth code email");
    throw new Error(
      "We could not send the verification email. Please check your email settings and try again shortly.",
    );
  }

  // No provider configured
  logger.warn(
    { to: input.to, purpose: input.purpose },
    "Email not configured — set SMTP_* or RESEND_API_KEY to deliver verification codes",
  );

  if (allowDevOtpFallback()) {
    // Opt-in local/testing only — code stays on the server log, optionally returned
    logger.warn({ to: input.to, code: input.code }, "AUTH_ALLOW_DEV_OTP enabled — code logged for testing");
    return { sent: false, provider: "none", devCode: input.code };
  }

  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (host && user && !pass) {
    throw new Error(
      "SMTP_PASS is empty. Create a Gmail App Password (Google Account → Security → 2-Step Verification → App passwords), set SMTP_PASS in .env, then restart the API.",
    );
  }

  throw new Error(
    "Email delivery is not configured. Add SMTP_HOST/SMTP_USER/SMTP_PASS (or RESEND_API_KEY) to your .env, then restart the server.",
  );
}

export function isEmailDeliveryConfigured(): boolean {
  const hasSmtp = Boolean(
    process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim(),
  );
  const hasResend = Boolean(process.env.RESEND_API_KEY?.trim());
  return hasSmtp || hasResend;
}
