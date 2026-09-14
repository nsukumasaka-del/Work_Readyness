import nodemailer from "nodemailer";
import { logger } from "./logger";

type OtpPurpose = "signup" | "email_change" | "magic_link";

type SendOtpInput = {
  to: string;
  code: string;
  purpose: OtpPurpose;
};

type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
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

async function sendViaResendRaw(input: SendMailInput, from: string): Promise<boolean> {
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
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Email provider failed (${response.status}): ${detail.slice(0, 120)}`);
  }
  return true;
}

async function sendViaSmtpRaw(input: SendMailInput, from: string): Promise<boolean> {
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
    tls: { minVersion: "TLSv1.2" },
  });

  await transporter.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  return true;
}

export async function sendTransactionalEmail(input: SendMailInput): Promise<EmailDeliveryResult> {
  const from = resolveFromAddress(process.env.SMTP_USER?.trim());
  try {
    if (await sendViaResendRaw(input, from)) {
      return { sent: true, provider: "resend" };
    }
    if (await sendViaSmtpRaw(input, from)) {
      return { sent: true, provider: "smtp" };
    }
  } catch (error) {
    logger.error({ err: error, to: input.to }, "Failed to send email");
    throw new Error("We could not send the email. Please try again shortly.");
  }

  if (allowDevOtpFallback()) {
    logger.warn({ to: input.to, subject: input.subject }, "AUTH_ALLOW_DEV_OTP — email skipped (dev)");
    return { sent: false, provider: "none" };
  }

  throw new Error("Email delivery is not configured.");
}

/**
 * Sends the signup verification code by email.
 * Never returns the code to callers unless AUTH_ALLOW_DEV_OTP is explicitly enabled.
 * Never logs the raw verification code.
 */
export async function sendAuthCodeEmail(input: SendOtpInput): Promise<EmailDeliveryResult> {
  const subject =
    input.purpose === "magic_link"
      ? "Your BonList sign-in code"
      : input.purpose === "email_change"
        ? "Confirm your new BonList email"
        : "Your BonList verification code";

  const result = await sendTransactionalEmail({
    to: input.to,
    subject,
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
  }).catch(async (error) => {
    // Dev fallback when transactional throws for missing config
    if (allowDevOtpFallback()) {
      logger.warn({ to: input.to, purpose: input.purpose }, "AUTH_ALLOW_DEV_OTP — OTP available to client only");
      return { sent: false, provider: "none" as const, devCode: input.code };
    }
    throw error;
  });

  if (!result.sent && allowDevOtpFallback()) {
    return { ...result, devCode: input.code };
  }
  return result;
}

export function isEmailDeliveryConfigured(): boolean {
  const hasSmtp = Boolean(
    process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim(),
  );
  const hasResend = Boolean(process.env.RESEND_API_KEY?.trim());
  return hasSmtp || hasResend;
}
