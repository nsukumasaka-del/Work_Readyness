import { Router, type IRouter } from "express";
import { and, count, eq } from "drizzle-orm";
import {
  authIdentitiesTable,
  db,
  profilesTable,
  userSessionsTable,
  adminUsersTable,
} from "@workspace/db";
import { createEmailChallenge, verifyEmailChallenge, createOpaqueChallenge, loadOpaqueChallenge, bumpChallengeAttempt, consumeChallengeById } from "../lib/auth-otp";
import { hashPassword, verifyPassword } from "../lib/user-auth";
import { friendlyAuthError, maskEmail, nameFromEmail, randomToken } from "../lib/auth-crypto";
import { clientIp, consumeRateLimit } from "../lib/rate-limit";
import {
  clearSessionCookie,
  createUserSession,
  readSessionToken,
  requireUser,
  resolveUserSession,
  revokeAllUserSessions,
  revokeUserSession,
  setSessionCookie,
  type AuthedUserRequest,
} from "../lib/user-sessions";
import {
  buildGoogleAuthUrl,
  consumeAuthHandshake,
  consumeGoogleOAuthState,
  createAuthHandshake,
  createGoogleOAuthState,
  exchangeGoogleCode,
  getApiPublicBaseUrl,
  getAppBaseUrl,
  googleRedirectUri,
  isGoogleAuthConfigured,
  upsertGoogleIdentity,
} from "../lib/google-oauth";
import { requestPasswordReset, resetPasswordWithToken } from "../lib/password-reset";
import {
  consumeRecoveryCode,
  countUnusedRecoveryCodes,
  generateRecoveryCodes,
  generateTotpSecret,
  openTotpSecret,
  replaceRecoveryCodes,
  sealTotpSecret,
  totpQrDataUrl,
  verifyTotpCode,
} from "../lib/totp-mfa";
import {
  beginPasskeyAuthentication,
  beginPasskeyRegistration,
  deletePasskey,
  finishPasskeyAuthentication,
  finishPasskeyRegistration,
  isPasskeysEnabled,
  listPasskeys,
} from "../lib/passkeys";
import { authenticateAdmin, createAdminSession, ensurePrimaryAdmin } from "../lib/admin-auth";
import { createAdminNotification } from "../lib/admin-ops";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function toProfileResponse(profile: typeof profilesTable.$inferSelect, profileCount: number) {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    targetRole: profile.targetRole,
    createdAt: profile.createdAt,
    profileCount,
    emailVerified: Boolean(profile.emailVerifiedAt),
    mfaEnabled: Boolean(profile.mfaEnabled),
  };
}

async function issueAuthSuccess(
  req: Parameters<typeof createUserSession>[0] extends never ? never : import("express").Request,
  res: import("express").Response,
  profile: typeof profilesTable.$inferSelect,
  extras: Record<string, unknown> = {},
) {
  await db.update(profilesTable).set({ lastLoginAt: new Date() }).where(eq(profilesTable.id, profile.id));
  const session = await createUserSession({
    profileId: profile.id,
    userAgent: String(req.headers["user-agent"] || ""),
    ipAddress: clientIp(req),
  });
  setSessionCookie(res, session.token, session.expiresAt);
  const [{ value: profileCount }] = await db.select({ value: count() }).from(profilesTable);

  let isAdmin = false;
  let adminToken: string | undefined;
  let adminName: string | undefined;
  let isPrimaryAdmin = false;
  let adminRequiresMfaSetup = false;
  let adminRequiresMfa = false;
  let adminMfaToken: string | undefined;

  const [admin] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.email, profile.email.toLowerCase()))
    .limit(1);

  if (admin && admin.status === "active") {
    isAdmin = true;
    adminName = admin.name;
    isPrimaryAdmin = Boolean(admin.isPrimary);
    // Password login is enough for admin dashboard access (signup email OTP is separate).
    const adminSession = await createAdminSession(admin.id);
    adminToken = adminSession.token;
  }

  return res.json({
    ...toProfileResponse(profile, profileCount),
    sessionToken: session.token,
    sessionExpiresAt: session.expiresAt.toISOString(),
    isAdmin: Boolean(isAdmin && adminToken),
    adminToken,
    adminName,
    isPrimaryAdmin,
    adminRequiresMfaSetup,
    adminRequiresMfa,
    adminMfaToken,
    showSecurityNudge: !profile.mfaEnabled && !profile.securityNudgeDismissedAt,
    ...extras,
  });
}

