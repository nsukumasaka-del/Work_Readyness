import { and, eq, gt, isNull } from "drizzle-orm";
import { db, userSessionsTable, type Profile } from "@workspace/db";
import type { NextFunction, Request, Response } from "express";
import { randomToken, sha256Hex } from "./auth-crypto";

const SESSION_DAYS = 30;
export const USER_SESSION_COOKIE = "bonlist_session";

export type AuthedUserRequest = Request & {
  userProfile?: Profile;
  userSessionId?: number;
};

export async function createUserSession(input: {
  profileId: number;
  userAgent?: string;
  ipAddress?: string;
}): Promise<{ token: string; expiresAt: Date; sessionId: number }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const [row] = await db
    .insert(userSessionsTable)
    .values({
      profileId: input.profileId,
      tokenHash: sha256Hex(token),
      userAgent: input.userAgent?.slice(0, 400) || null,
      ipAddress: input.ipAddress?.slice(0, 80) || null,
      expiresAt,
      lastSeenAt: new Date(),
    })
    .returning();
  return { token, expiresAt, sessionId: row.id };
}

export async function revokeUserSession(token: string): Promise<void> {
  await db
    .update(userSessionsTable)
    .set({ revokedAt: new Date() })
    .where(eq(userSessionsTable.tokenHash, sha256Hex(token)));
}

export async function revokeAllUserSessions(profileId: number, exceptToken?: string): Promise<number> {
  const sessions = await db
    .select()
    .from(userSessionsTable)
    .where(and(eq(userSessionsTable.profileId, profileId), isNull(userSessionsTable.revokedAt)));
  const exceptHash = exceptToken ? sha256Hex(exceptToken) : null;
  let count = 0;
  for (const session of sessions) {
    if (exceptHash && session.tokenHash === exceptHash) continue;
    await db
      .update(userSessionsTable)
      .set({ revokedAt: new Date() })
      .where(eq(userSessionsTable.id, session.id));
    count += 1;
  }
  return count;
}

export function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export function readSessionToken(req: Request): string | null {
  const bearer = readBearerToken(req);
  if (bearer) return bearer;
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[USER_SESSION_COOKIE];
  return cookie?.trim() || null;
}

export async function resolveUserSession(token: string): Promise<{ profile: Profile; sessionId: number } | null> {
  const [session] = await db
    .select()
    .from(userSessionsTable)
    .where(
      and(
        eq(userSessionsTable.tokenHash, sha256Hex(token)),
        isNull(userSessionsTable.revokedAt),
        gt(userSessionsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!session) return null;

  const { profilesTable } = await import("@workspace/db");
  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.id, session.profileId))
    .limit(1);
  if (!profile || (profile.status && profile.status !== "active")) return null;

  await db
    .update(userSessionsTable)
    .set({ lastSeenAt: new Date() })
    .where(eq(userSessionsTable.id, session.id));

  return { profile, sessionId: session.id };
}

export async function requireUser(req: AuthedUserRequest, res: Response, next: NextFunction) {
  try {
    const token = readSessionToken(req);
    if (!token) {
      res.status(401).json({ error: "Please sign in to continue." });
      return;
    }
    const resolved = await resolveUserSession(token);
    if (!resolved) {
      res.status(401).json({ error: "Your session has expired. Please sign in again." });
      return;
    }
    req.userProfile = resolved.profile;
    req.userSessionId = resolved.sessionId;
    next();
  } catch {
    res.status(401).json({ error: "Please sign in to continue." });
  }
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  const secure = (process.env.COOKIE_SECURE || "").toLowerCase() === "true" || process.env.NODE_ENV === "production";
  res.cookie(USER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    expires: expiresAt,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(USER_SESSION_COOKIE, { path: "/" });
}
