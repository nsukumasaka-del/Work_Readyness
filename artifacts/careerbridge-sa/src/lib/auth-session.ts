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

function storage(): Storage {
  try {
    return localStorage;
  } catch {
    return sessionStorage;
  }
}

export function readProfile(): UserProfile | null {
  try {
    const stored = storage().getItem(PROFILE_KEY) || sessionStorage.getItem(PROFILE_KEY);
    return stored ? (JSON.parse(stored) as UserProfile) : null;
  } catch {
    return null;
  }
}

export function hasProfile() {
  return Boolean(readProfile());
}

export function isAdminUser() {
  const store = storage();
  return (
    (store.getItem(ADMIN_FLAG_KEY) === '1' || sessionStorage.getItem(ADMIN_FLAG_KEY) === '1') &&
    Boolean(store.getItem(ADMIN_TOKEN_KEY) || sessionStorage.getItem(ADMIN_TOKEN_KEY))
  );
}

export function getAdminToken(): string | null {
  return storage().getItem(ADMIN_TOKEN_KEY) || sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

export function getSessionToken(): string | null {
  return storage().getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
}

export function clearAuthSession() {
  for (const store of [storage(), sessionStorage]) {
    store.removeItem(PROFILE_KEY);
    store.removeItem(SESSION_KEY);
    store.removeItem(ADMIN_TOKEN_KEY);
    store.removeItem(ADMIN_FLAG_KEY);
  }
  sessionStorage.removeItem('careerbridge-report');
  sessionStorage.removeItem('bonlist-report');
  sessionStorage.removeItem('careerbridge-selected-job');
}

export function persistProfile(profile: UserProfile) {
  const raw = JSON.stringify(profile);
  storage().setItem(PROFILE_KEY, raw);
  sessionStorage.setItem(PROFILE_KEY, raw);
  // Drop legacy guest stub so CV generate never prefers a fake profileId: 1.
  try {
    sessionStorage.removeItem('bonlist-profile');
    storage().removeItem('bonlist-profile');
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event('careerbridge-profile-updated'));
}

export function persistAdminAccess(adminToken?: string, isAdmin?: boolean) {
  if (isAdmin && adminToken) {
    storage().setItem(ADMIN_TOKEN_KEY, adminToken);
    storage().setItem(ADMIN_FLAG_KEY, '1');
    sessionStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
    sessionStorage.setItem(ADMIN_FLAG_KEY, '1');
    return;
  }
  storage().removeItem(ADMIN_TOKEN_KEY);
  storage().removeItem(ADMIN_FLAG_KEY);
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_FLAG_KEY);
}

export function persistSessionToken(token?: string) {
  if (token) {
    storage().setItem(SESSION_KEY, token);
    sessionStorage.setItem(SESSION_KEY, token);
    return;
  }
  storage().removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

export async function completeAuthSession(payload: AuthSessionPayload) {
  persistProfile(payload);
  persistSessionToken(payload.sessionToken);
  persistAdminAccess(payload.adminToken, Boolean(payload.isAdmin));
  if (payload.showSecurityNudge) {
    storage().setItem(NUDGE_KEY, '1');
  }
}

export function shouldShowSecurityNudge(): boolean {
  return storage().getItem(NUDGE_KEY) === '1';
}

export function dismissSecurityNudgeLocal() {
  storage().removeItem(NUDGE_KEY);
}

export function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = getSessionToken() || getAdminToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
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
