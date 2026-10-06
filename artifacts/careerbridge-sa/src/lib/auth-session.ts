import type { UserProfile } from '@workspace/api-client-react';
import { apiUrl } from '@/lib/api-base';

const PROFILE_KEY = 'careerbridge-profile';
const SESSION_KEY = 'careerbridge-session-token';
const ADMIN_TOKEN_KEY = 'careerbridge-admin-token';
const ADMIN_FLAG_KEY = 'careerbridge-is-admin';
const NUDGE_KEY = 'careerbridge-security-nudge';
const SIGNED_OUT_KEY = 'bonlist-explicitly-signed-out';
export const AUTH_STORAGE_KEYS = [PROFILE_KEY, SESSION_KEY, ADMIN_TOKEN_KEY, ADMIN_FLAG_KEY, NUDGE_KEY, 'bonlist-profile',
  'careerbridge-report', 'bonlist-report', 'careerbridge-selected-job', 'bonlist-saved-jobs',
  'bonlist-unread-job-matches', 'bonlist-yoco-pending', 'bonlist-yoco-resume-download'] as const;
let signedOut = false;
let sessionGeneration = 0;
const sessionRequests = new Set<AbortController>();
export function isExplicitlySignedOut() { return signedOut || hasStoredValue(SIGNED_OUT_KEY, '1'); }

export type AuthSessionPayload = UserProfile & {
  sessionToken?: string;
  isAdmin?: boolean;
  adminToken?: string;
  adminName?: string;
  isPrimaryAdmin?: boolean;
  adminRequiresMfaSetup?: boolean;
  adminRequiresMfa?: boolean;
  adminMfaToken?: string;
  showSecurityNudge?: boolean;
  mfaEnabled?: boolean;
  emailVerified?: boolean;
};

function availableStores(): Storage[] {
  const stores: Storage[] = [];
  try { stores.push(localStorage); } catch { /* Storage may be blocked by browser policy. */ }
  try {
    const session = sessionStorage;
    if (!stores.includes(session)) stores.push(session);
  } catch { /* Keep the in-memory app usable when storage is unavailable. */ }
  return stores;
}

function readStoredValue(key: string): string | null {
  for (const store of availableStores()) {
    try {
      const value = store.getItem(key);
      if (value) return value;
    } catch { /* Try the other store if this one is inaccessible. */ }
  }
  return null;
}

function hasStoredValue(key: string, expected: string): boolean {
  return availableStores().some((store) => {
    try { return store.getItem(key) === expected; } catch { return false; }
  });
}

function writeStoredValue(key: string, value: string): void {
  for (const store of availableStores()) {
    try { store.setItem(key, value); } catch { /* Persistence is best-effort. */ }
  }
}

function removeStoredValue(key: string): void {
  for (const store of availableStores()) {
    try { store.removeItem(key); } catch { /* Clear any store that remains accessible. */ }
  }
}

export function readProfile(): UserProfile | null {
  if (isExplicitlySignedOut()) return null;
  try {
    const stored = readStoredValue(PROFILE_KEY);
    if (!stored) return null;
    const profile: unknown = JSON.parse(stored);
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null;
    const candidate = profile as Record<string, unknown>;
    if (typeof candidate.email !== 'string' || !candidate.email.trim() || !candidate.id ||
      (typeof candidate.id !== 'string' && typeof candidate.id !== 'number')) return null;
    return candidate as unknown as UserProfile;
  } catch {
    return null;
  }
}

export function hasProfile() {
  return Boolean(readProfile());
}

export function isAdminUser() {
  if (isExplicitlySignedOut()) return false;
  return (
    hasStoredValue(ADMIN_FLAG_KEY, '1') && Boolean(readStoredValue(ADMIN_TOKEN_KEY))
  );
}

export function getAdminToken(): string | null {
  if (isExplicitlySignedOut()) return null;
  return readStoredValue(ADMIN_TOKEN_KEY);
}

export function getSessionToken(): string | null {
  if (isExplicitlySignedOut()) return null;
  return readStoredValue(SESSION_KEY);
}

export function clearAuthSession() {
  signedOut = true;
  sessionGeneration++;
  writeStoredValue(SIGNED_OUT_KEY, '1');
  sessionRequests.forEach(controller => controller.abort());
  sessionRequests.clear();
  AUTH_STORAGE_KEYS.forEach(removeStoredValue);
  window.dispatchEvent(new Event('careerbridge-profile-updated'));
  window.dispatchEvent(new Event('bonlist-auth-signed-out'));
}

