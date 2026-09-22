/**
 * Social OAuth for BonList D1 auth (Google, LinkedIn, Facebook).
 * Sessions stay on Cloudflare D1 — never depends on Render Postgres.
 */

import { hashPassword, randomId, randomToken } from "./crypto";
import {
  type D1Env,
  appOrigin,
  createSession,
  findUserByEmail,
  isSecureRequest,
  nameFromEmail,
  sessionCookie,
} from "./auth";

export type OAuthProvider = "google" | "linkedin" | "facebook";

type ProviderConfig = {
  clientId: string;
  clientSecret: string;
};

type OAuthProfile = {
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function isProvider(value: string): value is OAuthProvider {
  return value === "google" || value === "linkedin" || value === "facebook";
}

export function oauthProviderConfigured(env: D1Env, provider: OAuthProvider): boolean {
  return Boolean(readProviderConfig(env, provider));
}

export function oauthConfigFlags(env: D1Env): {
  google: boolean;
  linkedin: boolean;
  facebook: boolean;
} {
  return {
    google: oauthProviderConfigured(env, "google"),
    linkedin: oauthProviderConfigured(env, "linkedin"),
    facebook: oauthProviderConfigured(env, "facebook"),
  };
}

function readProviderConfig(env: D1Env, provider: OAuthProvider): ProviderConfig | null {
  if (provider === "google") {
    const clientId = env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
  }
  if (provider === "linkedin") {
    const clientId = env.LINKEDIN_CLIENT_ID?.trim();
    const clientSecret = env.LINKEDIN_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
  }
  // Prefer FACEBOOK_CLIENT_* (wrangler bindings); accept legacy APP_ID / APP_SECRET.
  const clientId = env.FACEBOOK_CLIENT_ID?.trim() || env.FACEBOOK_APP_ID?.trim();
  const clientSecret = env.FACEBOOK_CLIENT_SECRET?.trim() || env.FACEBOOK_APP_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

function sanitizeReturnTo(raw: string | null): string {
  const value = (raw || "/").trim() || "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function callbackPath(provider: OAuthProvider): string {
  return `/api/auth/oauth/${provider}/callback`;
}

function redirectUri(request: Request, env: D1Env, provider: OAuthProvider): string {
  return `${appOrigin(request, env)}${callbackPath(provider)}`;
}

function loginErrorRedirect(request: Request, env: D1Env, code: string): Response {
  const url = `${appOrigin(request, env)}/login?error=${encodeURIComponent(code)}`;
  return Response.redirect(url, 302);
}

/** Prefer signup vs login for missing-config UX based on Referer. */
function oauthConfigErrorRedirect(request: Request, env: D1Env): Response {
  let page = "/login";
  const referer = request.headers.get("referer") || "";
  try {
    const path = new URL(referer).pathname.toLowerCase();
    if (path.includes("signup")) page = "/signup";
  } catch {
    /* ignore bad referer */
  }
  const url = `${appOrigin(request, env)}${page}?error=oauth_config`;
  return Response.redirect(url, 302);
}

async function storeOAuthState(
  db: D1Database,
  provider: OAuthProvider,
  returnTo: string,
): Promise<string> {
  const state = randomToken(24);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await db
    .prepare(
      `INSERT INTO auth_challenges
        (id, purpose, email, name, expires_at, created_at)
       VALUES (?, 'oauth', ?, ?, ?, datetime('now'))`,
    )
    .bind(state, provider, returnTo)
    .run();
  return state;
}

async function consumeOAuthState(
  db: D1Database,
  state: string,
  provider: OAuthProvider,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT id, purpose, email, name, expires_at, consumed_at
       FROM auth_challenges WHERE id = ? LIMIT 1`,
    )
    .bind(state)
    .first<{
      id: string;
      purpose: string;
      email: string;
      name: string;
      expires_at: string;
      consumed_at: string | null;
    }>();

  if (!row || row.purpose !== "oauth" || row.consumed_at) return null;
  if (row.email !== provider) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;

  await db
    .prepare("UPDATE auth_challenges SET consumed_at = datetime('now') WHERE id = ?")
    .bind(state)
    .run();

  return sanitizeReturnTo(row.name);
}

function buildAuthorizeUrl(
  provider: OAuthProvider,
  cfg: ProviderConfig,
  redirectUriValue: string,
  state: string,
): string {
  if (provider === "google") {
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: redirectUriValue,
      response_type: "code",
      scope: "openid email profile",
      access_type: "online",
      include_granted_scopes: "true",
      prompt: "select_account",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  if (provider === "linkedin") {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: cfg.clientId,
      redirect_uri: redirectUriValue,
      state,
      scope: "openid profile email",
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  }

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUriValue,
    state,
    response_type: "code",
    scope: "email,public_profile",
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
}

async function exchangeCode(
  provider: OAuthProvider,
  cfg: ProviderConfig,
  code: string,
  redirectUriValue: string,
): Promise<OAuthProfile> {
  if (provider === "google") {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: redirectUriValue,
        grant_type: "authorization_code",
      }),
    });
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenRes.ok || !tokenJson.access_token) throw new Error("oauth_token_failed");

    const userRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const user = (await userRes.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };
    if (!userRes.ok || !user.sub || !user.email) throw new Error("oauth_profile_failed");
    return {
      subject: user.sub,
      email: user.email.toLowerCase().trim(),
      emailVerified: Boolean(user.email_verified),
      name: user.name?.trim() || nameFromEmail(user.email),
    };
  }

  if (provider === "linkedin") {
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUriValue,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      }),
    });
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenRes.ok || !tokenJson.access_token) throw new Error("oauth_token_failed");

    const userRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const user = (await userRes.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };
    if (!userRes.ok || !user.sub || !user.email) throw new Error("oauth_profile_failed");
    return {
      subject: user.sub,
      email: user.email.toLowerCase().trim(),
      emailVerified: user.email_verified !== false,
      name: user.name?.trim() || nameFromEmail(user.email),
    };
  }

  const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
  tokenUrl.searchParams.set("client_id", cfg.clientId);
  tokenUrl.searchParams.set("client_secret", cfg.clientSecret);
  tokenUrl.searchParams.set("redirect_uri", redirectUriValue);
  tokenUrl.searchParams.set("code", code);
  const tokenRes = await fetch(tokenUrl.toString());
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenRes.ok || !tokenJson.access_token) throw new Error("oauth_token_failed");

  const meUrl = new URL("https://graph.facebook.com/me");
  meUrl.searchParams.set("fields", "id,name,email");
  meUrl.searchParams.set("access_token", tokenJson.access_token);
  const userRes = await fetch(meUrl.toString());
  const user = (await userRes.json()) as { id?: string; name?: string; email?: string };
  if (!userRes.ok || !user.id || !user.email) throw new Error("oauth_profile_failed");
  return {
    subject: user.id,
    email: user.email.toLowerCase().trim(),
    emailVerified: true,
    name: user.name?.trim() || nameFromEmail(user.email),
  };
}

async function findIdentity(
  db: D1Database,
  provider: OAuthProvider,
  subject: string,
): Promise<{ user_id: string } | null> {
  return (
    (await db
      .prepare(
        `SELECT user_id FROM auth_identities
         WHERE provider = ? AND provider_subject = ?
         LIMIT 1`,
      )
      .bind(provider, subject)
      .first<{ user_id: string }>()) || null
  );
}

async function upsertOAuthUser(
  db: D1Database,
  provider: OAuthProvider,
  profile: OAuthProfile,
): Promise<{ id: string; email: string; password_hash: string; name: string; email_verified?: number; is_admin?: number; created_at: string }> {
  if (!profile.emailVerified) {
    throw new Error("oauth_email_unverified");
  }

  const existingIdentity = await findIdentity(db, provider, profile.subject);
  if (existingIdentity) {
    const user = await db
      .prepare(
        `SELECT id, email, password_hash, name, email_verified, is_admin, created_at
         FROM users WHERE id = ? LIMIT 1`,
      )
      .bind(existingIdentity.user_id)
      .first<{
        id: string;
        email: string;
        password_hash: string;
        name: string;
        email_verified?: number;
        is_admin?: number;
        created_at: string;
      }>();
    if (!user) throw new Error("oauth_user_missing");
    if (user.email_verified === 0 || (!user.name && profile.name)) {
      await db
        .prepare(
          `UPDATE users SET email_verified = 1, name = COALESCE(NULLIF(name, ''), ?) WHERE id = ?`,
        )
        .bind(profile.name, user.id)
        .run();
    }
    return (await db
      .prepare(
        `SELECT id, email, password_hash, name, email_verified, is_admin, created_at
         FROM users WHERE id = ? LIMIT 1`,
      )
      .bind(user.id)
      .first())!;
  }

  let user = await findUserByEmail(db, profile.email);
  if (!user) {
    const id = randomId();
    const passwordHash = await hashPassword(`oauth:${randomToken(32)}`);
    await db
      .prepare(
        `INSERT INTO users (id, email, password_hash, name, email_verified, is_admin, created_at)
         VALUES (?, ?, ?, ?, 1, 0, datetime('now'))`,
      )
      .bind(id, profile.email, passwordHash, profile.name)
      .run();
    user = (await findUserByEmail(db, profile.email))!;
  } else if (user.email_verified === 0) {
    await db
      .prepare(`UPDATE users SET email_verified = 1, name = COALESCE(NULLIF(name, ''), ?) WHERE id = ?`)
      .bind(profile.name, user.id)
      .run();
    user = (await findUserByEmail(db, profile.email))!;
  }

  await db
    .prepare(
      `INSERT INTO auth_identities (id, user_id, provider, provider_subject, email, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    )
    .bind(randomId(), user.id, provider, profile.subject, profile.email)
    .run();

  return user;
}

export async function handleOAuthStart(request: Request, env: D1Env, providerRaw: string): Promise<Response> {
  if (!isProvider(providerRaw)) {
    return json({ error: "Unsupported OAuth provider." }, 404);
  }

  const cfg = readProviderConfig(env, providerRaw);
  if (!cfg) {
    // Browser navigates here via window.location — redirect instead of JSON 503.
    return oauthConfigErrorRedirect(request, env);
  }

  const url = new URL(request.url);
  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));
  const state = await storeOAuthState(env.DB, providerRaw, returnTo);
  const authorizeUrl = buildAuthorizeUrl(providerRaw, cfg, redirectUri(request, env, providerRaw), state);
  return Response.redirect(authorizeUrl, 302);
}

