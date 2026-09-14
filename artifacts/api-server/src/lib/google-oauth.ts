import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { authIdentitiesTable, db, profilesTable } from "@workspace/db";
import { nameFromEmail, randomToken } from "./auth-crypto";
import { logger } from "./logger";

export function isGoogleAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function getAppBaseUrl(): string {
  return (
    process.env.APP_BASE_URL?.trim() ||
    process.env.LIVE_APP_URL?.trim() ||
    process.env.PUBLIC_APP_URL?.trim() ||
    "http://127.0.0.1:19678"
  ).replace(/\/$/, "");
}

export function getApiPublicBaseUrl(reqHost?: string): string {
  if (process.env.API_PUBLIC_URL?.trim()) {
    return process.env.API_PUBLIC_URL.trim().replace(/\/$/, "");
  }
  if (reqHost) return `https://${reqHost}`.replace(/\/$/, "");
  return getAppBaseUrl();
}

export function googleRedirectUri(apiBase: string): string {
  return `${apiBase.replace(/\/$/, "")}/api/career/auth/google/callback`;
}

const pendingStates = new Map<string, { createdAt: number; returnTo: string }>();

export function createGoogleOAuthState(returnTo: string): string {
  const state = randomToken(24);
  pendingStates.set(state, { createdAt: Date.now(), returnTo });
  // prune old
  for (const [key, value] of pendingStates) {
    if (Date.now() - value.createdAt > 15 * 60 * 1000) pendingStates.delete(key);
  }
  return state;
}

export function consumeGoogleOAuthState(state: string): string | null {
  const entry = pendingStates.get(state);
  pendingStates.delete(state);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > 15 * 60 * 1000) return null;
  return entry.returnTo || "/";
}

export function buildGoogleAuthUrl(input: { state: string; redirectUri: string }): string {
  const clientId = process.env.GOOGLE_CLIENT_ID!.trim();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    include_granted_scopes: "true",
    prompt: "select_account",
    state: input.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

type GoogleTokenResponse = {
  access_token?: string;
  id_token?: string;
  error?: string;
};

type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
};

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<GoogleUserInfo> {
  const clientId = process.env.GOOGLE_CLIENT_ID!.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!.trim();

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokenJson = (await tokenRes.json()) as GoogleTokenResponse;
  if (!tokenRes.ok || !tokenJson.access_token) {
    logger.warn({ status: tokenRes.status }, "Google token exchange failed");
    throw new Error("google_token_failed");
  }

  const userRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const user = (await userRes.json()) as GoogleUserInfo;
  if (!userRes.ok || !user.sub || !user.email) {
    throw new Error("google_userinfo_failed");
  }
  return user;
}

/**
 * Find or create a BonList profile for a verified Google identity.
 * Links to an existing email/password account when emails match and Google email is verified.
 */
export async function upsertGoogleIdentity(user: GoogleUserInfo): Promise<{
  profile: typeof profilesTable.$inferSelect;
  linkedExisting: boolean;
  created: boolean;
}> {
  const email = user.email.toLowerCase().trim();
  const emailVerified = Boolean(user.email_verified);

  const [identity] = await db
    .select()
    .from(authIdentitiesTable)
    .where(and(eq(authIdentitiesTable.provider, "google"), eq(authIdentitiesTable.providerSubject, user.sub)))
    .limit(1);

  if (identity) {
    const [profile] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.id, identity.profileId))
      .limit(1);
    if (!profile) throw new Error("google_profile_missing");
    return { profile, linkedExisting: false, created: false };
  }

  // Link to existing account only when Google email is verified.
  let profile: typeof profilesTable.$inferSelect | undefined;
  let linkedExisting = false;
  let created = false;

  if (emailVerified) {
    const [existing] = await db.select().from(profilesTable).where(eq(profilesTable.email, email)).limit(1);
    if (existing) {
      profile = existing;
      linkedExisting = true;
      if (!existing.emailVerifiedAt) {
        await db
          .update(profilesTable)
          .set({ emailVerifiedAt: new Date(), name: existing.name || user.name || nameFromEmail(email) })
          .where(eq(profilesTable.id, existing.id));
        const [refreshed] = await db.select().from(profilesTable).where(eq(profilesTable.id, existing.id)).limit(1);
        profile = refreshed!;
      }
    }
  }

  if (!profile) {
    if (!emailVerified) {
      throw new Error("google_email_unverified");
    }
    const [createdProfile] = await db
      .insert(profilesTable)
      .values({
        name: user.name?.trim() || nameFromEmail(email),
        email,
        emailVerifiedAt: new Date(),
        status: "active",
      })
      .returning();
    profile = createdProfile;
    created = true;
  }

  await db.insert(authIdentitiesTable).values({
    profileId: profile.id,
    provider: "google",
    providerSubject: user.sub,
    email,
    emailVerified: emailVerified ? 1 : 0,
  });

  // Ensure password identity marker exists if they already had a password.
  if (profile.passwordHash) {
    const [pwd] = await db
      .select()
      .from(authIdentitiesTable)
      .where(and(eq(authIdentitiesTable.profileId, profile.id), eq(authIdentitiesTable.provider, "password")))
      .limit(1);
    if (!pwd) {
      await db.insert(authIdentitiesTable).values({
        profileId: profile.id,
        provider: "password",
        providerSubject: `password:${profile.id}`,
        email: profile.email,
        emailVerified: profile.emailVerifiedAt ? 1 : 0,
      });
    }
  }

  return { profile, linkedExisting, created };
}

/** One-time handshake codes so the session token is not left in browser history forever. */
const handshakeCodes = new Map<string, { sessionToken: string; expiresAt: number }>();

export function createAuthHandshake(sessionToken: string): string {
  const code = randomBytes(24).toString("hex");
  handshakeCodes.set(code, { sessionToken, expiresAt: Date.now() + 2 * 60 * 1000 });
  for (const [key, value] of handshakeCodes) {
    if (value.expiresAt < Date.now()) handshakeCodes.delete(key);
  }
  return code;
}

export function consumeAuthHandshake(code: string): string | null {
  const entry = handshakeCodes.get(code);
  handshakeCodes.delete(code);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.sessionToken;
}
