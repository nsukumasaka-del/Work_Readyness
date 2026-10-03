# Yoco payment rollout

The only new offers are R50 per template (lifetime account unlock), R20 per AI match scoring at least 50%, and R80 Mega Access (seven days from verified payment). Preview/editing and manual job search remain free. Existing customer records are preserved; legacy unpaid activation endpoints are retired.

## Required configuration

- Set server-only `YOCO_SECRET_KEY` and `YOCO_WEBHOOK_SECRET`. Never expose either to Vite or commit real values.
- Set `APP_BASE_URL` to the public HTTPS site origin. Set `PRIMARY_ADMIN_EMAIL` to the trusted administrator address if needed.
- Hosted checkout does not require the optional public key.
- Register `https://YOUR-DOMAIN/api/payments/yoco/webhook` with Yoco and save its returned signing secret.
- Apply D1 migration `workers/d1/migrations/0012_yoco_checkout.sql` using the normal deployment migration workflow before deploying the Worker.
- For PostgreSQL, apply the Drizzle payment schema through the normal reviewed database migration workflow. Local PGlite initialization creates the table automatically.

## Verification

Use Yoco test credentials first. Verify template, job and Mega purchases, cancellation, delayed webhooks, duplicate delivery, expired Mega access, administrator bypass, and 360/390/412px screens. No live charge or production deployment was performed during implementation.

Only a signed payment.succeeded webhook matching the recorded checkout, amount, currency and test/live mode grants access. Success redirects and browser storage never grant access. The verify endpoint only reads the authenticated account's order. Mega expiry is stored once; replaying a webhook does not extend it.

The payment result screen polls for webhook confirmation. If confirmation is delayed, do not pay again. Investigate Yoco delivery logs and the saved order instead.

Official references: https://developer.yoco.com/guides/online-payments/accepting-a-payment and https://developer.yoco.com/guides/online-payments/webhooks/verifying-the-events.