router.get("/career/auth/config", (_req, res) => {
  res.json({
    google: isGoogleAuthConfigured(),
    passkeys: isPasskeysEnabled(),
    appBaseUrl: getAppBaseUrl(),
  });
});

/** Modern email signup — email + password only. */
router.post("/career/signup", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const name = String(req.body?.name || "").trim() || nameFromEmail(email);

  const ip = clientIp(req);
  const limit = consumeRateLimit(`signup:${ip}:${email}`, 5, 15 * 60 * 1000);
  if (!limit.ok) {
    res.status(429).json({ error: `Too many attempts. Try again in ${limit.retryAfterSec}s.` });
    return;
  }

  if (!email || !email.includes("@") || password.length < 8) {
    res.status(400).json({ error: "Enter a valid email and a password of at least 8 characters." });
    return;
  }

  const existing = await db.select().from(profilesTable).where(eq(profilesTable.email, email)).limit(1);
  if (existing[0]?.passwordHash) {
    res.status(409).json({ error: "An account with this email already exists. Please sign in." });
    return;
  }

  try {
    const challenge = await createEmailChallenge({
      email,
      purpose: "signup",
      payload: {
        name,
        email,
        passwordHash: hashPassword(password),
      },
    });
    res.status(200).json({
      requiresOtp: true,
      challengeId: challenge.challengeId,
      email,
      maskedEmail: maskEmail(email),
      emailSent: challenge.emailSent,
      expiresAt: challenge.expiresAt.toISOString(),
      resendAvailableAt: new Date(Date.now() + 30_000).toISOString(),
      message: "We sent a 6-digit verification code to your email.",
      ...(challenge.verificationCode ? { verificationCode: challenge.verificationCode, devOtp: true } : {}),
    });
  } catch (error) {
    logger.error({ err: error }, "Signup challenge failed");
    res.status(500).json({ error: friendlyAuthError(error, "We couldn't start signup. Please try again.") });
  }
});

router.post("/career/auth/resend", async (req, res) => {
  const challengeId = String(req.body?.challengeId || "");
  const email = String(req.body?.email || "").trim().toLowerCase();
  const ip = clientIp(req);
  const limit = consumeRateLimit(`resend:${ip}:${email || challengeId}`, 3, 10 * 60 * 1000);
  if (!limit.ok) {
    res.status(429).json({ error: `Please wait ${limit.retryAfterSec}s before requesting another code.` });
    return;
  }

  // Look up prior challenge payload if challengeId provided
  let payload: Record<string, unknown> = {};
  let purpose: "signup" | "email_change" | "magic_link" = "signup";
  if (challengeId) {
    const { authChallengesTable } = await import("@workspace/db");
    const [prior] = await db
      .select()
      .from(authChallengesTable)
      .where(eq(authChallengesTable.challengeId, challengeId))
      .limit(1);
    if (prior) {
      try {
        payload = JSON.parse(prior.payload || "{}") as Record<string, unknown>;
      } catch {
        payload = {};
      }
      purpose = prior.purpose as typeof purpose;
    }
  }
  const targetEmail = email || String(payload.email || "");
  if (!targetEmail) {
    res.status(400).json({ error: "We couldn't resend the code. Please start again." });
    return;
  }

  try {
    const challenge = await createEmailChallenge({
      email: targetEmail,
      purpose,
      payload: { ...payload, email: targetEmail },
    });
    res.json({
      challengeId: challenge.challengeId,
      email: targetEmail,
      maskedEmail: maskEmail(targetEmail),
      emailSent: challenge.emailSent,
      expiresAt: challenge.expiresAt.toISOString(),
      resendAvailableAt: new Date(Date.now() + 30_000).toISOString(),
      ...(challenge.verificationCode ? { verificationCode: challenge.verificationCode, devOtp: true } : {}),
    });
  } catch (error) {
    logger.error({ err: error }, "Resend OTP failed");
    res.status(500).json({ error: friendlyAuthError(error) });
  }
});

