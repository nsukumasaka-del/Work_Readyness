import { Router } from 'express';
import { requireUser, type AuthedUserRequest } from '../lib/user-sessions';
import { handleYoco } from '../lib/yoco';
import { nodePaymentAccess, nodePaymentStore } from '../lib/yoco-store';
import { db, diagnosticReportsTable } from '@workspace/db';
import { desc, eq } from 'drizzle-orm';
import { canRevealJob, findOwnedJob } from '../lib/yoco';
const router = Router();
router.use('/payments/yoco', (req, res, next) => {
  if (req.path === '/webhook') return next();
  return requireUser(req, res, next);
});
router.all('/payments/yoco/:action', async (req: AuthedUserRequest, res) => {
  try {
    const profile = req.userProfile;
    const access = profile ? await nodePaymentAccess(profile) : null;
    if (profile && (req.params.action === 'reveal-job' || (req.params.action === 'create-checkout' && req.body?.itemType === 'JOB_MATCH_UNLOCK'))) {
      const rows = await db.select().from(diagnosticReportsTable).where(eq(diagnosticReportsTable.profileId,profile.id)).orderBy(desc(diagnosticReportsTable.id)).limit(20);
      const job = findOwnedJob(rows.map(row => row.reportJson || ''), String(req.body?.jobId || req.body?.targetId || ''));
      if (!job) { res.status(404).json({ error: 'This match was not found in your saved reviews.' }); return; }
      if (req.params.action === 'reveal-job') { res.status(canRevealJob(access!,job as { id: string; match: number }) ? 200 : 402).json(canRevealJob(access!,job as { id: string; match: number }) ? job : { error: 'Unlock this match for R20 or use Mega Access.' }); return; }
      if (canRevealJob(access!,job as { id: string; match: number })) { res.json({ alreadyUnlocked: true, ...access }); return; }
    }
    const headers = new Headers();
    for (const key of ['webhook-id','webhook-timestamp','webhook-signature']) if (typeof req.headers[key] === 'string') headers.set(key,req.headers[key]);
    const raw = (req as typeof req & { rawBody?: string }).rawBody;
    const response = await handleYoco(new Request(`https://bonlist.invalid/api/payments/yoco/${req.params.action}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`, {
      method: req.method, headers, ...(['GET','HEAD'].includes(req.method) ? {} : { body: req.params.action === 'webhook' ? raw || '' : JSON.stringify(req.body) }),
    }), nodePaymentStore, profile ? { id: String(profile.id),email: profile.email,isAdmin: access?.adminBypass } : null,
    { YOCO_SECRET_KEY: process.env.YOCO_SECRET_KEY, YOCO_WEBHOOK_SECRET: process.env.YOCO_WEBHOOK_SECRET, PRIMARY_ADMIN_EMAIL: process.env.PRIMARY_ADMIN_EMAIL, APP_BASE_URL: process.env.APP_BASE_URL });
    res.status(response.status).type('json').send(await response.text());
  } catch { res.status(500).json({ error: 'Payment service unavailable.' }); }
});
router.get('/career/monetization', requireUser, async (req: AuthedUserRequest,res) => {
  const access = await nodePaymentAccess(req.userProfile!);
  res.json({ ...access, credits: 0, creditPack: { priceZar: 50,credits: 5 }, freeTemplateIds: [], premiumTemplates: [], features: [], recentTransactions: [] });
});
export default router;
