import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import {
  OPEN_CONSENT_PREFERENCES_EVENT,
  readConsentPreferences,
  saveConsentPreferences,
} from '@/lib/consent';

export function CookieConsent() {
  const [open, setOpen] = useState(false);
  const [managing, setManaging] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [advertising, setAdvertising] = useState(false);

  useEffect(() => {
    const existing = readConsentPreferences();
    if (existing) {
      setAnalytics(existing.analytics);
      setAdvertising(existing.advertising);
    } else {
      setOpen(true);
    }
    const showPreferences = () => {
      const current = readConsentPreferences();
      setAnalytics(Boolean(current?.analytics));
      setAdvertising(Boolean(current?.advertising));
      setManaging(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_CONSENT_PREFERENCES_EVENT, showPreferences);
    return () => window.removeEventListener(OPEN_CONSENT_PREFERENCES_EVENT, showPreferences);
  }, []);

  const save = (nextAnalytics: boolean, nextAdvertising: boolean) => {
    saveConsentPreferences({ analytics: nextAnalytics, advertising: nextAdvertising });
    setAnalytics(nextAnalytics);
    setAdvertising(nextAdvertising);
    setOpen(false);
    setManaging(false);
  };

  if (!open) return null;
  return (
    <section className="fixed inset-x-3 bottom-[max(0.75rem,var(--safe-bottom))] z-[120] mx-auto max-w-3xl border border-border bg-card p-4 text-foreground shadow-2xl sm:p-5" role="dialog" aria-modal="false" aria-labelledby="cookie-consent-title">
      <h2 id="cookie-consent-title" className="text-base font-semibold">Your privacy choices</h2>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">BonList uses essential browser storage for sign-in and saved preferences. Optional analytics and third-party advertising stay off unless you allow them. Advertising loads only on eligible public articles and job guides after consent.</p>
      {managing ? <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="flex items-start gap-2 border border-border p-3 text-xs"><input type="checkbox" checked disabled className="mt-0.5" /><span><strong className="block text-foreground">Essential</strong><span className="text-muted-foreground">Required for security and core features.</span></span></label><label className="flex items-start gap-2 border border-border p-3 text-xs"><input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} className="mt-0.5" /><span><strong className="block text-foreground">Analytics</strong><span className="text-muted-foreground">Helps measure product usage without CV content.</span></span></label><label className="flex items-start gap-2 border border-border p-3 text-xs"><input type="checkbox" checked={advertising} onChange={(event) => setAdvertising(event.target.checked)} className="mt-0.5" /><span><strong className="block text-foreground">Advertising</strong><span className="text-muted-foreground">Allows third-party ads on public content pages. Partners may use device data, cookies, pop-under, or banner formats.</span></span></label></div> : null}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2"><Link href="/cookies" className="mr-auto text-xs font-semibold text-primary hover:underline">Cookie policy</Link><button type="button" onClick={() => save(false, false)} className="min-h-10 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted">Reject optional</button>{managing ? <button type="button" onClick={() => save(analytics, advertising)} className="min-h-10 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground">Save choices</button> : <><button type="button" onClick={() => setManaging(true)} className="min-h-10 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted">Manage</button><button type="button" onClick={() => save(true, true)} className="min-h-10 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground">Accept optional</button></>}</div>
    </section>
  );
}
