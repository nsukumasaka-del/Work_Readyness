import { useEffect, useRef } from 'react';
import { adSlotId, type AdPlacement } from '@/lib/advertising';
import { useAds } from '@/components/AdProvider';

declare global {
  interface Window { adsbygoogle?: unknown[] }
}

export function AdSlot({ placement, className = '' }: { placement: AdPlacement; className?: string }) {
  const { active, publisherId } = useAds();
  const initialized = useRef(false);
  const slotId = adSlotId(placement);

  useEffect(() => {
    if (!active || !slotId || initialized.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      initialized.current = true;
    } catch (error) {
      console.warn('[advertising] AdSense slot could not initialize.', error);
    }
  }, [active, slotId]);

  if (!active || !slotId) return null;
  return (
    <aside className={`bonlist-ad-slot min-w-0 max-w-full overflow-hidden ${className}`} data-ad-placement={placement} aria-label="Advertisement">
      <span className="mb-1 block text-center text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Advertisement</span>
      <ins
        className="adsbygoogle block max-w-full overflow-hidden"
        style={{ display: 'block' }}
        data-ad-client={publisherId}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
