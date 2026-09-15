# Cloudflare D1 auth for BonList

## What this gives you
- Durable **users** + **sessions** in Cloudflare D1 (SQLite) — free tier, survives redeploys
- Worker routes:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `GET /api/auth/me`
  - `POST /api/auth/logout`
- BonList UI aliases (`/api/career/login`, `/api/career/signup`, …) also hit D1

CV / jobs / diagnostics still proxy to Render via `API_UPSTREAM_URL` when set.

## One-time setup

```bash
# 1) Create the D1 database
npx wrangler d1 create bonlist-db

# 2) Copy the returned database_id into wrangler.toml:
#    [[d1_databases]]
#    binding = "DB"
#    database_name = "bonlist-db"
#    database_id = "<paste-id-here>"
#    preview_database_id = "<paste-id-here>"

# 3) Apply schema (local + production)
npx wrangler d1 execute bonlist-db --local --file=./workers/d1/schema.sql
npx wrangler d1 execute bonlist-db --remote --file=./workers/d1/schema.sql

# 4) Deploy Worker + SPA
pnpm run cf:deploy
```

## Verify

```bash
# Local worker (optional)
npx wrangler dev -c wrangler.toml

# Register
curl -i -X POST http://127.0.0.1:8787/api/auth/register \
  -H "content-type: application/json" \
  -d "{\"email\":\"you@example.com\",\"password\":\"password123\",\"name\":\"You\"}"

# Login
curl -i -c cookies.txt -X POST http://127.0.0.1:8787/api/auth/login \
  -H "content-type: application/json" \
  -d "{\"email\":\"you@example.com\",\"password\":\"password123\"}"

# Me
curl -i -b cookies.txt http://127.0.0.1:8787/api/auth/me

# Logout
curl -i -b cookies.txt -X POST http://127.0.0.1:8787/api/auth/logout
```

## Files
- `workers/d1/schema.sql` — D1 tables
- `workers/d1/crypto.ts` — PBKDF2 via Web Crypto
- `workers/d1/auth.ts` — auth handlers
- `workers/gateway.ts` — routes D1 auth first, then proxies other `/api`
- `wrangler.toml` — `[[d1_databases]]` binding `DB`
