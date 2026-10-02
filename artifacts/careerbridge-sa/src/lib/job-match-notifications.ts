import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'bonlist-unread-job-matches';
export const JOB_MATCHES_FOUND_EVENT = 'bonlist-job-matches-found';
const JOB_MATCHES_UPDATED_EVENT = 'bonlist-job-matches-updated';

function readUnreadCount(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const value = Number.parseInt(window.localStorage.getItem(STORAGE_KEY) || '0', 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function publishUpdate() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(JOB_MATCHES_UPDATED_EVENT));
}

export function announceJobMatches(count: number) {
  if (typeof window === 'undefined') return;
  const nextCount = Math.max(0, Math.floor(count));
  try {
    window.localStorage.setItem(STORAGE_KEY, String(nextCount));
  } catch {
    // Keep the in-session event working when persistent storage is unavailable.
  }
  publishUpdate();
  window.dispatchEvent(new CustomEvent(JOB_MATCHES_FOUND_EVENT, { detail: { count: nextCount } }));
}

export function markJobMatchesRead() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // The reactive event still clears the current UI session.
  }
  publishUpdate();
}

export function isJobMatchesPath(pathname: string) {
  const cleanPath = pathname.split(/[?#]/, 1)[0];
  return cleanPath === '/jobs' || /^\/jobs\/\d+$/.test(cleanPath) || cleanPath === '/job-matches' || cleanPath.startsWith('/job-matches/');
}

function subscribe(listener: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(JOB_MATCHES_UPDATED_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(JOB_MATCHES_UPDATED_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function useUnreadJobMatches() {
  return useSyncExternalStore(subscribe, readUnreadCount, () => 0);
}
