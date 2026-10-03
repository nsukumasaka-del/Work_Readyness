import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleYoco, paymentAccess, protectJob, canDownloadTemplate, verifyYocoSignature, type PaymentOrder, type PaymentStore } from './yoco';
const user = { id: 'u1', email: 'user@example.com' };
const env = { YOCO_SECRET_KEY: 'sk_test_fixture', YOCO_WEBHOOK_SECRET: 'whsec_' + btoa('test-secret'), APP_BASE_URL: 'https://bonlist.example' };
function memoryStore() {
  const orders = new Map<string, PaymentOrder>();
  const store: PaymentStore = {
    async create(o) { orders.set(o.id, { ...o }); },
    async attach(id, checkoutId) { orders.get(id)!.checkoutId = checkoutId; },
    async get(id) { return orders.get(id) || null; },
    async byCheckout(id) { return [...orders.values()].find(o => o.checkoutId === id) || null; },
    async paid(id) { return [...orders.values()].filter(o => o.userId === id && o.status === 'paid'); },
    async complete(id, checkout, paymentId, paidAt, expiresAt) { const o = orders.get(id)!; if (o.status === 'pending' && o.checkoutId === checkout) Object.assign(o, { status: 'paid', paymentId, paidAt, expiresAt }); },
  };
  return { orders, store };
}
async function signed(raw: string, timestamp = String(Math.floor(Date.now() / 1000))) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('test-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('event1.' + timestamp + '.' + raw));
  return new Headers({ 'webhook-id': 'event1', 'webhook-timestamp': timestamp, 'webhook-signature': 'v1,' + btoa(String.fromCharCode(...new Uint8Array(signature))) });
}
test('50% boundary redacts details; admin bypass and expiry are enforced', () => {
  const access = paymentAccess(user, []);
  assert.equal(protectJob({ id: 1, match: 49, title: 'Free' }, access).locked, false);
  const locked = protectJob({ id: 2, match: 50, title: 'Secret employer', url: 'https://secret.example' }, access);
  assert.equal(locked.locked, true); assert.equal(locked.url, '');
  assert.equal(canDownloadTemplate(access, 'classic'), false);
  assert.equal(canDownloadTemplate(paymentAccess({ ...user, isAdmin: true }, []), 'classic'), true);
  assert.equal(paymentAccess(user, [{ userId: 'u1', status: 'paid', itemType: 'MEGA_ACCESS', expiresAt: new Date(0).toISOString() } as PaymentOrder]).megaAccessActive, false);
});
test('signature rejects forgery, modified body and stale deliveries', async () => {
  const headers = await signed('{}');
  assert.equal(await verifyYocoSignature('{}', headers, env.YOCO_WEBHOOK_SECRET), true);
  assert.equal(await verifyYocoSignature('{"tampered":true}', headers, env.YOCO_WEBHOOK_SECRET), false);
  assert.equal(await verifyYocoSignature('{}', await signed('{}', '1'), env.YOCO_WEBHOOK_SECRET), false);
});
test('server fixes price; redirect verification cannot grant; signed webhook grants once', async () => {
  const { store, orders } = memoryStore();
  let sent: any;
  const provider = (async (_url: any, init: any) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ id: 'checkout_1', redirectUrl: 'https://c.yoco.com/fixture' })); }) as typeof fetch;
  const checkout = await handleYoco(new Request('https://bonlist.example/api/payments/yoco/create-checkout', { method: 'POST', body: JSON.stringify({ itemType: 'MEGA_ACCESS', amount: 1 }) }), store, user, env, provider);
  assert.equal(checkout.status, 200); assert.equal(sent.amount, 8000);
  const order = [...orders.values()][0];
  const verify = await handleYoco(new Request('https://bonlist.example/api/payments/yoco/verify?order_id=' + order.id), store, user, env);
  assert.equal((await verify.json()).status, 'pending');
  const other = await handleYoco(new Request('https://bonlist.example/api/payments/yoco/verify?order_id=' + order.id), store, { ...user, id: 'other' }, env);
  assert.equal(other.status, 404);
  const payload = { type: 'payment.succeeded', payload: { id: 'payment1', status: 'succeeded', amount: 8000, currency: 'ZAR', mode: 'test', metadata: { checkoutId: 'checkout_1' } } };
  const raw = JSON.stringify(payload);
  const webhook = () => new Request('https://bonlist.example/api/payments/yoco/webhook', { method: 'POST', body: raw });
  assert.equal((await handleYoco(webhook(), store, null, env)).status, 401);
  const deliver = async () => handleYoco(new Request(webhook(), { headers: await signed(raw) }), store, null, env);
  assert.equal((await deliver()).status, 200);
  const expiry = order.expiresAt;
  assert.equal(Date.parse(expiry!) - Date.parse(order.paidAt!), 7 * 86400000);
  await deliver(); assert.equal(order.expiresAt, expiry);
  payload.payload.amount = 1;
  const bad = JSON.stringify(payload);
  assert.equal((await handleYoco(new Request(webhook(), { body: bad, headers: await signed(bad) }), store, null, env)).status, 400);
});
test('missing secrets fail closed and administrator never contacts provider', async () => {
  const { store } = memoryStore();
  const request = () => new Request('https://bonlist.example/api/payments/yoco/create-checkout', { method: 'POST', body: '{"itemType":"MEGA_ACCESS"}' });
  assert.equal((await handleYoco(request(), store, user, {})).status, 503);
  const response = await handleYoco(request(), store, { ...user, isAdmin: true }, {}, (() => { throw Error('Must not call'); }) as typeof fetch);
  assert.equal((await response.json()).alreadyUnlocked, true);
});