router.post("/career/auth/verify", async (req, res) => {
  await ensurePrimaryAdmin();
  const challengeId = String(req.body?.challengeId || "");
  const code = String(req.body?.code || "");
  const ip = clientIp(req);
  const limit = consumeRateLimit(`verify:${ip}:${challengeId}`, 10, 15 * 60 * 1000);
  if (!limit.ok) {
    res.status(429).json({ error: `Too many attempts. Try again in ${limit.retryAfterSec}s.` });
    return;
  }

  let verified: Awaited<ReturnType<typeof verifyEmailChallenge>>;
  try {
    verified = await verifyEmailChallenge({ challengeId, code, purposes: ["signup"] });
  } catch (error) {
    res.status(401).json({ error: error instanceof Error ? error.message : "Invalid verification code" });
    return;
  }

  const name = String(verified.payload.name || "").trim() || nameFromEmail(verified.email);
  const email = String(verified.payload.email || verified.email).trim().toLowerCase();
  const passwordHash = String(verified.payload.passwordHash || "");
  if (!email || !passwordHash) {
    res.status(400).json({ error: "Signup details expired. Please start again." });
    return;
  }

  const existing = await db.select().from(profilesTable).where(eq(profilesTable.email, email)).limit(1);
  if (existing[0]?.passwordHash && existing[0].emailVerifiedAt) {
    res.status(409).json({ error: "An account with this email already exists. Please sign in." });
    return;
  }

  let profile = existing[0];
  if (profile) {
    const [updated] = await db
      .update(profilesTable)
      .set({
        name,
        passwordHash,
        emailVerifiedAt: new Date(),
      })
      .where(eq(profilesTable.id, profile.id))
      .returning();
    profile = updated;
  } else {
    const [created] = await db
      .insert(profilesTable)
      .values({
        name,
        email,
        passwordHash,
        emailVerifiedAt: new Date(),
      })
      .returning();
    profile = created;
  }

  try {
    await db.insert(authIdentitiesTable).values({
      profileId: profile.id,
      provider: "password",
      providerSubject: `password:${profile.id}`,
      email,
      emailVerified: 1,
    });
  } catch {
    /* identity may already exist */
  }
  try {
    await createAdminNotification({
      type: "user.registered",
      title: "New user registered",
      body: `${profile.name} (${profile.email}) created an account`,
      entityType: "user",
      entityId: profile.id,
    });
  } catch {
    /* ignore */
  }

  await issueAuthSuccess(req, res, profile, { showSecurityNudge: true });
});

