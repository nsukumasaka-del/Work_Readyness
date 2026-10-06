import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Link, useLocation } from 'wouter';
import { authFetch } from '@/lib/auth-session';
import { type Purchase } from '@/lib/yoco';
const prices = { TEMPLATE_DOWNLOAD: 50, JOB_MATCH_UNLOCK: 30, MEGA_ACCESS: 80 };
export function YocoCheckoutHost() {
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef(false);
  useEffect(() => {
    const open = (event: Event) => { setPurchase((event as CustomEvent<Purchase>).detail); setError(''); };
    window.addEventListener('bonlist-yoco-purchase', open);
    return () => window.removeEventListener('bonlist-yoco-purchase', open);
  }, []);
  if (!purchase) return null;
  const start = async (item: Purchase) => {
    if (ref.current) return;
    ref.current = true; setBusy(true); setError('');
    try {
      const response = await authFetch('/api/payments/yoco/create-checkout', { method: 'POST', body: JSON.stringify({ itemType: item.itemType, targetId: item.targetId, native: Capacitor.isNativePlatform() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Checkout could not be started.');
      if (result.alreadyUnlocked) { window.dispatchEvent(new Event('bonlist-monetization-updated')); setPurchase(null); item.onVerified?.(); return; }
      // This is return navigation only, never proof of payment.
      try { localStorage.setItem('bonlist-yoco-pending', JSON.stringify({ orderId: result.orderId, itemType: item.itemType, targetId: item.targetId, downloadFormat: item.downloadFormat, returnTo: `${window.location.pathname}${window.location.search}` })); } catch { /* The server still retains the order. */ }
      window.location.assign(result.redirectUrl);
    } catch (err) { setError(err instanceof Error ? err.message : 'Checkout unavailable.'); }
    finally { ref.current = false; setBusy(false); }
  };
  return <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/50 p-4" onClick={() => { if (!busy) setPurchase(null); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="yoco-title" className="box-border w-full min-w-0 max-w-md rounded-2xl bg-white p-5 text-slate-900 shadow-xl [overflow-wrap:anywhere]" onClick={event => event.stopPropagation()}>
<div className="flex items-start justify-between gap-3"><h2 id="yoco-title" className="text-lg font-bold">{purchase.itemType === 'MEGA_ACCESS' ? 'Mega Access Promotion' : purchase.itemType === 'TEMPLATE_DOWNLOAD' ? 'Unlock this CV template' : 'Unlock all job matches'}</h2><button aria-label="Close checkout" disabled={busy} onClick={() => setPurchase(null)} className="h-9 w-9 shrink-0 rounded-lg hover:bg-slate-100">×</button></div>
      <p className="mt-3 text-sm leading-6">{purchase.itemType === 'MEGA_ACCESS' ? '7 days of unlimited CV downloads, 50%+ job match reveals, and AI CV and cover-letter tools.' : purchase.itemType === 'TEMPLATE_DOWNLOAD' ? 'Pay once to download and reuse this template. Editing and previewing remain free.' : 'Unlock all matches scoring 50% or higher for exactly 24 hours after payment. No recurring charge.'}</p>
      <p className="mt-4 text-3xl font-bold">R{prices[purchase.itemType]} <span className="text-sm font-normal text-slate-500">{purchase.itemType === 'JOB_MATCH_UNLOCK' ? 'for 24 hours' : 'once-off'}</span></p>
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
      <button disabled={busy} onClick={() => void start(purchase)} className="mt-5 min-h-11 w-full rounded-xl bg-blue-700 px-3 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Opening secure checkout…' : `Pay R${prices[purchase.itemType]} with Yoco`}</button>
      {purchase.itemType !== 'MEGA_ACCESS' ? <button disabled={busy} onClick={() => void start({ ...purchase, itemType: 'MEGA_ACCESS' })} className="mt-3 min-h-11 w-full rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">PROMOTION — 1 WEEK MEGA ACCESS · R80</button> : null}
      <p className="mt-3 text-xs leading-5 text-slate-500">Card details are entered on Yoco’s hosted checkout, not on BonList.</p>
    </section>
  </div>;
}
export function PaymentResultPage() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState('pending');
  const [message, setMessage] = useState('Waiting for payment confirmation…');
  const [returnTo, setReturnTo] = useState('/pricing');
  const [verificationRun, setVerificationRun] = useState(0);
  const orderId = new URLSearchParams(window.location.search).get('order_id');
  const cancelled = window.location.pathname.endsWith('/cancel');
  const nativeReturn = new URLSearchParams(window.location.search).get('native') === '1' && !Capacitor.isNativePlatform() && orderId;
  useEffect(() => {
    let disposed = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if (!orderId || cancelled) { setMessage(cancelled ? 'Checkout was cancelled. No access was granted.' : 'No payment reference was supplied.'); return; }
        const response = await authFetch(`/api/payments/yoco/verify?order_id=${encodeURIComponent(orderId)}`, { cache: 'no-store' });
        const result = await response.json();
        if (disposed) return;
        if (!response.ok) { setMessage(response.status === 401 ? 'Sign in to the account used for checkout to check this payment.' : result.error || 'Could not check payment.'); if (response.status !== 401 && ++attempts < 20) timer = setTimeout(() => void poll(), 3000); return; }
        if (result.status === 'paid') {
          setStatus('paid'); setMessage(result.jobAccessActive ? 'Access Unlocked — Valid for 24 Hours' : 'Payment confirmed. Your access is ready.');
          window.dispatchEvent(new Event('bonlist-monetization-updated'));
          let destination = result.itemType === 'JOB_MATCH_UNLOCK' ? '/jobs' : '/pricing';
          try {
            const pending = JSON.parse(localStorage.getItem('bonlist-yoco-pending') || '{}');
            if (pending.orderId === orderId) {
              const path = typeof pending.returnTo === 'string' && pending.returnTo.startsWith('/') && !pending.returnTo.startsWith('//') ? pending.returnTo : '/pricing';
              destination = path;
              if (pending.downloadFormat && (result.itemType === 'TEMPLATE_DOWNLOAD' || result.itemType === 'MEGA_ACCESS')) sessionStorage.setItem('bonlist-yoco-resume-download', JSON.stringify({ templateId: pending.targetId, format: pending.downloadFormat }));
              localStorage.removeItem('bonlist-yoco-pending');
            }
          } catch { /* Optional return navigation. */ }
          setReturnTo(destination);
          if (result.itemType === 'JOB_MATCH_UNLOCK' && result.hasActiveAccess) timer = setTimeout(() => navigate(destination), 1000);
          return;
        }
        if (++attempts < 20) timer = setTimeout(() => void poll(), 3000);
        else setMessage('Confirmation is taking longer than usual. Your order is saved; refresh later. Do not pay again.');
      } catch { if (!disposed) { setMessage('Unable to check payment. Retrying automatically; do not pay again.'); if (++attempts < 20) timer = setTimeout(() => void poll(), 3000); } }
    };
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [orderId, cancelled, navigate, verificationRun]);
  return <main className="mx-auto box-border w-full max-w-xl p-4 py-12 sm:p-6">{nativeReturn ? <a className="btn-primary mb-6" href={`bonlist://payment/${cancelled ? 'cancel' : 'success'}?order_id=${encodeURIComponent(orderId!)}`}>Return to BonList app</a> : null}<h1 className="text-2xl font-bold">{cancelled ? 'Payment cancelled' : status === 'paid' ? 'Payment confirmed' : 'Checking payment'}</h1><p role="status" className="mt-4 text-sm leading-6">{message}</p><div className="mt-6 flex flex-wrap gap-3">{status === 'paid' ? <button className="btn-primary" onClick={() => navigate(returnTo)}>Continue</button> : <Link href="/login" className="btn-secondary">Sign in</Link>}{status !== 'paid' && !cancelled && orderId ? <button className="btn-secondary" onClick={() => setVerificationRun(value => value + 1)}>Check payment again</button> : null}<Link href="/pricing" className="btn-secondary">View pricing</Link></div></main>;
}
