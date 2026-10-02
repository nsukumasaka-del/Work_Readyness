# BonList AdSense activation

Advertising is disabled by default. Do not insert a sample publisher ID or placeholder ad units.

## Ownership verification before activation

Once Google supplies the real `ca-pub-...` identifier, add `ADSENSE_SITE_VERIFICATION_CLIENT` with that identifier to `[vars]` in `wrangler.toml` and deploy. Keep the binding in deployment configuration so a later deploy does not remove a dashboard-only variable. The Worker emits Google's `google-adsense-account` meta tag on indexable public pages. This verifies ownership without activating ads or loading advertising JavaScript. Keep `VITE_ADS_ENABLED=false` while applying. DNS verification remains available for Search Console.

## Production build variables

Set these values in the Cloudflare build environment only after Google approves the site and supplies the real identifiers:

```text
VITE_ADS_ENABLED=true
VITE_ADS_PROVIDER=google-adsense
VITE_ADSENSE_CLIENT_ID=ca-pub-0000000000000000
VITE_ADSENSE_SLOT_ARTICLE_TOP=0000000000
VITE_ADSENSE_SLOT_ARTICLE_MIDDLE=0000000000
VITE_ADSENSE_SLOT_ARTICLE_BOTTOM=0000000000
VITE_ADSENSE_SLOT_JOBS_FEED=0000000000
VITE_ADSENSE_SLOT_JOB_GUIDE=0000000000
```

Replace every example number with the value issued for the BonList account. The app rejects invalid publisher and slot formats and renders no empty placeholder when configuration is absent.

Start with one mid-article unit per long article; top and bottom units are optional and should be enabled only where publisher content comfortably exceeds ad content. Do not enable all units automatically.

## ads.txt

After approval, replace the comments in `artifacts/careerbridge-sa/public/ads.txt` with the exact line shown in the AdSense account. A typical Google-direct entry has this shape:

```text
google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0
```

Use the publisher number without the `ca-` prefix in `ads.txt`. Verify the final file at `https://www.bonlist.site/ads.txt`.

## Placement and privacy rules

- Eligible pages are published Career Advice articles, `/jobs/explore`, and the six public job-guide pages.
- No ads are allowed on the homepage, authentication, account, admin, CV builder/review, payment, coaching, programme, interview, or other private workspace routes.
- The AdSense script loads only after the visitor explicitly enables Advertising in cookie preferences.
- Keep Auto ads disabled unless equivalent URL exclusions are configured in AdSense. Manual in-content placements are the reviewed default.
- Navigating away from an eligible ad page reloads the document before mounting private content, because removing a script cannot unload code that already executed.
- Display ads are disabled in the bundled Android application. Review Google's WebView requirements before considering an in-app advertising integration.
- Before serving ads to visitors in regions where Google requires it, integrate a Google-certified CMP and the applicable consent signals. The local preferences panel is not a certified CMP.
