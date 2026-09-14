# BonList Android (Capacitor) — integrated with the web app

## One UI for web + Android

**Edit the product only in** `artifacts/careerbridge-sa`.

The Android shell does **not** have a separate React UI. Every web build mirrors into this app:

1. You change `artifacts/careerbridge-sa`
2. `pnpm --filter @workspace/careerbridge-sa build` (or `pnpm mobile:sync`)
3. `postbuild` copies dist → `mobile/bonlist-android/www` and runs `cap sync android`

So web changes flow into Android automatically. There is nothing to “port” twice.

## Stay live in sync (recommended)

In the repo root `.env`:

```env
LIVE_APP_URL=https://YOUR-DEPLOYED-BONLIST-SITE
```

Then rebuild/sync the APK once. After that, **deploying the website updates the phone app** (WebView loads the live site). Web and Android always show the same product.

## Commands (repo root)

| Command | Purpose |
|--------|---------|
| `pnpm mobile:sync` | Build web UI → mirror → Capacitor sync |
| `pnpm mobile:open` | Open Android Studio |
| `pnpm mobile:dev` | Point Android at local Vite (`CAP_LIVE_RELOAD`) for instant edits |

### Local live reload

1. `pnpm dev` (web on port 19678)
2. Emulator: `pnpm mobile:dev`
3. Physical phone:  
   `$env:CAP_LIVE_RELOAD_URL="http://YOUR_PC_LAN_IP:19678"; pnpm mobile:dev`

## Do not edit

- `www/` — generated mirror (overwritten)
- Duplicate screens inside `android/` for product UI

Native-only Android settings (icons, splash, permissions) stay under `android/`.

## App ID

`com.bonlist.careerbridge`
