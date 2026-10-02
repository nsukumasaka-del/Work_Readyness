import { readConsentPreferences } from '@/lib/consent';

const VISITOR_KEY = "careerbridge-visitor-id";

export function ensureVisitorId() {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

export function trackPageVisit(path: string) {
  if (path.startsWith("/admin")) return;
  if (!readConsentPreferences()?.analytics) return;
  const visitorId = ensureVisitorId();
  const pathname = path.split(/[?#]/, 1)[0] || '/';
  void fetch("/api/analytics/visit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: pathname,
      visitorId,
      referrer: document.referrer || null,
    }),
    keepalive: true,
  }).catch(() => undefined);
}
