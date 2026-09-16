# Cloudflare D1 auth for BonList (Workers edge)

## Features
- Durable **users** + **sessions** in D1
- **Signup email OTP** via **Resend** (verify before account is created)
- **Forgot / reset password** via emailed link (Resend)
- **Social OAuth** (Google, LinkedIn, Facebook) → D1 session
- Login is password-only (no OTP)
- No SMTP / Nodemailer / Render email bridge

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
| GET | `/api/career/auth/config` | `{ google, linkedin, facebook, emailConfigured, … }` |

Career aliases (`/api/career/signup`, `/login`, `/auth/verify`, …) hit the same handlers.

## One-time D1 setup

```bash
npx wrangler d1 create bonlist-db
# paste database_id into wrangler.toml

npx wrangler d1 execute bonlist-db --remote --file=./workers/d1/schema.sql
npx wrangler d1 execute bonlist-db --local --file=./workers/d1/schema.sql

npx wrangler d1 execute bonlist-db --remote --file=./workers/d1/migrations/0002_email_verification.sql
npx wrangler d1 execute bonlist-db --remote --file=./workers/d1/migrations/0005_auth_identities.sql
```

## Email (Resend only)

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM
# Example: BonList <noreply@your-verified-domain.com>
# While testing on Resend's onboarding domain, only the Resend account owner inbox receives mail.
```

For local testing without Resend, set in `wrangler.toml` `[vars]`:
`AUTH_ALLOW_DEV_OTP = "true"` — codes / reset URLs are returned in the API JSON.

## Social OAuth secrets

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put LINKEDIN_CLIENT_ID
npx wrangler secret put LINKEDIN_CLIENT_SECRET
npx wrangler secret put FACEBOOK_CLIENT_ID
npx wrangler secret put FACEBOOK_CLIENT_SECRET
```

Callback URLs (register in each provider console):

- `https://bonlist.nsukumasaka.workers.dev/api/auth/oauth/google/callback`
- `https://bonlist.nsukumasaka.workers.dev/api/auth/oauth/linkedin/callback`
- `https://bonlist.nsukumasaka.workers.dev/api/auth/oauth/facebook/callback`

## Deploy

```bash
pnpm run cf:deploy
```
