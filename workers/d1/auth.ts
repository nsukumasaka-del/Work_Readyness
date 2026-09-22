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
import {
  isEmailDeliveryConfigured,
  maskEmail,
  sendPasswordResetEmail,
  sendSignupOtpEmail,
  type MailEnv,
} from "./email";

export const SESSION_COOKIE = "bonlist_session";
const SESSION_DAYS = 30;
const SIGNUP_OTP_MINUTES = 15;
const RESET_HOURS = 1;

export type D1Env = MailEnv & {
  DB: D1Database;
  /** Optional legacy proxy for non-auth /api routes until fully on Workers. */
  API_UPSTREAM_URL?: string;
  ADZUNA_APP_ID?: string;
  ADZUNA_APP_KEY?: string;
  PRIMARY_ADMIN_EMAIL?: string;
  PRIMARY_ADMIN_PASSWORD?: string;
  PRIMARY_ADMIN_NAME?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  LINKEDIN_CLIENT_ID?: string;
  LINKEDIN_CLIENT_SECRET?: string;
  FACEBOOK_CLIENT_ID?: string;
  FACEBOOK_CLIENT_SECRET?: string;
  /** @deprecated Prefer FACEBOOK_CLIENT_ID */
  FACEBOOK_APP_ID?: string;
  /** @deprecated Prefer FACEBOOK_CLIENT_SECRET */
  FACEBOOK_APP_SECRET?: string;
};

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  email_verified?: number;
  is_admin?: number;
  created_at: string;
};

/** Resolve the signed-in D1 user for other Worker-native API modules. */
export async function getAuthenticatedUser(
  request: Request,
  env: D1Env,
): Promise<UserRow | null> {
  const token = readSessionToken(request);
  if (!token) return null;
  const resolved = await resolveSession(env.DB, token);
  return resolved?.user || null;
}

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

export function isSecureRequest(request: Request): boolean {
  const url = new URL(request.url);
  if (url.protocol === "https:") return true;
  return request.headers.get("x-forwarded-proto") === "https";
}

