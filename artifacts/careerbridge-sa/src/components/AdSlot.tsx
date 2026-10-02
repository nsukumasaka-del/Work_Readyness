import { useLocation } from 'wouter';
import { advertisingAllowedForPath, advertisingConfig, type AdPlacement } from '@/lib/advertising';
import { readConsentPreferences } from '@/lib/consent';

export function AdSlot({ placement, className = '' }: { placement: AdPlacement; className?: string }) {
  const [location] = useLocation();
  const pathname = location.split('?')[0] || '/';
  const consent = readConsentPreferences();
  if (!advertisingAllowedForPath(pathname) || !consent?.advertising) return null;

  // A provider renderer should be added here only after BonList has valid,
  // authorised credentials. Never render a simulated or misleading advert.
  if (advertisingConfig.provider === 'google-adsense' && advertisingConfig.publisherId) {
    return <div className={`bonlist-ad-slot ${className}`} data-ad-placement={placement} aria-label="Advertisement" />;
  }
  return null;
}
