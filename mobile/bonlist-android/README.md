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

That URL must serve both the website **and** `/api` (same as your Replit/production deploy).

Then rebuild/sync the APK:

```bash
pnpm mobile:sync
```

After that:
- The WebView can load your live site (Capacitor `server.url`)
- Bundled builds also bake that origin as the API base so signup/login work

Without `LIVE_APP_URL`, the APK only has static files — `/api` calls return the HTML app shell and signup shows a non-JSON error.

## Commands (repo root)

| Command | Purpose |
|--------|---------|
| `pnpm mobile:sync` | **Build web UI → mirror → Capacitor sync** (use this after web changes) |
| `pnpm mobile:copy` | Mirror existing web dist + cap sync (no rebuild) |
| `pnpm mobile:open` | Open Android Studio |
| `pnpm mobile:dev` | Point Android at local Vite (`CAP_LIVE_RELOAD`) for instant edits |

> Editing the web app in `pnpm dev` does **not** update the installed APK by itself.
> After UI changes you want on the phone: run `pnpm mobile:sync`, then reinstall/run the app in Android Studio.
> For instant feedback while coding, use `pnpm dev` + `pnpm mobile:dev` instead.

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
