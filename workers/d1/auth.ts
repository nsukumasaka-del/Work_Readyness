/**
 * D1-backed auth for BonList (Workers-native).
 * - Signup requires email OTP verification before session
 * - Login uses password only (no OTP)
 * - Forgot password emails a reset link
 */

import {
  hashPassword,
  randomId,
  randomOtpCode,
  randomToken,
  sha256Hex,
  verifyPassword,
} from "./crypto";
import { maskEmail, sendPasswordResetEmail, sendSignupOtpEmail, type MailEnv } from "./email";

export const SESSION_COOKIE = "bonlist_session";
const SESSION_DAYS = 30;
const SIGNUP_OTP_MINUTES = 15;
const RESET_HOURS = 1;

export type D1Env = MailEnv & {
  DB: D1Database;
  API_UPSTREAM_URL?: string;
};

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  email_verified?: number;
  created_at: string;
};

type SessionRow = {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
};

type ChallengeRow = {
  id: string;
  purpose: string;
  email: string;
  name: string;
  password_hash: string | null;
  code_hash: string | null;
  token_hash: string | null;
  expires_at: string;
  created_at: string;
  consumed_at: string | null;
};

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function error(status: number, message: string): Response {
  return json({ error: message }, status);
}

function isSecureRequest(request: Request): boolean {
  const url = new URL(request.url);
  if (url.protocol === "https:") return true;
  return request.headers.get("x-forwarded-proto") === "https";
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function readBearer(request: Request): string | null {
  const auth = request.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m?.[1]?.trim() || null;
}

function readSessionToken(request: Request): string | null {
  return readBearer(request) || parseCookies(request.headers.get("cookie"))[SESSION_COOKIE] || null;
}

function sessionCookie(token: string, expiresAt: Date, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
    `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function clearSessionCookie(secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] || "BonList user";
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
    .slice(0, 80);
}

function appOrigin(request: Request, env: D1Env): string {
  if (env.APP_BASE_URL?.trim()) return env.APP_BASE_URL.trim().replace(/\/+$/, "");
  return new URL(request.url).origin;
}

function toAuthPayload(user: UserRow, sessionToken?: string) {
  return {
    id: user.id,
    name: user.name || nameFromEmail(user.email),
    email: user.email,
    createdAt: user.created_at,
    profileCount: 1,
    sessionToken,
    emailVerified: Boolean(user.email_verified ?? 1),
    mfaEnabled: false,
  };
}

async function findUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  return (
    (await db
      .prepare(
        "SELECT id, email, password_hash, name, email_verified, created_at FROM users WHERE email = ? COLLATE NOCASE LIMIT 1",
      )
      .bind(email.toLowerCase())
      .first<UserRow>()) || null
  );
}

async function createSession(db: D1Database, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const id = randomId();
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db
    .prepare(
      "INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
    )
    .bind(id, userId, token, expiresAt.toISOString())
    .run();
  return { token, expiresAt };
}

async function resolveSession(
  db: D1Database,
  token: string,
): Promise<{ user: UserRow; session: SessionRow } | null> {
  const row = await db
    .prepare(
      `SELECT s.id AS session_id, s.user_id, s.token, s.expires_at, s.created_at AS session_created_at,
              u.id AS id, u.email, u.password_hash, u.name, u.email_verified, u.created_at
       FROM sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.token = ?
       LIMIT 1`,
    )
    .bind(token)
    .first<
      UserRow & {
        session_id: string;
        user_id: string;
        token: string;
        expires_at: string;
        session_created_at: string;
      }
    >();

  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return null;
  }

  return {
    user: {
      id: row.id,
      email: row.email,
      password_hash: row.password_hash,
      name: row.name,
      email_verified: row.email_verified,
      created_at: row.created_at,
    },
    session: {
      id: row.session_id,
      user_id: row.user_id,
      token: row.token,
      expires_at: row.expires_at,
      created_at: row.session_created_at,
    },
  };
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const data = await request.json();
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function getChallenge(db: D1Database, id: string): Promise<ChallengeRow | null> {
  return (
    (await db
      .prepare(
        `SELECT id, purpose, email, name, password_hash, code_hash, token_hash, expires_at, created_at, consumed_at
         FROM auth_challenges WHERE id = ? LIMIT 1`,
      )
      .bind(id)
      .first<ChallengeRow>()) || null
  );
}

async function issueSignupChallenge(
  env: D1Env,
  input: { email: string; name: string; passwordHash: string },
): Promise<{ challengeId: string; code: string; delivery: Awaited<ReturnType<typeof sendSignupOtpEmail>> }> {
  const challengeId = randomId();
  const code = randomOtpCode();
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + SIGNUP_OTP_MINUTES * 60 * 1000).toISOString();

  await env.DB.prepare(
    `INSERT INTO auth_challenges
      (id, purpose, email, name, password_hash, code_hash, expires_at, created_at)
     VALUES (?, 'signup', ?, ?, ?, ?, ?, datetime('now'))`,
  )
    .bind(challengeId, input.email, input.name, input.passwordHash, codeHash, expiresAt)
    .run();

  const delivery = await sendSignupOtpEmail(env, input.email, code);
  return { challengeId, code, delivery };
}

/** Start signup: store pending credentials + email a 6-digit code (no session yet). */
export async function handleRegister(request: Request, env: D1Env): Promise<Response> {
  const body = await readJsonBody(request);
  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  const password = String(body.password || "");
  const name = String(body.name || "").trim() || nameFromEmail(email);

  if (!email || !email.includes("@")) return error(400, "A valid email is required.");
  if (password.length < 8) return error(400, "Password must be at least 8 characters.");

  const existing = await findUserByEmail(env.DB, email);
  if (existing) return error(409, "An account with that email already exists. Please sign in.");

  // Drop prior unused signup challenges for this email.
  await env.DB.prepare(
    "DELETE FROM auth_challenges WHERE purpose = 'signup' AND email = ? COLLATE NOCASE AND consumed_at IS NULL",
  )
    .bind(email)
    .run();

  try {
    const passwordHash = await hashPassword(password);
    const { challengeId, delivery } = await issueSignupChallenge(env, {
      email,
      name,
      passwordHash,
    });

    return json(
      {
        challengeId,
        maskedEmail: maskEmail(email),
        message: delivery.sent
          ? "We sent a 6-digit verification code to your email."
          : "Verification code ready (dev mode — email not configured).",
        ...(delivery.devCode ? { verificationCode: delivery.devCode, devOtp: true } : {}),
      },
      201,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not start signup verification.";
    return error(503, message);
  }
}

/** Confirm signup OTP → create verified user + session. */
export async function handleVerifySignup(request: Request, env: D1Env): Promise<Response> {
  const body = await readJsonBody(request);
  const challengeId = String(body.challengeId || "").trim();
  const code = String(body.code || "")
    .trim()
    .replace(/\s+/g, "");

  if (!challengeId || code.length !== 6) {
    return error(400, "Verification code and challenge are required.");
  }

  const challenge = await getChallenge(env.DB, challengeId);
  if (!challenge || challenge.purpose !== "signup" || challenge.consumed_at) {
    return error(400, "This verification request is invalid or already used. Please sign up again.");
  }
  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    return error(400, "That code has expired. Resend a new code or start signup again.");
  }
  if (!challenge.password_hash || !challenge.code_hash) {
    return error(400, "This verification request is incomplete. Please sign up again.");
  }

  const codeHash = await sha256Hex(code);
  if (codeHash !== challenge.code_hash) {
    return error(401, "That code was incorrect. Please try again.");
  }

  const existing = await findUserByEmail(env.DB, challenge.email);
  if (existing) {
    return error(409, "An account with that email already exists. Please sign in.");
  }

  const userId = randomId();
  try {
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, email_verified, created_at)
       VALUES (?, ?, ?, ?, 1, datetime('now'))`,
    )
      .bind(userId, challenge.email.toLowerCase(), challenge.password_hash, challenge.name || nameFromEmail(challenge.email))
      .run();
  } catch {
    return error(409, "An account with that email already exists. Please sign in.");
  }

  await env.DB.prepare("UPDATE auth_challenges SET consumed_at = datetime('now') WHERE id = ?")
    .bind(challengeId)
    .run();

  const user = (await findUserByEmail(env.DB, challenge.email))!;
  const { token, expiresAt } = await createSession(env.DB, user.id);
  const headers = new Headers();
  headers.append("Set-Cookie", sessionCookie(token, expiresAt, isSecureRequest(request)));
  return json(toAuthPayload(user, token), 200, headers);
}

