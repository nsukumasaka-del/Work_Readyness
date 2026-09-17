# BonList Cloudflare setup

This project uses one Cloudflare Worker for the site and API, with Cloudflare
D1 for authentication, career profiles, CV reviews, and the edge CV builder.
The browser extracts readable PDF/DOCX text before it sends the request, so
the Worker does not depend on Node-only PDF libraries.

## 1. Apply the D1 schema

Run these commands from the repository root. Use the same database name and
database ID that are in `wrangler.toml`.

```bash
npx wrangler d1 execute bonlist-db --remote --file=./workers/d1/schema.sql
npx wrangler d1 execute bonlist-db --remote --file=./workers/d1/migrations/0002_email_verification.sql
npx wrangler d1 execute bonlist-db --remote --file=./workers/d1/migrations/0003_verification_codes.sql
npx wrangler d1 execute bonlist-db --remote --file=./workers/d1/migrations/0004_admin_flag.sql
npx wrangler d1 execute bonlist-db --remote --file=./workers/d1/migrations/0005_auth_identities.sql
npx wrangler d1 execute bonlist-db --remote --file=./workers/d1/migrations/0006_cv_review.sql
npx wrangler d1 execute bonlist-db --remote --file=./workers/d1/migrations/0007_cv_builder.sql
```

The `0006` migration is required for CV review/profile storage. The `0007`
migration prepares persistent edge CV storage for later builder versioning.

## 2. Configure the Worker

Set the public site URL in `wrangler.toml` (or as a Worker variable). It must
match the URL users open, including a custom domain if you use one:

```toml
[vars]
APP_BASE_URL = "https://your-domain.example"
```

Deploy with:

```bash
pnpm install
pnpm run cf:deploy
```

`API_UPSTREAM_URL` may remain configured for legacy career endpoints that have
not yet moved to the Worker. The profile, CV parse-upload, CV diagnostic, and
CV generate endpoints now use D1 when `DB` is present.

## 3. Email verification and password reset

Create the Worker secrets:

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM
```

`EMAIL_FROM` must be a sender permitted by your Resend domain. For local
testing only, `AUTH_ALLOW_DEV_OTP = "true"` can be used in a non-production
environment; do not enable it in production.

## 4. Enable Google sign-in

1. In Google Cloud Console, create or select a project.
2. Configure the OAuth consent screen. While the app is in Testing, add every
   person who will test it under Test users.
3. Create an OAuth Client ID for a Web application.
4. Add the deployed callback URL under **Authorized redirect URIs**:

   `https://your-domain.example/api/auth/oauth/google/callback`

5. Add the Worker secrets:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Google enables the button automatically once both secrets exist. The OAuth
scope requested by the Worker is `openid email profile`.

## 5. Enable LinkedIn sign-in

1. In the LinkedIn Developer Portal, create an app and connect the
   **Sign In with LinkedIn using OpenID Connect** product.
2. Add this callback under the app's **Authorized redirect URLs**:

   `https://your-domain.example/api/auth/oauth/linkedin/callback`

3. Add the Worker secrets:

```bash
npx wrangler secret put LINKEDIN_CLIENT_ID
npx wrangler secret put LINKEDIN_CLIENT_SECRET
```

The Worker uses LinkedIn's OIDC `openid profile email` scopes. Make sure the
app is permitted to request those scopes before testing.

## 6. Enable Facebook sign-in

1. In Meta for Developers, create an app with the Consumer use case and add
   **Facebook Login**.
2. In Facebook Login settings, add this valid OAuth redirect URI:

   `https://your-domain.example/api/auth/oauth/facebook/callback`

3. Add the Worker secrets:

```bash
npx wrangler secret put FACEBOOK_CLIENT_ID
npx wrangler secret put FACEBOOK_CLIENT_SECRET
```

`FACEBOOK_CLIENT_ID` is the App ID and `FACEBOOK_CLIENT_SECRET` is the App
Secret. During development, add test users or keep the app in development
mode. Before public launch, complete Meta's requested app review and switch
the app to Live.

## 7. Verify configuration

Open this endpoint after deployment:

`https://your-domain.example/api/career/auth/config`

It should return `google: true`, `linkedin: true`, and/or `facebook: true`
for each provider whose two Worker secrets are present. Test each provider
from both `/login` and `/signup`, then test a PDF with selectable text and the
CV review flow. Scanned image-only PDFs still require OCR or pasted text.