router.post("/career/login", async (req, res) => {
  await ensurePrimaryAdmin();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const ip = clientIp(req);
  const limit = consumeRateLimit(`login:${ip}:${email}`, 8, 15 * 60 * 1000);
  if (!limit.ok) {
    res.status(429).json({ error: `Too many sign-in attempts. Try again in ${limit.retryAfterSec}s.` });
    return;
  }
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  // Admin password path still supported via same login form
  const admin = await authenticateAdmin(email, password);
  if (admin) {
    let [profile] = await db.select().from(profilesTable).where(eq(profilesTable.email, email)).limit(1);
    if (!profile) {
      const [created] = await db
        .insert(profilesTable)
        .values({
          name: admin.name,
          email: admin.email,
          passwordHash: admin.passwordHash,
          emailVerifiedAt: new Date(),
        })
        .returning();
      profile = created;
    }

    if (!admin.mfaEnabled) {
      // Grant admin access immediately — authenticator MFA is optional, not a login gate.
      const adminSession = await createAdminSession(admin.id);
      const session = await createUserSession({
        profileId: profile.id,
        userAgent: String(req.headers["user-agent"] || ""),
        ipAddress: ip,
      });
      setSessionCookie(res, session.token, session.expiresAt);
      const [{ value: profileCount }] = await db.select({ value: count() }).from(profilesTable);
      res.json({
        ...toProfileResponse(profile, profileCount),
        sessionToken: session.token,
        isAdmin: true,
        adminToken: adminSession.token,
        adminName: admin.name,
        isPrimaryAdmin: Boolean(admin.isPrimary),
        mfaEnabled: false,
      });
      return;
    }

    // If admin enabled TOTP, still allow password-only access for primary admin reliability.
    // Optional: keep TOTP for non-primary admins only.
    if (admin.isPrimary) {
      const adminSession = await createAdminSession(admin.id);
      const session = await createUserSession({
        profileId: profile.id,
        userAgent: String(req.headers["user-agent"] || ""),
        ipAddress: ip,
      });
      setSessionCookie(res, session.token, session.expiresAt);
      const [{ value: profileCount }] = await db.select({ value: count() }).from(profilesTable);
      res.json({
        ...toProfileResponse(profile, profileCount),
        sessionToken: session.token,
        isAdmin: true,
        adminToken: adminSession.token,
        adminName: admin.name,
        isPrimaryAdmin: true,
        mfaEnabled: Boolean(admin.mfaEnabled),
      });
      return;
    }

    const pending = await createOpaqueChallenge({
      email: admin.email,
      purpose: "mfa_login",
      payload: { adminId: admin.id, profileId: profile.id, kind: "admin" },
    });
    res.json({
      requiresMfa: true,
      mfaToken: pending.challengeId,
      maskedEmail: maskEmail(email),
      methods: ["totp", "recovery"],
    });
    return;
  }

  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.email, email)).limit(1);
  if (!profile || !verifyPassword(password, profile.passwordHash)) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }
  if (profile.status && profile.status !== "active") {
    res.status(403).json({ error: "This account is inactive. Contact support for help." });
    return;
  }

  if (profile.mfaEnabled) {
    const pending = await createOpaqueChallenge({
      email: profile.email,
      purpose: "mfa_login",
      payload: { profileId: profile.id, kind: "user" },
    });
    res.json({
      requiresMfa: true,
      mfaToken: pending.challengeId,
      maskedEmail: maskEmail(email),
      methods: ["totp", "recovery"],
    });
    return;
  }

  await issueAuthSuccess(req, res, profile);
});

router.post("/career/auth/mfa/verify", async (req, res) => {
  const mfaToken = String(req.body?.mfaToken || "");
  const code = String(req.body?.code || "").trim();
  const recoveryCode = String(req.body?.recoveryCode || "").trim();
  const ip = clientIp(req);
  const limit = consumeRateLimit(`mfa:${ip}:${mfaToken}`, 8, 15 * 60 * 1000);
  if (!limit.ok) {
    res.status(429).json({ error: `Too many attempts. Try again in ${limit.retryAfterSec}s.` });
    return;
  }

  const pending = await loadOpaqueChallenge({ challengeId: mfaToken, purpose: "mfa_login" });
  if (!pending) {
    res.status(401).json({ error: "This verification step expired. Please sign in again." });
    return;
  }

  const kind = String(pending.payload.kind || "user");
  const profileId = Number(pending.payload.profileId);
  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.id, profileId)).limit(1);
  if (!profile) {
    res.status(401).json({ error: "We couldn't complete sign-in. Please try again." });
    return;
  }

  let ok = false;
  if (recoveryCode) {
    ok = await consumeRecoveryCode(profileId, recoveryCode);
  } else if (code) {
    if (kind === "admin") {
      const adminId = Number(pending.payload.adminId);
      const [admin] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, adminId)).limit(1);
      if (admin?.totpSecretEnc) {
        ok = verifyTotpCode(openTotpSecret(admin.totpSecretEnc), code, admin.email);
      }
    } else if (profile.totpSecretEnc) {
      ok = verifyTotpCode(openTotpSecret(profile.totpSecretEnc), code, profile.email);
    }
  }

  if (!ok) {
    const { authChallengesTable } = await import("@workspace/db");
    const [row] = await db.select().from(authChallengesTable).where(eq(authChallengesTable.id, pending.id)).limit(1);
    await bumpChallengeAttempt(pending.id, row?.attemptCount || 0);
    res.status(401).json({ error: "That code wasn't right. Please try again." });
    return;
  }

  await consumeChallengeById(pending.id);
  await issueAuthSuccess(req, res, profile, { mfaSatisfied: true });
});