/** Resend signup code; optionally update email if the user mistyped it. */
export async function handleResendSignup(request: Request, env: D1Env): Promise<Response> {
  const body = await readJsonBody(request);
  const challengeId = String(body.challengeId || "").trim();
  const nextEmail = String(body.email || "")
    .trim()
    .toLowerCase();

  if (!challengeId) return error(400, "challengeId is required.");

  const challenge = await getChallenge(env.DB, challengeId);
  if (!challenge || challenge.purpose !== "signup" || challenge.consumed_at) {
    return error(400, "This verification request is invalid. Please sign up again.");
  }
  if (!challenge.password_hash) {
    return error(400, "This verification request is incomplete. Please sign up again.");
  }

  let email = challenge.email.toLowerCase();
  if (nextEmail && nextEmail.includes("@") && nextEmail !== email) {
    const taken = await findUserByEmail(env.DB, nextEmail);
    if (taken) return error(409, "That email is already registered. Please sign in.");
    email = nextEmail;
  }

  const code = randomOtpCode();
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + SIGNUP_OTP_MINUTES * 60 * 1000).toISOString();

  await env.DB.prepare(
    `UPDATE auth_challenges
     SET email = ?, code_hash = ?, expires_at = ?, created_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(email, codeHash, expiresAt, challengeId)
    .run();

  try {
    const delivery = await sendSignupOtpEmail(env, email, code);
    return json({
      challengeId,
      maskedEmail: maskEmail(email),
      message: delivery.sent ? "A new code was sent." : "New code ready (dev mode).",
      ...(delivery.devCode ? { verificationCode: delivery.devCode, devOtp: true } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not resend the code.";
    return error(503, message);
  }
}

export async function handleLogin(request: Request, env: D1Env): Promise<Response> {
  const body = await readJsonBody(request);
  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  const password = String(body.password || "");

  if (!email || !password) return error(400, "Email and password are required.");

  const user = await findUserByEmail(env.DB, email);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return error(401, "Invalid email or password.");
  }
  if (user.email_verified === 0) {
    return error(403, "Please verify your email before signing in. Complete signup with the code we emailed you.");
  }

  const { token, expiresAt } = await createSession(env.DB, user.id);
  const headers = new Headers();
  headers.append("Set-Cookie", sessionCookie(token, expiresAt, isSecureRequest(request)));
  return json(toAuthPayload(user, token), 200, headers);
}

export async function handleMe(request: Request, env: D1Env): Promise<Response> {
  const token = readSessionToken(request);
  if (!token) return error(401, "Please sign in to continue.");

  const resolved = await resolveSession(env.DB, token);
  if (!resolved) return error(401, "Your session has expired. Please sign in again.");

  return json(toAuthPayload(resolved.user, token));
}

export async function handleLogout(request: Request, env: D1Env): Promise<Response> {
  const token = readSessionToken(request);
  if (token) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  }
  const headers = new Headers();
  headers.append("Set-Cookie", clearSessionCookie(isSecureRequest(request)));
  return json({ ok: true }, 200, headers);
}

/** Always returns a generic success message (no email enumeration). */
export async function handleForgotPassword(request: Request, env: D1Env): Promise<Response> {
  const body = await readJsonBody(request);
  const email = String(body.email || "")
    .trim()
    .toLowerCase();

  const generic = {
    ok: true,
    message: "If an account exists for that email, we sent password reset instructions.",
  };

  if (!email || !email.includes("@")) return json(generic);

  const user = await findUserByEmail(env.DB, email);
  if (!user) return json(generic);

  const challengeId = randomId();
  const rawToken = randomToken(32);
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + RESET_HOURS * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    "DELETE FROM auth_challenges WHERE purpose = 'password_reset' AND email = ? COLLATE NOCASE AND consumed_at IS NULL",
  )
    .bind(email)
    .run();

  await env.DB.prepare(
    `INSERT INTO auth_challenges
      (id, purpose, email, name, token_hash, expires_at, created_at)
     VALUES (?, 'password_reset', ?, ?, ?, ?, datetime('now'))`,
  )
    .bind(challengeId, email, user.name || "", tokenHash, expiresAt)
    .run();

  const resetUrl = `${appOrigin(request, env)}/reset-password?token=${encodeURIComponent(rawToken)}`;

  try {
    const delivery = await sendPasswordResetEmail(env, email, resetUrl);
    return json({
      ...generic,
      ...(delivery.devCode ? { resetUrl: delivery.devCode, devOtp: true } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not send reset email.";
    return error(503, message);
  }
}

export async function handleResetPassword(request: Request, env: D1Env): Promise<Response> {
  const body = await readJsonBody(request);
  const rawToken = String(body.token || "").trim();
  const password = String(body.password || "");

  if (!rawToken) return error(400, "Reset token is required.");
  if (password.length < 8) return error(400, "Password must be at least 8 characters.");

  const tokenHash = await sha256Hex(rawToken);
  const challenge = await env.DB.prepare(
    `SELECT id, purpose, email, name, password_hash, code_hash, token_hash, expires_at, created_at, consumed_at
     FROM auth_challenges
     WHERE purpose = 'password_reset' AND token_hash = ?
     LIMIT 1`,
  )
    .bind(tokenHash)
    .first<ChallengeRow>();

  if (!challenge || challenge.consumed_at) {
    return error(400, "This reset link is invalid or already used.");
  }
  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    return error(400, "This reset link has expired. Request a new one.");
  }

  const user = await findUserByEmail(env.DB, challenge.email);
  if (!user) return error(400, "This reset link is invalid.");

  const passwordHash = await hashPassword(password);
  await env.DB.prepare("UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?")
    .bind(passwordHash, user.id)
    .run();
  await env.DB.prepare("UPDATE auth_challenges SET consumed_at = datetime('now') WHERE id = ?")
    .bind(challenge.id)
    .run();
  // Revoke existing sessions after password change.
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id).run();

  return json({ ok: true, message: "Password updated. You can sign in now." });
}

/** Route D1 auth endpoints. Returns null if the path is not an auth route. */
export async function handleD1Auth(request: Request, env: D1Env): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();

  if (method === "POST" && path === "/api/auth/register") return handleRegister(request, env);
  if (method === "POST" && path === "/api/auth/verify") return handleVerifySignup(request, env);
  if (method === "POST" && path === "/api/auth/resend") return handleResendSignup(request, env);
  if (method === "POST" && path === "/api/auth/login") return handleLogin(request, env);
  if (method === "GET" && path === "/api/auth/me") return handleMe(request, env);
  if (method === "POST" && path === "/api/auth/logout") return handleLogout(request, env);
  if (method === "POST" && path === "/api/auth/forgot-password") return handleForgotPassword(request, env);
  if (method === "POST" && path === "/api/auth/reset-password") return handleResetPassword(request, env);

  // BonList UI aliases
  if (method === "POST" && path === "/api/career/signup") return handleRegister(request, env);
  if (method === "POST" && path === "/api/career/login") return handleLogin(request, env);
  if (method === "GET" && path === "/api/career/auth/me") return handleMe(request, env);
  if (method === "POST" && (path === "/api/career/auth/logout-all" || path === "/api/career/auth/logout")) {
    return handleLogout(request, env);
  }
  if (method === "POST" && path === "/api/career/auth/verify") return handleVerifySignup(request, env);
  if (method === "POST" && path === "/api/career/auth/resend") return handleResendSignup(request, env);
  if (method === "POST" && path === "/api/career/auth/forgot-password") {
    return handleForgotPassword(request, env);
  }
  if (method === "POST" && path === "/api/career/auth/reset-password") {
    return handleResetPassword(request, env);
  }
  if (method === "GET" && path === "/api/career/auth/config") {
    return json({
      passkeys: false,
      google: false,
      d1Auth: true,
      emailVerification: true,
      magicLink: false,
      emailConfigured: Boolean(env.RESEND_API_KEY?.trim()),
    });
  }

  return null;
}
