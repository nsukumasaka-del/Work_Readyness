import { Capacitor, CapacitorCookies } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { App as NativeApp } from '@capacitor/app';
import { apiUrl } from './api-base';
import { authHeaders, clearAuthSession, isExplicitlySignedOut } from './auth-session';

export function installSignedOutNavigation() {
  const publicAuthPaths = new Set(['/login', '/signup', '/forgot-password', '/reset-password', '/auth/callback']);
  const preventSessionRestore = () => {
    if (isExplicitlySignedOut() && !publicAuthPaths.has(window.location.pathname)) window.location.replace('/login?signedOut=1');
  };
  window.addEventListener('pageshow', preventSessionRestore);
  let disposed = false;
  let backListener: { remove: () => Promise<void> } | undefined;
  if (Capacitor.isNativePlatform()) void NativeApp.addListener('backButton', ({ canGoBack }) => {
    if (isExplicitlySignedOut()) {
      if (window.location.pathname === '/login') void NativeApp.exitApp();
      else window.location.replace('/login?signedOut=1');
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
  const revoke = fetch(apiUrl('/api/career/auth/logout'), {
    method: 'POST', body: '{}', headers, credentials: 'include', signal: controller.signal,
  }).catch(() => undefined).finally(() => clearTimeout(timer));
  const nativeCleanup = (async () => { if (!Capacitor.isNativePlatform()) return; await Promise.allSettled([
    Preferences.remove({ key: 'bonlist.native.offline-workstation.v1' }),
    ...['https://www.bonlist.site', 'https://bonlist.site'].flatMap(url =>
      ['bonlist_session', 'session_token', 'session'].map(key => CapacitorCookies.deleteCookie({ url, key }))),
  ]); })();
  // Native plugins can also stall. They must never block local logout/navigation.
  let navigationTimer: ReturnType<typeof setTimeout>;
  return Promise.race([
    Promise.allSettled([revoke, nativeCleanup]),
    new Promise(resolve => { navigationTimer = setTimeout(resolve, 3500); }),
  ]).finally(() => clearTimeout(navigationTimer));
}
