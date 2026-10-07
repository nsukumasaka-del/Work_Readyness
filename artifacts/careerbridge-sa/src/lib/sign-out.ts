import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { App as NativeApp } from '@capacitor/app';
import { apiUrl } from './api-base';
import { AUTH_STORAGE_KEYS, authHeaders, clearAuthSession, isExplicitlySignedOut } from './auth-session';

export function resetSignedOutNavigation(navigate?: (path: string) => void) {
  const path = '/login?signedOut=1';
  if (Capacitor.isNativePlatform()) {
    // Stay inside the local Capacitor origin. A document reload is unnecessary
    // and may fail in a bundled WebView; Wouter listens to popstate instead.
    if (navigate) navigate(path);
    else window.history.replaceState({}, '', new URL(path, window.location.href).href);
    window.dispatchEvent(new PopStateEvent('popstate'));
    return;
  }
  window.location.replace(new URL(path, window.location.href).href);
}

export function installSignedOutNavigation() {
  const publicAuthPaths = new Set(['/login', '/signup', '/forgot-password', '/reset-password', '/auth/callback']);
  const preventSessionRestore = () => {
    if (isExplicitlySignedOut() && !publicAuthPaths.has(window.location.pathname)) resetSignedOutNavigation();
  };
  window.addEventListener('pageshow', preventSessionRestore);
  let disposed = false;
  let backListener: { remove: () => Promise<void> } | undefined;
  if (Capacitor.isNativePlatform()) void NativeApp.addListener('backButton', ({ canGoBack }) => {
    if (isExplicitlySignedOut()) {
      if (window.location.pathname === '/login') void NativeApp.exitApp();
      else resetSignedOutNavigation();
    } else if (canGoBack) window.history.back();
    else void NativeApp.exitApp();
  }).then(handle => { if (disposed) void handle.remove(); else backListener = handle; }).catch(() => undefined);
  return () => { disposed = true; window.removeEventListener('pageshow', preventSessionRestore); if (backListener) void backListener.remove(); };
}

export function beginSignOut() {
  // Capture revocation credentials before immediately clearing local access.
  const headers = authHeaders();
  clearAuthSession();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  // Defer plugin/fetch calls so synchronous bridge errors are also contained.
  const revoke = Promise.resolve().then(() => fetch(apiUrl('/api/career/auth/logout'), {
    method: 'POST', body: '{}', headers, credentials: 'include', signal: controller.signal,
  })).catch(error => console.warn('[Auth] Server logout unavailable; local session cleared', error)).finally(() => clearTimeout(timer));
  const nativeCleanup = (async () => { if (!Capacitor.isNativePlatform()) return; const results = await Promise.allSettled([
    // Remove only account-specific data, never native CV documents/preferences.
    ...[...AUTH_STORAGE_KEYS, 'bonlist.native.offline-workstation.v1'].map(key => Promise.resolve().then(() => Preferences.remove({ key }))),
  ]); if (results.some(result => result.status === 'rejected')) console.warn('[Auth] Some native cleanup calls failed; local access remains revoked'); })();
  // Native plugins can also stall. They must never block local logout/navigation.
  let navigationTimer: ReturnType<typeof setTimeout>;
  return Promise.race([
    Promise.allSettled([revoke, nativeCleanup]),
    new Promise(resolve => { navigationTimer = setTimeout(resolve, 3500); }),
  ]).finally(() => clearTimeout(navigationTimer));
}
