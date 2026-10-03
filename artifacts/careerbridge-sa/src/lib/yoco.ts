import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react';
import { authFetch } from './auth-session';
import { normalizeAccess } from './safe-data';
export type PurchaseType = 'TEMPLATE_DOWNLOAD' | 'JOB_MATCH_UNLOCK' | 'MEGA_ACCESS';
export type Purchase = { itemType: PurchaseType; targetId?: string | number; downloadFormat?: 'print' | 'doc' | 'html' | 'txt'; onVerified?: () => void };
export type PaidAccess = { adminBypass: boolean; megaAccessActive: boolean; megaAccessUntil: string | null; ownedTemplateIds: string[]; unlockedJobIds: string[] };
export const EMPTY_ACCESS: PaidAccess = { adminBypass: false, megaAccessActive: false, megaAccessUntil: null, ownedTemplateIds: [], unlockedJobIds: [] };
export function requestPayment(purchase: Purchase) { window.dispatchEvent(new CustomEvent('bonlist-yoco-purchase', { detail: purchase })); }
const PaidAccessContext = createContext(EMPTY_ACCESS);
export function PaidAccessProvider({ children }: { children: ReactNode }) { return createElement(PaidAccessContext.Provider, { value: usePaidAccessState() }, children); }
export function usePaidAccess() { return useContext(PaidAccessContext); }
function usePaidAccessState() {
  const [access, setAccess] = useState(EMPTY_ACCESS);
  useEffect(() => {
    let cancelled = false;
    let generation = 0;
    const refresh = () => { const current = ++generation; void authFetch('/api/career/monetization', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error();
      const value = await response.json();
      if (!cancelled && current === generation) setAccess(normalizeAccess(value));
    }).catch(() => { if (!cancelled && current === generation) setAccess(EMPTY_ACCESS); }); };
    refresh();
    window.addEventListener('bonlist-monetization-updated', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('careerbridge-profile-updated', refresh);
    return () => { cancelled = true; window.removeEventListener('bonlist-monetization-updated', refresh); window.removeEventListener('focus', refresh); window.removeEventListener('careerbridge-profile-updated', refresh); };
  }, []);
  useEffect(() => {
    if (!access.megaAccessUntil) return;
    const remaining = Date.parse(access.megaAccessUntil) - Date.now();
    const timer = window.setTimeout(() => window.dispatchEvent(new Event('bonlist-monetization-updated')), Math.max(0, Math.min(remaining + 100, 2147483647)));
    return () => window.clearTimeout(timer);
  }, [access.megaAccessUntil]);
  return access;
}
export function isJobUnlocked(job: { id: number | string; match: number; locked?: boolean; isAiMatch?: boolean }, access: PaidAccess) {
  return job.isAiMatch === false || access.adminBypass || access.megaAccessActive || job.match < 50 || access.unlockedJobIds.includes(String(job.id));
}
export async function fetchUnlockedJob(jobId: string | number) {
  const response = await authFetch('/api/payments/yoco/reveal-job', { method: 'POST', body: JSON.stringify({ jobId }) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'This match needs to be unlocked.');
  return value;
}
