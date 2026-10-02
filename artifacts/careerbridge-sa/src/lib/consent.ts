export const CONSENT_STORAGE_KEY = 'bonlist-consent-v1';
export const CONSENT_UPDATED_EVENT = 'bonlist-consent-updated';
export const OPEN_CONSENT_PREFERENCES_EVENT = 'bonlist-open-consent-preferences';

export type ConsentPreferences = {
  essential: true;
  analytics: boolean;
  advertising: boolean;
  updatedAt: string;
};

export function readConsentPreferences(): ConsentPreferences | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY) || 'null') as Partial<ConsentPreferences> | null;
    if (!value || typeof value.analytics !== 'boolean' || typeof value.advertising !== 'boolean') return null;
    return { essential: true, analytics: value.analytics, advertising: value.advertising, updatedAt: String(value.updatedAt || '') };
  } catch {
    return null;
  }
}

export function saveConsentPreferences(preferences: Pick<ConsentPreferences, 'analytics' | 'advertising'>) {
  if (typeof window === 'undefined') return;
  const value: ConsentPreferences = { essential: true, ...preferences, updatedAt: new Date().toISOString() };
  try { window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(value)); } catch { /* storage can be unavailable */ }
  window.dispatchEvent(new CustomEvent(CONSENT_UPDATED_EVENT, { detail: value }));
}

export function openConsentPreferences() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OPEN_CONSENT_PREFERENCES_EVENT));
}