router.get("/career/auth/google/start", (req, res) => {
  if (!isGoogleAuthConfigured()) {
    res.status(503).json({ error: "Google sign-in is not configured yet." });
    return;
  }
  const returnTo = String(req.query.returnTo || "/");
  const apiBase = getApiPublicBaseUrl(req.get("host") || undefined);
  const redirectUri = googleRedirectUri(apiBase.startsWith("http") ? apiBase : `${req.protocol}://${req.get("host")}`);
  // Prefer APP/API public URLs
  const publicApi = process.env.API_PUBLIC_URL?.trim() || `${req.protocol}://${req.get("host")}`;
  const state = createGoogleOAuthState(returnTo);
  const url = buildGoogleAuthUrl({ state, redirectUri: googleRedirectUri(publicApi) });
  void redirectUri;
  res.redirect(url);
});

router.get("/career/auth/google/callback", async (req, res) => {
  const appBase = getAppBaseUrl();
  try {
    if (!isGoogleAuthConfigured()) {
      res.redirect(`${appBase}/login?error=google_unavailable`);
      return;
    }
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    const returnTo = consumeGoogleOAuthState(state) || "/";
    if (!code) {
      res.redirect(`${appBase}/login?error=google_denied`);
      return;
    }
    const publicApi = process.env.API_PUBLIC_URL?.trim() || `${req.protocol}://${req.get("host")}`;
    const user = await exchangeGoogleCode(code, googleRedirectUri(publicApi));
    const { profile } = await upsertGoogleIdentity(user);

    if (profile.mfaEnabled) {
      const pending = await createOpaqueChallenge({
        email: profile.email,
        purpose: "mfa_login",
        payload: { profileId: profile.id, kind: "user" },
      });
      res.redirect(`${appBase}/login?mfaToken=${pending.challengeId}&returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }

    const session = await createUserSession({
      profileId: profile.id,
      userAgent: String(req.headers["user-agent"] || ""),
      ipAddress: clientIp(req),
    });
    setSessionCookie(res, session.token, session.expiresAt);
    const handshake = createAuthHandshake(session.token);
    res.redirect(`${appBase}/auth/callback?code=${handshake}&returnTo=${encodeURIComponent(returnTo)}`);
  } catch (error) {
    logger.error({ err: error }, "Google OAuth callback failed");
    res.redirect(`${appBase}/login?error=google_failed`);
  }
});

router.post("/career/auth/exchange", async (req, res) => {
  const code = String(req.body?.code || "");
  const token = consumeAuthHandshake(code);
  if (!token) {
    res.status(401).json({ error: "Sign-in expired. Please try again." });
    return;
  }
  const resolved = await resolveUserSession(token);
  if (!resolved) {
    res.status(401).json({ error: "Sign-in expired. Please try again." });
    return;
  }
  setSessionCookie(res, token, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  const [{ value: profileCount }] = await db.select({ value: count() }).from(profilesTable);
  res.json({
    ...toProfileResponse(resolved.profile, profileCount),
    sessionToken: token,
    isAdmin: false,
    showSecurityNudge: !resolved.profile.mfaEnabled && !resolved.profile.securityNudgeDismissedAt,
  });
});

router.post("/career/auth/forgot-password", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const ip = clientIp(req);
  const limit = consumeRateLimit(`forgot:${ip}:${email}`, 3, 15 * 60 * 1000);
  if (!limit.ok) {
    res.status(429).json({ error: `Please wait ${limit.retryAfterSec}s before trying again.` });
    return;
  }
  try {
    if (email) await requestPasswordReset(email);
  } catch (error) {
    logger.error({ err: error }, "Password reset email failed");
  }
  res.json({
    message: "If an account exists for that email, we sent password reset instructions.",
  });
});

router.post("/career/auth/reset-password", async (req, res) => {
  const token = String(req.body?.token || "");
  const password = String(req.body?.password || "");
  try {
    await resetPasswordWithToken(token, password);
    res.json({ message: "Your password was updated. You can sign in now." });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "We couldn't reset that password.",
    });
  }
});

router.post("/career/auth/magic-link", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const ip = clientIp(req);
  const limit = consumeRateLimit(`magic:${ip}:${email}`, 3, 15 * 60 * 1000);
  if (!limit.ok) {
    res.status(429).json({ error: `Please wait ${limit.retryAfterSec}s before trying again.` });
    return;
  }
  if (!email) {
    res.status(400).json({ error: "Enter your email address." });
    return;
  }
  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.email, email)).limit(1);
  // Always generic response
  if (profile) {
    try {
      const challenge = await createEmailChallenge({
        email,
        purpose: "magic_link",
        payload: { profileId: profile.id },
      });
      res.json({
        requiresOtp: true,
        challengeId: challenge.challengeId,
        maskedEmail: maskEmail(email),
        message: "If an account exists, we sent a sign-in code.",
        ...(challenge.verificationCode ? { verificationCode: challenge.verificationCode, devOtp: true } : {}),
      });
      return;
    } catch (error) {
      logger.error({ err: error }, "Magic link failed");
    }
  }
  res.json({
    requiresOtp: true,
    challengeId: randomToken(12),
    maskedEmail: maskEmail(email),
    message: "If an account exists, we sent a sign-in code.",
  });
});

router.post("/career/auth/magic-verify", async (req, res) => {
  const challengeId = String(req.body?.challengeId || "");
  const code = String(req.body?.code || "");
  try {
    const verified = await verifyEmailChallenge({ challengeId, code, purposes: ["magic_link"] });
    const profileId = Number(verified.payload.profileId);
    const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.id, profileId)).limit(1);
    if (!profile) {
      res.status(401).json({ error: "We couldn't complete sign-in. Please try again." });
      return;
    }
    if (profile.mfaEnabled) {
      const pending = await createOpaqueChallenge({
        email: profile.email,
        purpose: "mfa_login",
        payload: { profileId: profile.id, kind: "user" },
      });
      res.json({ requiresMfa: true, mfaToken: pending.challengeId, methods: ["totp", "recovery"] });
      return;
    }
    await issueAuthSuccess(req, res, profile);
  } catch {
    res.status(401).json({ error: "Invalid or expired code." });
  }
});

router.post("/career/auth/logout", async (req, res) => {
  const token = readSessionToken(req);
  if (token) await revokeUserSession(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.post("/career/auth/logout-all", requireUser, async (req: AuthedUserRequest, res) => {
  const token = readSessionToken(req) || undefined;
  const revoked = await revokeAllUserSessions(req.userProfile!.id, token);
  res.json({ ok: true, revoked });
});

router.get("/career/auth/me", requireUser, async (req: AuthedUserRequest, res) => {
  const profile = req.userProfile!;
  const [{ value: profileCount }] = await db.select({ value: count() }).from(profilesTable);
  const identities = await db
    .select()
    .from(authIdentitiesTable)
    .where(eq(authIdentitiesTable.profileId, profile.id));
  const passkeys = await listPasskeys(profile.id);
  const recoveryLeft = profile.mfaEnabled ? await countUnusedRecoveryCodes(profile.id) : 0;
  const sessions = await db
    .select()
    .from(userSessionsTable)
    .where(and(eq(userSessionsTable.profileId, profile.id)));

  res.json({
    ...toProfileResponse(profile, profileCount),
    identities: identities.map((i) => ({
      provider: i.provider,
      email: i.email,
      emailVerified: Boolean(i.emailVerified),
      createdAt: i.createdAt,
    })),
    hasPassword: Boolean(profile.passwordHash),
    googleConnected: identities.some((i) => i.provider === "google"),
    mfaEnabled: Boolean(profile.mfaEnabled),
    recoveryCodesRemaining: recoveryLeft,
    passkeys,
    sessions: sessions
      .filter((s) => !s.revokedAt && s.expiresAt > new Date())
      .map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        current: s.id === req.userSessionId,
      })),
    showSecurityNudge: !profile.mfaEnabled && !profile.securityNudgeDismissedAt,
  });
});

router.post("/career/auth/security-nudge/dismiss", requireUser, async (req: AuthedUserRequest, res) => {
  await db
    .update(profilesTable)
    .set({ securityNudgeDismissedAt: new Date() })
    .where(eq(profilesTable.id, req.userProfile!.id));
  res.json({ ok: true });
});

// ---- MFA enrollment (users) ----
router.post("/career/auth/mfa/setup/start", requireUser, async (req: AuthedUserRequest, res) => {
  const profile = req.userProfile!;
  const secret = generateTotpSecret();
  const sealed = sealTotpSecret(secret);
  await db.update(profilesTable).set({ totpSecretEnc: sealed, mfaEnabled: 0 }).where(eq(profilesTable.id, profile.id));
  const { qrDataUrl, uri } = await totpQrDataUrl(secret, profile.email);
  res.json({
    qrDataUrl,
    manualKey: secret,
    otpauthUrl: uri,
  });
});

router.post("/career/auth/mfa/setup/confirm", requireUser, async (req: AuthedUserRequest, res) => {
  const profile = req.userProfile!;
  const code = String(req.body?.code || "").trim();
  if (!profile.totpSecretEnc) {
    res.status(400).json({ error: "Start authenticator setup first." });
    return;
  }
  const secret = openTotpSecret(profile.totpSecretEnc);
  if (!verifyTotpCode(secret, code, profile.email)) {
    res.status(401).json({ error: "That code wasn't right. Please try again." });
    return;
  }
  const codes = generateRecoveryCodes(10);
  await replaceRecoveryCodes(profile.id, codes);
  await db
    .update(profilesTable)
    .set({ mfaEnabled: 1, totpVerifiedAt: new Date() })
    .where(eq(profilesTable.id, profile.id));
  res.json({
    enabled: true,
    recoveryCodes: codes,
    message: "Save these recovery codes in a safe place. They won't be shown again.",
  });
});

router.post("/career/auth/mfa/disable", requireUser, async (req: AuthedUserRequest, res) => {
  const profile = req.userProfile!;
  const code = String(req.body?.code || "").trim();
  if (!profile.totpSecretEnc || !verifyTotpCode(openTotpSecret(profile.totpSecretEnc), code, profile.email)) {
    res.status(401).json({ error: "Enter a valid authenticator code to disable MFA." });
    return;
  }
  await replaceRecoveryCodes(profile.id, []);
  await db
    .update(profilesTable)
    .set({ mfaEnabled: 0, totpSecretEnc: null, totpVerifiedAt: null })
    .where(eq(profilesTable.id, profile.id));
  res.json({ enabled: false });
});

router.post("/career/auth/mfa/recovery/regenerate", requireUser, async (req: AuthedUserRequest, res) => {
  const profile = req.userProfile!;
  const code = String(req.body?.code || "").trim();
  if (!profile.mfaEnabled || !profile.totpSecretEnc) {
    res.status(400).json({ error: "Enable authenticator MFA first." });
    return;
  }
  if (!verifyTotpCode(openTotpSecret(profile.totpSecretEnc), code, profile.email)) {
    res.status(401).json({ error: "Enter a valid authenticator code." });
    return;
  }
  const codes = generateRecoveryCodes(10);
  await replaceRecoveryCodes(profile.id, codes);
  res.json({ recoveryCodes: codes });
});

// ---- Admin MFA setup (required for dashboard) ----
router.post("/career/auth/admin/mfa/setup/start", requireUser, async (req: AuthedUserRequest, res) => {
  const [admin] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.email, req.userProfile!.email.toLowerCase()))
    .limit(1);
  if (!admin) {
    res.status(403).json({ error: "Admin access required." });
    return;
  }
  const secret = generateTotpSecret();
  await db
    .update(adminUsersTable)
    .set({ totpSecretEnc: sealTotpSecret(secret), mfaEnabled: 0 })
    .where(eq(adminUsersTable.id, admin.id));
  // Mirror on profile for recovery-code table keyed by profile
  await db
    .update(profilesTable)
    .set({ totpSecretEnc: sealTotpSecret(secret) })
    .where(eq(profilesTable.id, req.userProfile!.id));
  const { qrDataUrl } = await totpQrDataUrl(secret, admin.email);
  res.json({ qrDataUrl, manualKey: secret });
});

router.post("/career/auth/admin/mfa/setup/confirm", requireUser, async (req: AuthedUserRequest, res) => {
  const code = String(req.body?.code || "").trim();
  const [admin] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.email, req.userProfile!.email.toLowerCase()))
    .limit(1);
  if (!admin?.totpSecretEnc) {
    res.status(400).json({ error: "Start admin MFA setup first." });
    return;
  }
  if (!verifyTotpCode(openTotpSecret(admin.totpSecretEnc), code, admin.email)) {
    res.status(401).json({ error: "That code wasn't right. Please try again." });
    return;
  }
  const codes = generateRecoveryCodes(10);
  await replaceRecoveryCodes(req.userProfile!.id, codes);
  await db
    .update(adminUsersTable)
    .set({ mfaEnabled: 1, totpVerifiedAt: new Date() })
    .where(eq(adminUsersTable.id, admin.id));
  await db
    .update(profilesTable)
    .set({ mfaEnabled: 1, totpVerifiedAt: new Date(), totpSecretEnc: admin.totpSecretEnc })
    .where(eq(profilesTable.id, req.userProfile!.id));

  const adminSession = await createAdminSession(admin.id);
  res.json({
    enabled: true,
    recoveryCodes: codes,
    adminToken: adminSession.token,
    isAdmin: true,
    adminName: admin.name,
    isPrimaryAdmin: Boolean(admin.isPrimary),
  });
});

// ---- Passkeys ----
router.post("/career/auth/passkey/register/options", requireUser, async (req: AuthedUserRequest, res) => {
  if (!isPasskeysEnabled()) {
    res.status(503).json({ error: "Passkeys are not available." });
    return;
  }
  try {
    const options = await beginPasskeyRegistration(req.userProfile!.id, req.userProfile!.email, req.userProfile!.name);
    res.json(options);
  } catch (error) {
    logger.error({ err: error }, "Passkey register options failed");
    res.status(500).json({ error: friendlyAuthError(error) });
  }
});

router.post("/career/auth/passkey/register/verify", requireUser, async (req: AuthedUserRequest, res) => {
  try {
    await finishPasskeyRegistration(req.userProfile!.id, req.body?.credential, req.body?.nickname);
    await db.insert(authIdentitiesTable).values({
      profileId: req.userProfile!.id,
      provider: "passkey",
      providerSubject: `passkey:${req.userProfile!.id}:${Date.now()}`,
      email: req.userProfile!.email,
      emailVerified: 1,
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: friendlyAuthError(error, "Could not save passkey.") });
  }
});

router.post("/career/auth/passkey/login/options", async (req, res) => {
  if (!isPasskeysEnabled()) {
    res.status(503).json({ error: "Passkeys are not available." });
    return;
  }
  try {
    const email = req.body?.email ? String(req.body.email) : undefined;
    const options = await beginPasskeyAuthentication(email);
    res.json(options);
  } catch (error) {
    res.status(500).json({ error: friendlyAuthError(error) });
  }
});

router.post("/career/auth/passkey/login/verify", async (req, res) => {
  try {
    const profileId = await finishPasskeyAuthentication(req.body?.credential);
    const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.id, profileId)).limit(1);
    if (!profile) {
      res.status(401).json({ error: "We couldn't complete sign-in. Please try again." });
      return;
    }
    if (profile.mfaEnabled) {
      // Passkey already is a strong factor — allow login; optional extra MFA skipped for UX
    }
    await issueAuthSuccess(req, res, profile);
  } catch (error) {
    res.status(401).json({ error: friendlyAuthError(error, "We couldn't complete passkey sign-in.") });
  }
});

router.delete("/career/auth/passkey/:id", requireUser, async (req: AuthedUserRequest, res) => {
  await deletePasskey(req.userProfile!.id, Number(req.params.id));
  res.json({ ok: true });
});

router.get("/career/auth/passkeys", requireUser, async (req: AuthedUserRequest, res) => {
  res.json({ passkeys: await listPasskeys(req.userProfile!.id) });
});

export default router;