export function persistProfile(profile: UserProfile) {
  if (isExplicitlySignedOut()) return;
  const raw = JSON.stringify(profile);
  writeStoredValue(PROFILE_KEY, raw);
  // Drop legacy guest stub so CV generate never prefers a fake profileId: 1.
  try {
    removeStoredValue('bonlist-profile');
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event('careerbridge-profile-updated'));
}

export function persistAdminAccess(adminToken?: string, isAdmin?: boolean) {
  if (isExplicitlySignedOut()) return;
  if (isAdmin && adminToken) {
    writeStoredValue(ADMIN_TOKEN_KEY, adminToken);
    writeStoredValue(ADMIN_FLAG_KEY, '1');
    return;
  }
  removeStoredValue(ADMIN_TOKEN_KEY);
  removeStoredValue(ADMIN_FLAG_KEY);
}

export function persistSessionToken(token?: string, rememberMe = true) {
  if (isExplicitlySignedOut()) return;
  if (token) {
    try { sessionStorage.setItem(SESSION_KEY, token); } catch { /* session can remain available from local storage */ }
    try {
      if (rememberMe) localStorage.setItem(SESSION_KEY, token);
      else localStorage.removeItem(SESSION_KEY);
    } catch { /* Keep authentication usable for this tab when storage is blocked. */ }
    return;
  }
  removeStoredValue(SESSION_KEY);
}

export async function completeAuthSession(payload: AuthSessionPayload, rememberMe = true) {
  signedOut = false;
  removeStoredValue(SIGNED_OUT_KEY);
  persistSessionToken(payload.sessionToken, rememberMe);
  persistAdminAccess(payload.adminToken, Boolean(payload.isAdmin));
  // Profile listeners immediately fetch entitlements; publish only after auth is ready.
  persistProfile(payload);
  if (payload.showSecurityNudge) {
    writeStoredValue(NUDGE_KEY, '1');
  }
}

export function shouldShowSecurityNudge(): boolean {
  return readStoredValue(NUDGE_KEY) === '1';
}

export function dismissSecurityNudgeLocal() {
  removeStoredValue(NUDGE_KEY);
}

export function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = getSessionToken() || getAdminToken();
  const merged = extra instanceof Headers
    ? Object.fromEntries(extra.entries())
    : extra && typeof extra === 'object' && !Array.isArray(extra)
      ? { ...(extra as Record<string, string>) }
      : {};

  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...merged,
  };
}

export async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const generation = sessionGeneration;
  sessionRequests.add(controller);
  try {
    const authenticating = /\/auth\/(?:login|register|verify|exchange|magic-verify|mfa\/verify|passkey\/login\/verify)(?:$|\?)/.test(path);
    const response = await fetch(apiUrl(path), {
      ...init,
      credentials: isExplicitlySignedOut() && !authenticating ? 'omit' : 'include',
      headers: authHeaders(init?.headers),
      signal: init?.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal,
    });
    if (generation !== sessionGeneration) throw new DOMException('Session ended', 'AbortError');
    return response;
  } finally { sessionRequests.delete(controller); }
}

export async function readApiJson(response: Response): Promise<Record<string, any>> {
  const text = await response.text();
  if (response.status === 405) {
    throw new Error(
      'BonList API route is unavailable (HTTP 405). Please try again shortly or contact support if the problem continues.',
    );
  }
  if (!text.trim()) {
    throw new Error(
      response.ok
        ? 'Server returned an empty response. Please try again.'
        : `Request failed (${response.status}). Please try again.`,
    );
  }
  let payload: Record<string, any>;
  try {
    payload = JSON.parse(text) as Record<string, any>;
  } catch {
    throw new Error(`BonList returned an invalid service response (HTTP ${response.status}). Please try again shortly.`);
  }
  if (response.status === 503 && typeof payload.error === 'string') {
    throw new Error(payload.error);
  }
  return payload;
}

export function friendlyClientError(err: unknown, fallback = 'Something went wrong. Please try again.') {
  if (err instanceof Error && err.message && !/invalid_grant|oauth|jwt|constraint|sql/i.test(err.message)) {
    return err.message;
  }
  return fallback;
}
