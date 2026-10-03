import { getAuthenticatedUser, type D1Env, type UserRow } from "./auth";
import { d1PaymentAccess } from './yoco';
import { canDownloadTemplate } from '../../artifacts/api-server/src/lib/yoco';

export const FREE_TEMPLATE_IDS = new Set([
  "serif_classic", "corporate_blue", "analyst_clean", "double_column", "ivy_league",
  "elegant", "contemporary", "modern", "timeline", "single_column", "compact",
  "multicolumn", "classic", "minimal",
]);
export const PAID_TEMPLATE_IDS = new Set(["editorial_gold", "creative", "stylish", "polished", "high_performer"]);

type FeatureRow = { feature_id: string; name: string; description: string; credit_cost: number };
type CreditRow = { balance: number };
type PaymentInput = {
  userId?: unknown; provider?: unknown; providerReference?: unknown; purpose?: unknown;
  itemId?: unknown; amountCents?: unknown; currency?: unknown; status?: unknown;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const text = (value: unknown, max = 160) => typeof value === "string" ? value.trim().slice(0, max) : "";
const id = () => crypto.randomUUID();

async function creditBalance(env: D1Env, userId: string): Promise<number> {
  const row = await env.DB.prepare("SELECT COALESCE(SUM(delta), 0) AS balance FROM credit_transactions WHERE user_id = ?")
    .bind(userId).first<CreditRow>();
  return Math.max(0, Number(row?.balance || 0));
}

export async function canUseTemplate(env: D1Env, user: UserRow, templateId: string): Promise<boolean> {
  return canDownloadTemplate(await d1PaymentAccess(env, user), templateId);
}

async function status(env: D1Env, user: UserRow) {
  const access = await d1PaymentAccess(env, user);
  if (access.adminBypass) return {
    ...access, credits: Number.MAX_SAFE_INTEGER,
    creditPack: { priceZar: 50, credits: 5 }, freeTemplateIds: [],
    premiumTemplates: [...FREE_TEMPLATE_IDS, ...PAID_TEMPLATE_IDS].map(templateId => ({ templateId, priceZar: 50, ownership: "lifetime" })),
    features: [], recentTransactions: [],
  };
  const [owned, features, recent, balance] = await Promise.all([
    env.DB.prepare("SELECT template_id, unlocked_at FROM user_template_entitlements WHERE user_id = ? AND status = 'active' ORDER BY unlocked_at DESC")
      .bind(user.id).all<{ template_id: string; unlocked_at: string }>(),
    env.DB.prepare("SELECT feature_id, name, description, credit_cost FROM premium_feature_catalog WHERE active = 1 ORDER BY credit_cost, name")
      .all<FeatureRow>(),
    env.DB.prepare("SELECT id, delta, balance_after, kind, feature_id, created_at FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 12")
      .bind(user.id).all(),
    creditBalance(env, user.id),
  ]);
  return {
    ...access,
    credits: balance,
    creditPack: { priceZar: 50, credits: 5 },
    ownedTemplateIds: [...new Set([...access.ownedTemplateIds, ...owned.results.map(row => row.template_id)])],
    freeTemplateIds: [],
    premiumTemplates: [...FREE_TEMPLATE_IDS, ...PAID_TEMPLATE_IDS].map((templateId) => ({ templateId, priceZar: 50, ownership: "lifetime" })),
    features: features.results.map((row) => ({
      id: row.feature_id, name: row.name, description: row.description, creditCost: row.credit_cost,
    })),
    recentTransactions: recent.results,
  };
}

export async function getFeatureQuote(env: D1Env, user: UserRow, featureId: string) {
  const feature = await env.DB.prepare(
    "SELECT feature_id, name, description, credit_cost FROM premium_feature_catalog WHERE feature_id = ? AND active = 1 LIMIT 1",
  ).bind(featureId).first<FeatureRow>();
  if (!feature) return null;
  const access = await d1PaymentAccess(env, user);
  const bypass = access.adminBypass || access.megaAccessActive;
  const balance = bypass ? Number.MAX_SAFE_INTEGER : await creditBalance(env, user.id);
  return { feature, balance, allowed: bypass || balance >= feature.credit_cost, adminBypass: bypass };
}

export async function chargeFeatureCredits(env: D1Env, user: UserRow, featureId: string, idempotencyKey: string) {
  const quote = await getFeatureQuote(env, user, featureId);
  if (!quote) return { ok: false as const, status: 404, error: "Unknown premium feature." };
  const { feature } = quote;
  if (quote.adminBypass) return { ok: true as const, adminBypass: true, charged: 0, featureId, balance: quote.balance };

  const existing = await env.DB.prepare("SELECT balance_after FROM credit_transactions WHERE idempotency_key = ? AND user_id = ? LIMIT 1")
    .bind(idempotencyKey, user.id).first<{ balance_after: number }>();
  if (existing) return { ok: true as const, duplicate: true, charged: feature.credit_cost, balance: existing.balance_after, featureId };

  await env.DB.prepare(`INSERT INTO credit_transactions
    (id, user_id, delta, balance_after, kind, feature_id, idempotency_key, created_at)
    SELECT ?, ?, ?, COALESCE(SUM(delta), 0) - ?, 'spend', ?, ?, datetime('now')
    FROM credit_transactions WHERE user_id = ?
    HAVING COALESCE(SUM(delta), 0) >= ?`).bind(
      id(), user.id, -feature.credit_cost, feature.credit_cost, featureId, idempotencyKey, user.id, feature.credit_cost,
    ).run();
  const transaction = await env.DB.prepare("SELECT balance_after FROM credit_transactions WHERE idempotency_key = ? AND user_id = ? LIMIT 1")
    .bind(idempotencyKey, user.id).first<{ balance_after: number }>();
  if (!transaction) return { ok: false as const, status: 402, error: `This action requires ${feature.credit_cost} BonList Credits.`, required: feature.credit_cost, balance: await creditBalance(env, user.id) };
  await env.DB.prepare("INSERT INTO credit_accounts (user_id, balance, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(user_id) DO UPDATE SET balance = excluded.balance, updated_at = datetime('now')")
    .bind(user.id, transaction.balance_after).run();
  return { ok: true as const, charged: feature.credit_cost, balance: transaction.balance_after, featureId };
}

async function spendCredits(request: Request, env: D1Env, user: UserRow) {
  const input = await request.json().catch(() => ({})) as Record<string, unknown>;
  const featureId = text(input.featureId, 80);
  const idempotencyKey = text(input.idempotencyKey, 160);
  if (!featureId || !idempotencyKey) return json({ error: "featureId and idempotencyKey are required." }, 400);
  const result = await chargeFeatureCredits(env, user, featureId, idempotencyKey);
  return json(result, result.ok ? 200 : result.status);
}

async function verifyPayment(request: Request, env: D1Env) {
  const configuredSecret = env.PAYMENT_WEBHOOK_SECRET || "";
  const suppliedSecret = request.headers.get("x-bonlist-payment-secret") || "";
  if (!configuredSecret || suppliedSecret !== configuredSecret) return json({ error: "Payment verification failed." }, 401);
  const input = await request.json().catch(() => ({})) as PaymentInput;
  const userId = text(input.userId, 80);
  const provider = text(input.provider, 60);
  const reference = text(input.providerReference, 160);
  const purpose = text(input.purpose, 20);
  const itemId = text(input.itemId, 80);
  const currency = text(input.currency, 3).toUpperCase() || "ZAR";
  const amountCents = Number(input.amountCents);
  if (!userId || !provider || !reference || input.status !== "paid" || currency !== "ZAR" ||
      !Number.isSafeInteger(amountCents) || amountCents < 5000 || !["template", "credits"].includes(purpose)) {
    return json({ error: "Invalid verified-payment payload." }, 400);
  }
  if (purpose === "template" && (!PAID_TEMPLATE_IDS.has(itemId) || amountCents !== 5000))
    return json({ error: "Invalid template purchase." }, 400);
  if (purpose === "credits" && (itemId !== "credits_5" || amountCents !== 5000))
    return json({ error: "Invalid credit purchase." }, 400);
  const userExists = await env.DB.prepare("SELECT id FROM users WHERE id = ? LIMIT 1").bind(userId).first<{ id: string }>();
  if (!userExists) return json({ error: "Payment user was not found." }, 404);

  await env.DB.prepare(`INSERT OR IGNORE INTO payment_records
    (id, user_id, provider, provider_reference, purpose, item_id, amount_cents, currency, status, verified_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paid', datetime('now'), datetime('now'))`)
    .bind(id(), userId, provider, reference, purpose, itemId, amountCents, currency).run();
  const verified = await env.DB.prepare(
    "SELECT user_id, purpose, item_id, status FROM payment_records WHERE provider_reference = ? LIMIT 1",
  ).bind(reference).first<{ user_id: string; purpose: string; item_id: string; status: string }>();
  if (!verified || verified.user_id !== userId || verified.purpose !== purpose || verified.item_id !== itemId || verified.status !== "paid")
    return json({ error: "Payment reference was already used for a different purchase." }, 409);

  if (purpose === "template") {
    await env.DB.prepare(`INSERT INTO user_template_entitlements
      (id, user_id, template_id, unlocked_at, payment_reference, status)
      VALUES (?, ?, ?, datetime('now'), ?, 'active')
      ON CONFLICT(user_id, template_id) DO NOTHING`).bind(id(), userId, itemId, reference).run();
  } else {
    const ledgerKey = `payment:${reference}`;
    await env.DB.prepare(`INSERT INTO credit_transactions
      (id, user_id, delta, balance_after, kind, payment_reference, idempotency_key, created_at)
      SELECT ?, ?, 5, COALESCE(SUM(delta), 0) + 5, 'purchase', ?, ?, datetime('now')
      FROM credit_transactions WHERE user_id = ?
      HAVING NOT EXISTS (SELECT 1 FROM credit_transactions WHERE idempotency_key = ?)`)
      .bind(id(), userId, reference, ledgerKey, userId, ledgerKey).run();
    const balance = await creditBalance(env, userId);
    await env.DB.prepare("INSERT INTO credit_accounts (user_id, balance, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(user_id) DO UPDATE SET balance = excluded.balance, updated_at = datetime('now')")
      .bind(userId, balance).run();
  }
  return json({ ok: true, duplicate: false, purpose, itemId });
}

export async function handleMonetization(request: Request, env: D1Env): Promise<Response | null> {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  const method = request.method.toUpperCase();
  if (path === "/api/career/payments/verify" && method === "POST") return json({ error: 'Use the signed Yoco webhook endpoint.' }, 410);
  if (!["/api/career/monetization", "/api/career/credits/spend"].includes(path)) return null;
  const user = await getAuthenticatedUser(request, env);
  if (!user) return json({ error: "Please sign in to continue." }, 401);
  if (path === "/api/career/monetization" && method === "GET") return json(await status(env, user));
  if (path === "/api/career/credits/spend" && method === "POST") return spendCredits(request, env, user);
  return json({ error: "Method not allowed." }, 405);
}
