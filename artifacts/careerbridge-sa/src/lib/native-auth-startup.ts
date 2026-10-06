import { Capacitor } from '@capacitor/core';
import { clearAuthSession, getSessionToken } from './auth-session';

const ISOLATION_VERSION = 'bonlist-native-auth-isolation-v1';

// One-time migration invalidates identities restored by older APK backups.
// Only authentication/cache keys are removed; saved CV documents are preserved.
export function initializeNativeAuth() {
  if (!Capacitor.isNativePlatform()) return;
  let isolated = false;
  try { isolated = localStorage.getItem(ISOLATION_VERSION) === '1'; } catch { /* fail closed */ }
  if (!isolated) {
    clearAuthSession();
    try { localStorage.setItem(ISOLATION_VERSION, '1'); } catch { /* require a new login */ }
  }
  if (!getSessionToken()) {
    clearAuthSession();
    const authPaths = ['/login', '/signup', '/forgot-password', '/reset-password', '/auth/callback'];
    if (!authPaths.includes(window.location.pathname)) window.history.replaceState({}, '', '/login');
  }
}
