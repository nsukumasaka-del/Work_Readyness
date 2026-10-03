export const PAYMENT_PRODUCTS = {
  TEMPLATE_DOWNLOAD: { amount: 5000, name: 'CV template download', priceZar: 50 },
  JOB_MATCH_UNLOCK: { amount: 2000, name: 'High-score job match', priceZar: 20 },
  MEGA_ACCESS: { amount: 8000, name: 'Mega Access Promotion', priceZar: 80 },
} as const;
export type PaymentType = keyof typeof PAYMENT_PRODUCTS;
export type PaymentUser = { id: string; email: string; isAdmin?: boolean };
export type YocoEnv = { YOCO_SECRET_KEY?: string; YOCO_WEBHOOK_SECRET?: string; PRIMARY_ADMIN_EMAIL?: string; APP_BASE_URL?: string };
export type PaymentOrder = { id: string; userId: string; itemType: PaymentType; targetId: string; amount: number; status: string; checkoutId: string | null; paymentId: string | null; paidAt: string | null; expiresAt: string | null; mode: string };
export interface PaymentStore {
  create(order: PaymentOrder): Promise<void>;
  attach(id: string, checkoutId: string): Promise<void>;
  get(id: string): Promise<PaymentOrder | null>;
  byCheckout(id: string): Promise<PaymentOrder | null>;
  paid(userId: string): Promise<PaymentOrder[]>;
  complete(id: string, checkoutId: string, paymentId: string, paidAt: string, expiresAt: string | null): Promise<void>;
}
export function isPrimaryAdmin(user: PaymentUser | null, email?: string): boolean {
  return Boolean(user && (user.isAdmin || (email?.trim() && user.email.toLowerCase() === email.trim().toLowerCase())));
}
export function paymentAccess(user: PaymentUser, orders: PaymentOrder[], primaryEmail?: string, now = Date.now()) {
  const paid = orders.filter(order => order.userId === user.id && order.status === 'paid');
  const mega = paid.filter(order => order.itemType === 'MEGA_ACCESS' && Date.parse(order.expiresAt || '') > now);
  return {
    adminBypass: isPrimaryAdmin(user, primaryEmail),
    megaAccessUntil: mega.map(order => order.expiresAt!).sort().at(-1) || null,
    megaAccessActive: mega.length > 0,
    ownedTemplateIds: [...new Set(paid.filter(order => order.itemType === 'TEMPLATE_DOWNLOAD').map(order => order.targetId))],
    unlockedJobIds: [...new Set(paid.filter(order => order.itemType === 'JOB_MATCH_UNLOCK').map(order => order.targetId))],
  };
}
export type PaymentAccess = ReturnType<typeof paymentAccess>;
export const canDownloadTemplate = (access: PaymentAccess, id: string) => access.adminBypass || access.megaAccessActive || access.ownedTemplateIds.includes(id);
export const canRevealJob = (access: PaymentAccess, job: { id: number | string; match: number }) => access.adminBypass || access.megaAccessActive || job.match < 50 || access.unlockedJobIds.includes(String(job.id));
export function protectJob<T extends { id: number | string; match: number }>(job: T, access: PaymentAccess): T & { locked: boolean } {
  if (canRevealJob(access, job)) return { ...job, locked: false };
  // Do not send paid content to the browser merely hidden by CSS.
  return { id: job.id, match: job.match, title: 'High Match Found', company: '', location: '', sector: '', salary: '', posted: '', tags: [], source: '', url: '', description: '', locked: true } as unknown as T & { locked: boolean };
}
export function protectReport<T extends Record<string, unknown>>(report: T, access: PaymentAccess): T {
  return { ...report, relatedJobs: Array.isArray(report.relatedJobs) ? report.relatedJobs.map(job => protectJob(job, access)) : [] };
}
export function findOwnedJob(reports: string[], id: string): Record<string, any> | null {
  for (const raw of reports) {
    try {
      const report = JSON.parse(raw);
      const job = Array.isArray(report.relatedJobs) ? report.relatedJobs.find((item: Record<string, unknown>) => item && String(item.id) === id && typeof item.match === 'number' && Number.isFinite(item.match)) : null;
      if (job) return job;
    } catch { /* Ignore malformed historical reviews. */ }
  }
  return null;
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function verifyYocoSignature(raw: string, headers: Headers, secret: string, now = Date.now()): Promise<boolean> {
  const timestamp = headers.get('webhook-timestamp') || '';
  const id = headers.get('webhook-id');
  if (!id || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 180 || !secret.startsWith('whsec_')) return false;
  try {
    const key = await crypto.subtle.importKey('raw', Uint8Array.from(atob(secret.slice(6)), c => c.charCodeAt(0)), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const content = new TextEncoder().encode(`${id}.${timestamp}.${raw}`);
    for (const signature of (headers.get('webhook-signature') || '').split(/\s+/)) {
      const [version, encoded] = signature.split(',');
      if (version !== 'v1' || !encoded) continue;
      const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
      if (await crypto.subtle.verify('HMAC', key, bytes, content)) return true;
    }
  } catch { return false; }
  return false;
}

export async function handleYoco(request: Request, store: PaymentStore, user: PaymentUser | null, env: YocoEnv, providerFetch: typeof fetch = fetch): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path.endsWith('/webhook')) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    const raw = await request.text();
    if (raw.length > 100_000 || !await verifyYocoSignature(raw, request.headers, env.YOCO_WEBHOOK_SECRET || '')) return json({ error: 'Invalid webhook signature.' }, 401);
    let event: Record<string, any>;
    try { event = JSON.parse(raw); } catch { return json({ error: 'Invalid event.' }, 400); }
    if (event.type !== 'payment.succeeded') return json({ received: true });
    const payload = event.payload;
    const checkoutId = payload?.metadata?.checkoutId;
    if (typeof checkoutId !== 'string' || typeof payload?.id !== 'string') return json({ error: 'Missing payment reference.' }, 400);
    const order = await store.byCheckout(checkoutId);
    // Retry unknown checkouts rather than acknowledging and losing payment.
    if (!order) return json({ error: 'Checkout not recorded yet.' }, 503);
    if (payload.status !== 'succeeded' || payload.currency !== 'ZAR' || payload.amount !== order.amount || payload.mode !== order.mode) return json({ error: 'Payment does not match the order.' }, 400);
    const paidAt = new Date().toISOString();
    const expiresAt = order.itemType === 'MEGA_ACCESS' ? new Date(Date.now() + 7 * 86400_000).toISOString() : null;
    await store.complete(order.id, checkoutId, payload.id, paidAt, expiresAt);
    return json({ received: true });
  }
  if (!user) return json({ error: 'Please sign in to continue.' }, 401);
  const access = paymentAccess(user, await store.paid(user.id), env.PRIMARY_ADMIN_EMAIL);
  if (path.endsWith('/access') && request.method === 'GET') return json({ ...access, products: PAYMENT_PRODUCTS });
  if (path.endsWith('/verify') && ['GET', 'POST'].includes(request.method)) {
    const input = request.method === 'POST' ? await request.json().catch(() => ({})) as Record<string, unknown> : {};
    const id = new URL(request.url).searchParams.get('order_id') || input.orderId;
    const order = typeof id === 'string' ? await store.get(id) : null;
    if (!order || order.userId !== user.id) return json({ error: 'Order not found.' }, 404);
    return json({ status: order.status, itemType: order.itemType, targetId: order.targetId, ...access });
  }
  if (!path.endsWith('/create-checkout') || request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const input = await request.json().catch(() => ({})) as Record<string, unknown>;
  const itemType = input.itemType;
  if (typeof itemType !== 'string' || !Object.hasOwn(PAYMENT_PRODUCTS, itemType)) return json({ error: 'Unknown purchase type.' }, 400);
  const type = itemType as PaymentType;
  const targetId = type === 'MEGA_ACCESS' ? '' : typeof input.targetId === 'string' || typeof input.targetId === 'number' ? String(input.targetId) : '';
  if (type !== 'MEGA_ACCESS' && !/^[a-zA-Z0-9_-]{1,80}$/.test(targetId)) return json({ error: 'A valid item ID is required.' }, 400);
  if (access.adminBypass || access.megaAccessActive || (type === 'TEMPLATE_DOWNLOAD' && canDownloadTemplate(access, targetId)) || (type === 'JOB_MATCH_UNLOCK' && access.unlockedJobIds.includes(targetId))) return json({ alreadyUnlocked: true, ...access });
  const key = env.YOCO_SECRET_KEY || '';
  if (!/^sk_(test|live)_/.test(key) || /dummy|placeholder/i.test(key) || !env.YOCO_WEBHOOK_SECRET) return json({ error: 'Payments are not configured yet. Please contact support.' }, 503);
  let origin: string;
  try { const url = new URL(env.APP_BASE_URL || ''); if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error(); origin = url.origin; } catch { return json({ error: 'Payment return URL is not configured.' }, 503); }
  const id = crypto.randomUUID();
  const order: PaymentOrder = { id, userId: user.id, itemType: type, targetId, amount: PAYMENT_PRODUCTS[type].amount, status: 'pending', checkoutId: null, paymentId: null, paidAt: null, expiresAt: null, mode: key.startsWith('sk_live_') ? 'live' : 'test' };
  await store.create(order);
  try {
    const response = await providerFetch('https://payments.yoco.com/api/checkouts', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': id },
      signal: AbortSignal.timeout(15_000), body: JSON.stringify({ amount: order.amount, currency: 'ZAR',
        successUrl: `${origin}/payment/success?order_id=${id}${input.native === true ? '&native=1' : ''}`, cancelUrl: `${origin}/payment/cancel?order_id=${id}${input.native === true ? '&native=1' : ''}`, failureUrl: `${origin}/payment/cancel?order_id=${id}${input.native === true ? '&native=1' : ''}`,
        metadata: { orderId: id, userId: user.id, itemType: type, targetId }, clientReferenceId: id }),
    });
    if (!response.ok) return json({ error: 'Yoco checkout is temporarily unavailable. Please try again.' }, 502);
    const checkout = await response.json() as { id?: string; redirectUrl?: string };
    if (!checkout.id || typeof checkout.redirectUrl !== 'string') throw new Error('Invalid checkout');
    const redirect = new URL(checkout.redirectUrl);
    if (redirect.protocol !== 'https:' || !(redirect.hostname === 'yoco.com' || redirect.hostname.endsWith('.yoco.com'))) throw new Error('Invalid checkout URL');
    await store.attach(id, checkout.id);
    return json({ orderId: id, redirectUrl: redirect.href, itemType: type, amount: order.amount });
  } catch { return json({ error: 'Checkout could not be started. Please try again.' }, 502); }
}
