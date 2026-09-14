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
  const visitorId = ensureVisitorId();
  void fetch("/api/analytics/visit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path,
      visitorId,
      referrer: document.referrer || null,
    }),
    keepalive: true,
  }).catch(() => undefined);
}
