import type { UserProfile } from '@workspace/api-client-react';
import { apiUrl } from '@/lib/api-base';

const PROFILE_KEY = 'careerbridge-profile';
const SESSION_KEY = 'careerbridge-session-token';
const ADMIN_TOKEN_KEY = 'careerbridge-admin-token';
const ADMIN_FLAG_KEY = 'careerbridge-is-admin';
const NUDGE_KEY = 'careerbridge-security-nudge';

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
  try {
    const stored = readStoredValue(PROFILE_KEY);
    return stored ? (JSON.parse(stored) as UserProfile) : null;
  } catch {
    return null;
  }
}

export function hasProfile() {
  return Boolean(readProfile());
}

export function isAdminUser() {
  return (
    hasStoredValue(ADMIN_FLAG_KEY, '1') && Boolean(readStoredValue(ADMIN_TOKEN_KEY))
  );
}

export function getAdminToken(): string | null {
  return readStoredValue(ADMIN_TOKEN_KEY);
}

export function getSessionToken(): string | null {
  return readStoredValue(SESSION_KEY);
}

export function clearAuthSession() {
  [PROFILE_KEY, SESSION_KEY, ADMIN_TOKEN_KEY, ADMIN_FLAG_KEY].forEach(removeStoredValue);
  try {
    sessionStorage.removeItem('careerbridge-report');
    sessionStorage.removeItem('bonlist-report');
    sessionStorage.removeItem('careerbridge-selected-job');
  } catch { /* Storage may be blocked; auth state is already handled in memory. */ }
}

export function persistProfile(profile: UserProfile) {
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
  if (isAdmin && adminToken) {
    writeStoredValue(ADMIN_TOKEN_KEY, adminToken);
    writeStoredValue(ADMIN_FLAG_KEY, '1');
    return;
  }
  removeStoredValue(ADMIN_TOKEN_KEY);
  removeStoredValue(ADMIN_FLAG_KEY);
}

export function persistSessionToken(token?: string, rememberMe = true) {
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
  persistProfile(payload);
  persistSessionToken(payload.sessionToken, rememberMe);
  persistAdminAccess(payload.adminToken, Boolean(payload.isAdmin));
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
  return fetch(apiUrl(path), {
    ...init,
    credentials: 'include',
    headers: authHeaders(init?.headers),
  });
}

export async function readApiJson(response: Response): Promise<Record<string, any>> {
  const text = await response.text();
  if (response.status === 405) {
    throw new Error(
      'BonList API is not reachable on this site (HTTP 405). The website is online, but the API server is not connected. Start the API locally with pnpm dev, or set API_UPSTREAM_URL on Cloudflare to your API host.',
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
    throw new Error('We could not reach the BonList service. Please try again.');
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
