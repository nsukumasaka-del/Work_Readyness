import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerGateway as gateway } from '../workers/gateway';
import { d1PaymentAccess } from '../workers/d1/yoco';
import type { D1Env, UserRow } from '../workers/d1/auth';

test('PDF preflight succeeds for web and native origins before authentication', async () => {
  for (const origin of ['https://www.bonlist.site', 'capacitor://localhost', 'https://localhost', 'http://localhost:5173']) {
    const response = await gateway.fetch(new Request('https://www.bonlist.site/api/career/cv/export-pdf', {
      method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Headers': 'authorization,content-type' },
    }), {} as never);
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  }
});

test('untrusted origins do not receive credentialed CORS access', async () => {
  const response = await gateway.fetch(new Request('https://www.bonlist.site/api/career/profile', {
    method: 'OPTIONS', headers: { Origin: 'https://attacker.example' },
  }), {} as never);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});

test('unexpected API handler failures return JSON with native CORS, not HTML', async () => {
  const response = await gateway.fetch(new Request('https://www.bonlist.site/api/career/profile', {
    method: 'POST', headers: { Origin: 'capacitor://localhost', Authorization: 'Bearer test-session' },
  }), { get DB() { throw new Error('Simulated binding outage'); } } as never);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'capacitor://localhost');
  assert.equal((await response.json() as { success: boolean }).success, false);
});

test('verified primary admin access does not depend on payment tables', async () => {
  const env = { PRIMARY_ADMIN_EMAIL: 'nsukumasaka@gmail.com', DB: {
    prepare() { throw new Error('Payment tables unavailable'); },
  } } as unknown as D1Env;
  const access = await d1PaymentAccess(env, { id: 'verified-user', email: 'NSUKUMASAKA@gmail.com', is_admin: 0 } as UserRow);
  assert.equal(access.adminBypass, true);
  await assert.rejects(d1PaymentAccess(env, { id: 'standard-user', email: 'user@example.com', is_admin: 0 } as UserRow));
});
