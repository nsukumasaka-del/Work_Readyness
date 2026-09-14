import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { and, eq } from "drizzle-orm";
import { db, webauthnCredentialsTable } from "@workspace/db";
import { getAppBaseUrl } from "./google-oauth";

function rpIdFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "localhost";
  }
}

export function getWebAuthnConfig() {
  const origin = getAppBaseUrl();
  return {
    rpName: "BonList",
    rpID: process.env.WEBAUTHN_RP_ID?.trim() || rpIdFromUrl(origin),
    origin: process.env.WEBAUTHN_ORIGIN?.trim() || origin,
  };
}

export function isPasskeysEnabled(): boolean {
  const flag = (process.env.WEBAUTHN_ENABLED || "true").trim().toLowerCase();
  return flag !== "0" && flag !== "false" && flag !== "no";
}

const challenges = new Map<string, { challenge: string; profileId?: number; expiresAt: number }>();

function storeChallenge(key: string, challenge: string, profileId?: number) {
  challenges.set(key, { challenge, profileId, expiresAt: Date.now() + 5 * 60 * 1000 });
}

function takeChallenge(key: string) {
  const entry = challenges.get(key);
  challenges.delete(key);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry;
}

export async function beginPasskeyRegistration(profileId: number, email: string, name: string) {
  const { rpName, rpID } = getWebAuthnConfig();
  const existing = await db
    .select()
    .from(webauthnCredentialsTable)
    .where(eq(webauthnCredentialsTable.profileId, profileId));

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: email,
    userDisplayName: name,
    userID: new TextEncoder().encode(String(profileId)),
    attestationType: "none",
    excludeCredentials: existing.map((cred) => ({
      id: cred.credentialId,
      transports: cred.transports ? (JSON.parse(cred.transports) as AuthenticatorTransport[]) : undefined,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  storeChallenge(`reg:${profileId}`, options.challenge, profileId);
  return options;
}

export async function finishPasskeyRegistration(
  profileId: number,
  response: RegistrationResponseJSON,
  nickname?: string,
) {
  const { rpID, origin } = getWebAuthnConfig();
  const expected = takeChallenge(`reg:${profileId}`);
  if (!expected) throw new Error("Passkey registration expired. Please try again.");

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: expected.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Could not verify passkey.");
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  await db.insert(webauthnCredentialsTable).values({
    profileId,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp ? 1 : 0,
    transports: credential.transports ? JSON.stringify(credential.transports) : null,
    nickname: nickname?.trim() || "Passkey",
  });
}

export async function beginPasskeyAuthentication(email?: string) {
  const { rpID } = getWebAuthnConfig();
  let allowCredentials: { id: string; transports?: AuthenticatorTransport[] }[] | undefined;

  if (email) {
    const { profilesTable } = await import("@workspace/db");
    const [profile] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.email, email.toLowerCase().trim()))
      .limit(1);
    if (profile) {
      const creds = await db
        .select()
        .from(webauthnCredentialsTable)
        .where(eq(webauthnCredentialsTable.profileId, profile.id));
      allowCredentials = creds.map((cred) => ({
        id: cred.credentialId,
        transports: cred.transports ? (JSON.parse(cred.transports) as AuthenticatorTransport[]) : undefined,
      }));
    }
  }

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials,
  });

  storeChallenge(`auth:${options.challenge}`, options.challenge);
  return options;
}

export async function finishPasskeyAuthentication(response: AuthenticationResponseJSON): Promise<number> {
  const { rpID, origin } = getWebAuthnConfig();
  const [cred] = await db
    .select()
    .from(webauthnCredentialsTable)
    .where(eq(webauthnCredentialsTable.credentialId, response.id))
    .limit(1);
  if (!cred) throw new Error("Passkey not recognized.");

  const clientData = JSON.parse(Buffer.from(response.response.clientDataJSON, "base64url").toString("utf8")) as {
    challenge: string;
  };
  const expected = takeChallenge(`auth:${clientData.challenge}`);
  if (!expected) throw new Error("Passkey sign-in expired. Please try again.");

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: expected.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: cred.credentialId,
      publicKey: Buffer.from(cred.publicKey, "base64url"),
      counter: cred.counter,
      transports: cred.transports ? (JSON.parse(cred.transports) as AuthenticatorTransport[]) : undefined,
    },
  });

  if (!verification.verified) throw new Error("Could not verify passkey.");

  await db
    .update(webauthnCredentialsTable)
    .set({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    })
    .where(eq(webauthnCredentialsTable.id, cred.id));

  return cred.profileId;
}

export async function listPasskeys(profileId: number) {
  const rows = await db
    .select()
    .from(webauthnCredentialsTable)
    .where(eq(webauthnCredentialsTable.profileId, profileId));
  return rows.map((row) => ({
    id: row.id,
    nickname: row.nickname || "Passkey",
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  }));
}

export async function deletePasskey(profileId: number, credentialRowId: number) {
  await db
    .delete(webauthnCredentialsTable)
    .where(and(eq(webauthnCredentialsTable.profileId, profileId), eq(webauthnCredentialsTable.id, credentialRowId)));
}