export async function handleOAuthCallback(
  request: Request,
  env: D1Env,
  providerRaw: string,
): Promise<Response> {
  if (!isProvider(providerRaw)) {
    return loginErrorRedirect(request, env, "oauth_provider");
  }

  const url = new URL(request.url);
  const err = url.searchParams.get("error");
  if (err) return loginErrorRedirect(request, env, "oauth_denied");

  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  if (!code || !state) return loginErrorRedirect(request, env, "oauth_missing");

  const returnTo = await consumeOAuthState(env.DB, state, providerRaw);
  if (!returnTo) return loginErrorRedirect(request, env, "oauth_state");

  const cfg = readProviderConfig(env, providerRaw);
  if (!cfg) return loginErrorRedirect(request, env, "oauth_config");

  try {
    const profile = await exchangeCode(providerRaw, cfg, code, redirectUri(request, env, providerRaw));
    const user = await upsertOAuthUser(env.DB, providerRaw, profile);
    const { token, expiresAt } = await createSession(env.DB, user.id);
    const headers = new Headers();
    headers.append("Set-Cookie", sessionCookie(token, expiresAt, isSecureRequest(request), request));
    headers.set("Location", `${appOrigin(request, env)}${returnTo}`);
    return new Response(null, { status: 302, headers });
  } catch (e) {
    console.error("[bonlist-oauth] callback failed", e);
    const codeName =
      e instanceof Error && e.message.startsWith("oauth_") ? e.message : "oauth_failed";
    return loginErrorRedirect(request, env, codeName);
  }
}
