# Cloudflare D1 auth for BonList

## Features
- Durable **users** + **sessions** in D1
- **Signup email OTP** (verify before account is created)
- **Forgot / reset password** via emailed link
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

## One-time D1 setup

```bash
npx wrangler d1 create bonlist-db
# paste database_id into wrangler.toml

npx wrangler d1 execute bonlist-db --remote --file=./workers/d1/schema.sql
npx wrangler d1 execute bonlist-db --local --file=./workers/d1/schema.sql

# If DB already existed from v1:
npx wrangler d1 execute bonlist-db --remote --file=./workers/d1/migrations/0002_email_verification.sql
npx wrangler d1 execute bonlist-db --local --file=./workers/d1/migrations/0002_email_verification.sql
```

## Email (Resend)

```bash
npx wrangler secret put RESEND_API_KEY
# paste re_... key

npx wrangler secret put EMAIL_FROM
# e.g. BonList <onboarding@your-verified-domain.com>
```

For local testing without Resend, set in `wrangler.toml` `[vars]`:
`AUTH_ALLOW_DEV_OTP = "true"` — codes / reset URLs are returned in the API JSON.

## Deploy

```bash
pnpm run cf:deploy
```
