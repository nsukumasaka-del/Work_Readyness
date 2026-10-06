import test from 'node:test';
import assert from 'node:assert/strict';
import { d1PaymentStore } from '../workers/d1/yoco';
import type { D1Env } from '../workers/d1/auth';

function failingDatabase(message: string): D1Env {
  return { DB: { prepare: () => ({ bind: () => ({ all: async () => { throw new Error(message); } }) }) } } as unknown as D1Env;
}

test('missing checkout schema does not fail a free review or grant paid access', async () => {
  const orders = await d1PaymentStore(failingDatabase('D1_ERROR: no such table: yoco_orders: SQLITE_ERROR')).paid('standard-user');
  assert.deepEqual(orders, []);
});

test('unrelated database failures remain errors, not invented payment access', async () => {
  await assert.rejects(d1PaymentStore(failingDatabase('D1_ERROR: connection unavailable')).paid('standard-user'), /connection unavailable/);
});

test('existing paid orders are retained', async () => {
  const row = {id:'order-1',user_id:'standard-user',item_type:'JOB_MATCH_UNLOCK',target_id:'job-1',amount:2000,status:'paid',checkout_id:'checkout-1',payment_id:'payment-1',paid_at:'2026-10-06',expires_at:null,mode:'live'};
  const env={DB:{prepare:()=>({bind:()=>({all:async()=>({results:[row]})})})}} as unknown as D1Env;
  const orders=await d1PaymentStore(env).paid('standard-user');
  assert.equal(orders.length,1);
  assert.equal(orders[0].targetId,'job-1');
  assert.equal(orders[0].status,'paid');
});
