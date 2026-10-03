import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
export const yocoOrdersTable = pgTable('yoco_orders', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), itemType: text('item_type').notNull(), targetId: text('target_id').notNull(),
  amount: integer('amount').notNull(), status: text('status').notNull().default('pending'), mode: text('mode').notNull(),
  checkoutId: text('checkout_id').unique(), paymentId: text('payment_id').unique(), paidAt: text('paid_at'), expiresAt: text('expires_at'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
