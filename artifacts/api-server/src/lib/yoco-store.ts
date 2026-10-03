import { db, adminUsersTable, yocoOrdersTable } from '@workspace/db';
import { and, eq } from 'drizzle-orm';
import { paymentAccess, type PaymentOrder, type PaymentStore } from './yoco';
const map = (o: typeof yocoOrdersTable.$inferSelect): PaymentOrder => ({ ...o, itemType: o.itemType as PaymentOrder['itemType'] });
export const nodePaymentStore: PaymentStore = {
  async create(o) { await db.insert(yocoOrdersTable).values(o); },
  async attach(id, checkoutId) { await db.update(yocoOrdersTable).set({ checkoutId }).where(eq(yocoOrdersTable.id,id)); },
  async get(id) { const [row] = await db.select().from(yocoOrdersTable).where(eq(yocoOrdersTable.id,id)).limit(1); return row ? map(row) : null; },
  async byCheckout(id) { const [row] = await db.select().from(yocoOrdersTable).where(eq(yocoOrdersTable.checkoutId,id)).limit(1); return row ? map(row) : null; },
  async paid(userId) { return (await db.select().from(yocoOrdersTable).where(and(eq(yocoOrdersTable.userId,userId),eq(yocoOrdersTable.status,'paid')))).map(map); },
  async complete(id, checkoutId, paymentId, paidAt, expiresAt) { await db.update(yocoOrdersTable).set({ status: 'paid', paymentId, paidAt, expiresAt }).where(and(eq(yocoOrdersTable.id,id),eq(yocoOrdersTable.checkoutId,checkoutId),eq(yocoOrdersTable.status,'pending'))); },
};
export async function nodePaymentAccess(profile: { id: number; email: string }) {
  const [admin] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.email,profile.email.toLowerCase())).limit(1);
  return paymentAccess({ id: String(profile.id), email: profile.email, isAdmin: Boolean(admin && admin.status === 'active') }, await nodePaymentStore.paid(String(profile.id)), process.env.PRIMARY_ADMIN_EMAIL);
}
