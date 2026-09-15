/**
 * D1-backed auth for BonList (register / login / me / logout).
 * Runs entirely on Cloudflare Workers — no Node.js native deps.
 */

import { hashPassword, randomId, randomToken, verifyPassword } from "./crypto";

export const SESSION_COOKIE = "bonlist_session";
const SESSION_DAYS = 30;

export type D1Env = {
  DB: D1Database;
};

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  created_at: string;
};

type SessionRow = {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
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
  const proto = request.headers.get("x-forwarded-proto");
  return proto === "https";
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

function toAuthPayload(user: UserRow, sessionToken?: string) {
  return {
    id: user.id,
    name: user.name || nameFromEmail(user.email),
    email: user.email,
    createdAt: user.created_at,
    profileCount: 1,
    sessionToken,
    emailVerified: true,
    mfaEnabled: false,
  };
}

async function findUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  return (
    (await db
      .prepare("SELECT id, email, password_hash, name, created_at FROM users WHERE email = ? COLLATE NOCASE LIMIT 1")
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
              u.id AS id, u.email, u.password_hash, u.name, u.created_at
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

  const id = randomId();
  const passwordHash = await hashPassword(password);
  try {
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
    )
      .bind(id, email, passwordHash, name)
      .run();
  } catch {
    return error(409, "An account with that email already exists. Please sign in.");
  }

  const user = (await findUserByEmail(env.DB, email))!;
  const { token, expiresAt } = await createSession(env.DB, user.id);
  const headers = new Headers();
  headers.append("Set-Cookie", sessionCookie(token, expiresAt, isSecureRequest(request)));
  return json(toAuthPayload(user, token), 201, headers);
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

/** Route D1 auth endpoints. Returns null if the path is not an auth route. */
export async function handleD1Auth(request: Request, env: D1Env): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();

  // Canonical D1 auth API
  if (method === "POST" && path === "/api/auth/register") return handleRegister(request, env);
  if (method === "POST" && path === "/api/auth/login") return handleLogin(request, env);
  if (method === "GET" && path === "/api/auth/me") return handleMe(request, env);
  if (method === "POST" && path === "/api/auth/logout") return handleLogout(request, env);

  // BonList frontend aliases (existing AuthPages paths)
  if (method === "POST" && path === "/api/career/signup") return handleRegister(request, env);
  if (method === "POST" && path === "/api/career/login") return handleLogin(request, env);
  if (method === "GET" && path === "/api/career/auth/me") return handleMe(request, env);
  if (method === "POST" && (path === "/api/career/auth/logout-all" || path === "/api/career/auth/logout")) {
    return handleLogout(request, env);
  }
  if (method === "GET" && path === "/api/career/auth/config") {
    return json({
      passkeys: false,
      google: false,
      d1Auth: true,
      magicLink: false,
    });
  }

  // Signup used to require OTP — with D1 we complete registration immediately.
  // Keep verify as a no-op session refresh if already authenticated.
  if (method === "POST" && path === "/api/career/auth/verify") {
    const token = readSessionToken(request);
    if (token) {
      const resolved = await resolveSession(env.DB, token);
      if (resolved) return json(toAuthPayload(resolved.user, token));
    }
    return error(
      400,
      "Email verification is not required. Please sign in with your email and password.",
    );
  }
  if (method === "POST" && path === "/api/career/auth/resend") {
    return error(
      400,
      "Email codes are not used with BonList cloud auth. Sign in with your password instead.",
    );
  }

  return null;
}