function cookieDomainForRequest(request: Request): string | null {
  const hostname = new URL(request.url).hostname.toLowerCase();
  if (!hostname) return null;
  if (hostname === "bonlist.site" || hostname.endsWith(".bonlist.site")) {
    return ".bonlist.site";
  }
  return null;
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

export function sessionCookie(token: string, expiresAt: Date, secure: boolean, request?: Request): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
    `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
  ];
  const domain = request ? cookieDomainForRequest(request) : null;
  if (domain) parts.push(`Domain=${domain}`);
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function clearSessionCookie(secure: boolean, request?: Request): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
  ];
  const domain = request ? cookieDomainForRequest(request) : null;
  if (domain) parts.push(`Domain=${domain}`);
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] || "BonList user";
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
    .slice(0, 80);
}

export function appOrigin(request: Request, env: D1Env): string {
  if (env.APP_BASE_URL?.trim()) return env.APP_BASE_URL.trim().replace(/\/+$/, "");
  return new URL(request.url).origin;
}

function primaryAdminConfig(env: D1Env) {
  return {
    email: String(env.PRIMARY_ADMIN_EMAIL || "nsukumasaka@gmail.com")
      .trim()
      .toLowerCase(),
    password: String(env.PRIMARY_ADMIN_PASSWORD || "Bohlale.99"),
    name: String(env.PRIMARY_ADMIN_NAME || "Ntokozo Sukumasaka").trim() || "Ntokozo Sukumasaka",
  };
}

export function toAuthPayload(
  user: UserRow,
  sessionToken?: string,
  extras?: { adminToken?: string; isPrimaryAdmin?: boolean },
) {
  const isAdmin = Boolean(user.is_admin);
  return {
    id: user.id,
    name: user.name || nameFromEmail(user.email),
    email: user.email,
    createdAt: user.created_at,
    profileCount: 1,
    sessionToken,
    emailVerified: Boolean(user.email_verified ?? 1),
    mfaEnabled: false,
    isAdmin: isAdmin && Boolean(extras?.adminToken || sessionToken),
    adminToken: isAdmin ? extras?.adminToken || sessionToken : undefined,
    adminName: isAdmin ? user.name || nameFromEmail(user.email) : undefined,
    isPrimaryAdmin: Boolean(extras?.isPrimaryAdmin ?? isAdmin),
    // Signup uses email OTP only — never force authenticator MFA after login.
    adminRequiresMfaSetup: false,
    showSecurityNudge: false,
  };
}

export async function findUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  return (
    (await db
      .prepare(
        "SELECT id, email, password_hash, name, email_verified, is_admin, created_at FROM users WHERE email = ? COLLATE NOCASE LIMIT 1",
      )
      .bind(email.toLowerCase())
      .first<UserRow>()) || null
  );
}

export const D1_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  email_verified INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token ON sessions (token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS auth_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  purpose TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT,
  code_hash TEXT,
  token_hash TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_email ON auth_challenges (email);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_purpose ON auth_challenges (purpose);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_expires ON auth_challenges (expires_at);

CREATE TABLE IF NOT EXISTS verification_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_identities (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  email TEXT COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS idx_auth_identities_user_id ON auth_identities (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_identities_email ON auth_identities (email);

CREATE TABLE IF NOT EXISTS career_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  location TEXT,
  target_role TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_career_profiles_email ON career_profiles(email);

CREATE TABLE IF NOT EXISTS cv_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cv_reports_user_created ON cv_reports(user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS generated_cvs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id INTEGER NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  structure TEXT NOT NULL,
  title TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (profile_id, version)
);

CREATE INDEX IF NOT EXISTS idx_generated_cvs_profile_created
  ON generated_cvs(profile_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS application_outcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id INTEGER NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  role_title TEXT NOT NULL,
  company TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'applied',
  interview_count INTEGER NOT NULL DEFAULT 0,
  cv_structure TEXT,
  notes TEXT,
  consented_to_analytics INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_application_outcomes_user_created
  ON application_outcomes(user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS career_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  profile_id INTEGER NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ends_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS career_programmes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  profile_id INTEGER NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  completed_lessons_json TEXT NOT NULL DEFAULT '[]',
  current_lesson_id TEXT,
  amount_paid INTEGER NOT NULL DEFAULT 2000,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS coaching_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id INTEGER NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  experience TEXT NOT NULL,
  goals TEXT NOT NULL,
  payment_plan TEXT NOT NULL DEFAULT 'programme',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_coaching_applications_user_created
  ON coaching_applications(user_id, created_at DESC, id DESC);
`;

export async function ensureD1Schema(db: D1Database): Promise<void> {
  try {
    await db.exec(D1_SCHEMA_SQL);
  } catch (error) {
    console.warn("D1 schema bootstrap failed; continuing with a direct query to surface the real database issue.", error);
    throw error;
  }
}

/** Ensure the primary admin account exists in D1 with a known password. */
async function ensurePrimaryAdmin(env: D1Env): Promise<UserRow> {
  const primary = primaryAdminConfig(env);
  const existing = await findUserByEmail(env.DB, primary.email);
  const passwordHash = await hashPassword(primary.password);

  if (!existing) {
    const id = randomId();
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, email_verified, is_admin, created_at)
       VALUES (?, ?, ?, ?, 1, 1, datetime('now'))`,
    )
      .bind(id, primary.email, passwordHash, primary.name)
      .run();
    return (await findUserByEmail(env.DB, primary.email))!;
  }

  const passwordOk = await verifyPassword(primary.password, existing.password_hash);
  if (!passwordOk || !existing.is_admin || existing.email_verified === 0 || existing.name !== primary.name) {
    await env.DB.prepare(
      `UPDATE users
       SET password_hash = ?, name = ?, email_verified = 1, is_admin = 1
       WHERE id = ?`,
    )
      .bind(passwordOk ? existing.password_hash : passwordHash, primary.name, existing.id)
      .run();
  }

  return (await findUserByEmail(env.DB, primary.email))!;
}

async function buildLoginResponse(
  request: Request,
  env: D1Env,
  user: UserRow,
): Promise<Response> {
  const { token, expiresAt } = await createSession(env.DB, user.id);
  const headers = new Headers();
  headers.append("Set-Cookie", sessionCookie(token, expiresAt, isSecureRequest(request), request));

  // Admin dashboards use the same D1 session token (no external auth host).
  const adminToken = user.is_admin ? token : undefined;

  return json(
    toAuthPayload(user, token, {
      adminToken,
      isPrimaryAdmin: Boolean(user.is_admin),
    }),
    200,
    headers,
  );
}

export async function createSession(db: D1Database, userId: string): Promise<{ token: string; expiresAt: Date }> {
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
              u.id AS id, u.email, u.password_hash, u.name, u.email_verified, u.is_admin, u.created_at
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
      is_admin: row.is_admin,
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
  await ensurePrimaryAdmin(env);

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
      `INSERT INTO users (id, email, password_hash, name, email_verified, is_admin, created_at)
       VALUES (?, ?, ?, ?, 1, 0, datetime('now'))`,
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
  await ensurePrimaryAdmin(env);

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

  if (!user.password_hash.startsWith("pbkdf2$")) {
    const upgradedHash = await hashPassword(password);
    await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
      .bind(upgradedHash, user.id)
      .run();
  }

  return buildLoginResponse(request, env, user);
}

export async function handleMe(request: Request, env: D1Env): Promise<Response> {
  const token = readSessionToken(request);
  if (!token) return error(401, "Please sign in to continue.");

  const resolved = await resolveSession(env.DB, token);
  if (!resolved) return error(401, "Your session has expired. Please sign in again.");

  const user = resolved.user;
  return json(
    toAuthPayload(user, token, {
      adminToken: user.is_admin ? token : undefined,
      isPrimaryAdmin: Boolean(user.is_admin),
    }),
  );
}

export async function handleLogout(request: Request, env: D1Env): Promise<Response> {
  const token = readSessionToken(request);
  if (token) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  }
  const headers = new Headers();
  headers.append("Set-Cookie", clearSessionCookie(isSecureRequest(request), request));
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
  await ensureD1Schema(env.DB);
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
    const { oauthConfigFlags } = await import("./oauth");
    const social = oauthConfigFlags(env);
    return json({
      passkeys: false,
      google: social.google,
      linkedin: social.linkedin,
      facebook: social.facebook,
      d1Auth: true,
      emailVerification: true,
      magicLink: false,
      emailConfigured: isEmailDeliveryConfigured(env),
    });
  }

  const oauthStart = /^\/api\/auth\/oauth\/(google|linkedin|facebook)\/start$/.exec(path)
    || /^\/api\/career\/auth\/(google|linkedin|facebook)\/start$/.exec(path);
  if (method === "GET" && oauthStart) {
    const { handleOAuthStart } = await import("./oauth");
    return handleOAuthStart(request, env, oauthStart[1]!);
  }

  const oauthCallback = /^\/api\/auth\/oauth\/(google|linkedin|facebook)\/callback$/.exec(path)
    || /^\/api\/career\/auth\/(google|linkedin|facebook)\/callback$/.exec(path);
  if (method === "GET" && oauthCallback) {
    const { handleOAuthCallback } = await import("./oauth");
    return handleOAuthCallback(request, env, oauthCallback[1]!);
  }

  return null;
}
