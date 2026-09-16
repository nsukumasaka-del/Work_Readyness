# Cloudflare D1 auth for BonList

## Features
- Durable **users** + **sessions** in D1
- **Signup email OTP** (verify before account is created)
- **Forgot / reset password** via emailed link
- **Social OAuth** (Google, LinkedIn, Facebook) → D1 session
- Login is password-only (no OTP)

## Routes
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/register` | Start signup + send code |
| POST | `/api/auth/verify` | Confirm code → create user + session |
| POST | `/api/auth/resend` | Resend code (optional new email) |
| POST | `/api/auth/login` | Password login |
| GET | `/api/auth/me` | Current user |
| POST | `/api/auth/logout` | End session |
| POST | `/api/auth/forgot-password` | Email reset link |
| POST | `/api/auth/reset-password` | Set new password from token |
| GET | `/api/auth/oauth/:provider/start` | Start OAuth (`google` \| `linkedin` \| `facebook`) |
| GET | `/api/auth/oauth/:provider/callback` | OAuth callback → D1 session cookie |

## One-time D1 setup

```bash
npx wrangler d1 create bonlist-db
# paste database_id into wrangler.toml

npx wrangler d1 execute bonlist-db --remote --file=./workers/d1/schema.sql
npx wrangler d1 execute bonlist-db --local --file=./workers/d1/schema.sql

# If DB already existed from v1:
npx wrangler d1 execute bonlist-db --remote --file=./workers/d1/migrations/0002_email_verification.sql
npx wrangler d1 execute bonlist-db --local --file=./workers/d1/migrations/0002_email_verification.sql
npx wrangler d1 execute bonlist-db --remote --file=./workers/d1/migrations/0005_auth_identities.sql
```

## Email

**Preferred — Resend**

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM
# e.g. BonList <onboarding@your-verified-domain.com>
```

**Fallback — Render SMTP bridge** (Workers cannot open raw SMTP sockets)

1. Set the same secret on Worker and Render API:
   ```bash
   npx wrangler secret put INTERNAL_EMAIL_SECRET
   ```
   Also set `INTERNAL_EMAIL_SECRET` on Render, plus working `SMTP_*` (or Resend) there.
2. Worker POSTs to `{API_UPSTREAM_URL}/api/internal/send-email`.

For local testing without email, set in `wrangler.toml` `[vars]`:
`AUTH_ALLOW_DEV_OTP = "true"` — codes / reset URLs are returned in the API JSON.

## Social OAuth secrets

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put LINKEDIN_CLIENT_ID
npx wrangler secret put LINKEDIN_CLIENT_SECRET
npx wrangler secret put FACEBOOK_APP_ID
npx wrangler secret put FACEBOOK_APP_SECRET
```

Callback URLs:

- `https://bonlist.nsukumasaka.workers.dev/api/auth/oauth/google/callback`
- `https://bonlist.nsukumasaka.workers.dev/api/auth/oauth/linkedin/callback`
- `https://bonlist.nsukumasaka.workers.dev/api/auth/oauth/facebook/callback`

## Deploy

```bash
pnpm run cf:deploy
```
