import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { advertisingAllowedForPath, advertisingConfig } from '@/lib/advertising';
import { CONSENT_UPDATED_EVENT, readConsentPreferences, type ConsentPreferences } from '@/lib/consent';
import { isNativeApp } from '@/lib/platform';

const SCRIPT_ID = 'bonlist-adsense-script';

type AdContextValue = { active: boolean; publisherId: string };
const AdContext = createContext<AdContextValue>({ active: false, publisherId: '' });

export function AdProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [advertisingConsent, setAdvertisingConsent] = useState(() => Boolean(readConsentPreferences()?.advertising));
  const pathname = location.split('?')[0] || '/';
  const active = !isNativeApp() && advertisingConsent && advertisingAllowedForPath(pathname);
  const runtimeStarted = useRef(false);

  useEffect(() => {
    const update = (event: Event) => {
      const preferences = (event as CustomEvent<ConsentPreferences>).detail || readConsentPreferences();
      setAdvertisingConsent(Boolean(preferences?.advertising));
    };
    window.addEventListener(CONSENT_UPDATED_EVENT, update);
    return () => window.removeEventListener(CONSENT_UPDATED_EVENT, update);
  }, []);

  useEffect(() => {
    const existing = document.getElementById(SCRIPT_ID);
    if (!active) {
      existing?.remove();
      // Removing a script does not unload executed third-party JavaScript.
      // Reload before mounting private content or continuing after revocation.
      if (runtimeStarted.current) window.location.reload();
      return;
    }
    if (existing) return;
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(advertisingConfig.publisherId)}`;
    document.head.appendChild(script);
    runtimeStarted.current = true;
    return () => script.remove();
  }, [active]);

  const value = useMemo(() => ({ active, publisherId: active ? advertisingConfig.publisherId : '' }), [active]);
  if (!active && runtimeStarted.current) return null;
  return <AdContext.Provider value={value}>{children}</AdContext.Provider>;
}

export function useAds() {
  return useContext(AdContext);
}
