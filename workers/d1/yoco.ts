import { getAuthenticatedUser, type D1Env, type UserRow } from './auth';
import { canRevealJob, findOwnedJob, handleYoco, paymentAccess, type PaymentOrder, type PaymentStore } from '../../artifacts/api-server/src/lib/yoco';
type Row = { id: string; user_id: string; item_type: PaymentOrder['itemType']; target_id: string; amount: number; status: string; checkout_id: string | null; payment_id: string | null; paid_at: string | null; expires_at: string | null; mode: string };
const map = (row: Row): PaymentOrder => ({ id: row.id, userId: row.user_id, itemType: row.item_type, targetId: row.target_id, amount: row.amount, status: row.status, checkoutId: row.checkout_id, paymentId: row.payment_id, paidAt: row.paid_at, expiresAt: row.expires_at, mode: row.mode });
export function d1PaymentStore(env: D1Env): PaymentStore {
  return {
    async create(o) { await env.DB.prepare('INSERT INTO yoco_orders (id,user_id,item_type,target_id,amount,mode) VALUES (?,?,?,?,?,?)').bind(o.id,o.userId,o.itemType,o.targetId,o.amount,o.mode).run(); },
    async attach(id, checkout) { await env.DB.prepare('UPDATE yoco_orders SET checkout_id = ? WHERE id = ? AND checkout_id IS NULL').bind(checkout,id).run(); },
    async get(id) { const row = await env.DB.prepare('SELECT * FROM yoco_orders WHERE id = ?').bind(id).first<Row>(); return row ? map(row) : null; },
    async byCheckout(id) { const row = await env.DB.prepare('SELECT * FROM yoco_orders WHERE checkout_id = ?').bind(id).first<Row>(); return row ? map(row) : null; },
    async paid(userId) { const rows = await env.DB.prepare("SELECT * FROM yoco_orders WHERE user_id = ? AND status = 'paid'").bind(userId).all<Row>(); return rows.results.map(map); },
    async complete(id, checkout, payment, paidAt, expires) { await env.DB.prepare("UPDATE yoco_orders SET status = 'paid',payment_id = ?,paid_at = ?,expires_at = ? WHERE id = ? AND checkout_id = ? AND status = 'pending'").bind(payment,paidAt,expires,id,checkout).run(); },
  };
}
export async function d1PaymentAccess(env: D1Env, user: UserRow) {
  const access = paymentAccess({ id: user.id, email: user.email, isAdmin: Boolean(user.is_admin) }, await d1PaymentStore(env).paid(user.id), env.PRIMARY_ADMIN_EMAIL);
  const legacy = await env.DB.prepare("SELECT template_id FROM user_template_entitlements WHERE user_id = ? AND status = 'active'").bind(user.id).all<{ template_id: string }>();
  access.ownedTemplateIds = [...new Set([...access.ownedTemplateIds, ...legacy.results.map(row => row.template_id)])];
  return access;
}
export async function handleD1Yoco(request: Request, env: D1Env): Promise<Response | null> {
  if (!new URL(request.url).pathname.startsWith('/api/payments/yoco/')) return null;
  const user = await getAuthenticatedUser(request, env);
  const path = new URL(request.url).pathname;
  if (user && request.method === 'POST' && (path.endsWith('/reveal-job') || path.endsWith('/create-checkout'))) {
    const input = await request.clone().json().catch(() => ({})) as Record<string, unknown>;
    if (path.endsWith('/create-checkout') && input.itemType === 'TEMPLATE_DOWNLOAD') {
      const access = await d1PaymentAccess(env, user);
      if (access.adminBypass || access.megaAccessActive || access.ownedTemplateIds.includes(String(input.targetId || ''))) return Response.json({ alreadyUnlocked: true, ...access });
    }
    if (path.endsWith('/reveal-job') || input.itemType === 'JOB_MATCH_UNLOCK') {
      const id = String(input.jobId || input.targetId || '');
      const rows = await env.DB.prepare('SELECT report_json FROM cv_reports WHERE user_id = ? ORDER BY id DESC LIMIT 20').bind(user.id).all<{ report_json: string }>();
      const job = findOwnedJob(rows.results.map(row => row.report_json), id);
      if (!job) return Response.json({ error: 'This job match was not found in your saved reviews.' }, { status: 404 });
      const access = await d1PaymentAccess(env, user);
      if (path.endsWith('/reveal-job')) return canRevealJob(access, job as { id: string; match: number }) ? Response.json(job) : Response.json({ error: 'Unlock this match for R20 or use Mega Access.' }, { status: 402 });
      if (canRevealJob(access, job as { id: string; match: number })) return Response.json({ alreadyUnlocked: true, ...access });
    }
  }
  return handleYoco(request, d1PaymentStore(env), user ? { id: user.id, email: user.email, isAdmin: Boolean(user.is_admin) } : null, env);
}
