# BonList AdSense readiness audit

Audit date: 2 October 2026. Production: https://www.bonlist.site/.

This is an engineering assessment, not Google's approval score. Code changes are local and have not been deployed.

## Evidence and current production blockers

All 21 sitemap URLs returned HTTP 200. `robots.txt` and `ads.txt` returned plain text; `sitemap.xml` returned XML with canonical public URLs. However, every HTML route returned the same 2,233-byte homepage shell, homepage title/canonical, `index, follow`, no initial H1, and no initial structured data. `/cv-builder`, `/diagnostic`, and `/dashboard` had no server noindex. An unknown route returned 200. HTTP and apex variants returned 200 rather than redirecting to HTTPS www.

The implementation fixes route metadata and fallback content in the Worker, private noindex, public 404 handling, asset caching, and centralized consent-gated advertising. The live failures remain until deployment and a canonical redirect rule are verified.

## Requirement classifications

| Requirement | Assessment after implementation | Evidence / outstanding work |
| --- | --- | --- |
| 1 Production crawlability | PARTIAL | Public resources are reachable; meaningful initial HTML fix awaits deployment. |
| 2 Robots | PASS locally | Public rendering assets remain crawlable. Only API crawling is blocked, allowing private HTML noindex to be observed. |
| 3 Sitemap | PASS | 21 unique canonical public URLs; generated automatically on build; private and thin category routes excluded. |
| 4 Indexing control | PASS locally / FAIL live | Shared server/client policy and X-Robots-Tag. No private CV data enters SEO policy. |
| 5 Search Console | PARTIAL | DNS verification and URL inspection require the owner's account. No credentials invented. |
| 6 Content quality | PARTIAL | Existing genuine article and guide structures retained; unsupported 100% factual-fidelity claim removed. Editorial and originality review remain human tasks. |
| 7 Career Advice | PASS in code | Four articles with headings, category, date, organization attribution, FAQs and related links. Initial route metadata fixed. |
| 8 Job content | PASS in code | Public pages are application guides; actual vacancy details remain in the workspace. No vacancy facts invented. |
| 9 Duplicate jobs | PASS in code / PARTIAL operationally | Imported private vacancy routes are noindex and excluded from sitemap/ads. External source rights need review. |
| 10 Metadata | PASS locally / FAIL live | All sitemap titles and descriptions are unique; server and client share policy. |
| 11 Canonicals | PARTIAL | Per-page canonical/query handling fixed locally; Cloudflare apex/HTTP redirects require configuration. |
| 12 Structured data | PASS locally / FAIL initial live HTML | Organization, WebSite, Article, Breadcrumb and FAQ data. Generic guides deliberately omit JobPosting. Google's rich-result validation remains pending. |
| 13 Trust pages | PASS in code | Existing About, Contact, Privacy, Terms, Cookies and Data pages are public and linked. |
| 14 Privacy policy | PARTIAL | Operational wording exists; retention, provider disclosures and POPIA wording require owner/legal review. |
| 15 Consent | PARTIAL | Accept/reject/managed choices persist and dispatch reactive updates. Ads default off; certified CMP and live UI verification remain pending. |
| 16 Ownership verification | PASS locally | Real-ID Worker variable emits a verification meta tag without activating advertising. |
| 17 ads.txt | PASS serving / PARTIAL configuration | Live plain-text endpoint; exact Google-issued seller entry awaits the real account. |
| 18 Central ad architecture | PASS locally | AdProvider, AdSlot, configuration, explicit eligible-route allowlist and global flag. |
| 19 Article placements | PASS prepared | Intro, natural middle break, end. Real slot IDs are individually optional. |
| 20 Vacancy-detail placements | NOT APPLICABLE | Actual vacancies are private workspace content and remain ad-free. |
| 21 Public job category placements | PASS prepared | One clearly labelled unit on guide/index templates; no thin location permutations created. |
| 22 Homepage | PASS | Ad-free. |
| 23 Ad-free routes | PASS locally | All routes outside the public-content allowlist blocked. Private navigation clears the previously executed advertising runtime before mounting content. |
| 24 Accidental clicks | PASS prepared / PARTIAL live | Separate Advertisement containers and spacing; real creative inspection awaits activation. |
| 25 Ad density | PASS prepared | No slots show without individual IDs. Start with one middle unit; top/bottom remain optional. |
| 26 Responsive ads | PARTIAL | Responsive container/code prepared; real creative viewport checks not available. |
| 27 CLS | PARTIAL | No disabled-ad placeholders; live ad loading and CLS measurement remain unverified. |
| 28 Auto ads | PARTIAL | Keep disabled; configure equivalent exclusions in AdSense before any future use. No script on directly loaded private pages. |
| 29 Other networks | PASS | Central provider boundary exists; no additional networks/scripts installed. |
| 30 Sponsorship | NOT APPLICABLE | No new sponsor products implemented. Existing enquiries stay separate from display ads. |
| 31 Performance | PARTIAL | Main JS reduced from about 2.08 MB to 1.14 MB; hashed asset caching fixed. Large-chunk warnings remain. PageSpeed API returned 429, so LCP/INP/CLS are unverified. |
| 32 Mobile | PARTIAL | Responsive source reviewed; browser tool timed out twice. No claimed visual pass at 320/375/390/tablet/desktop widths. |
| 33 Accessibility | PARTIAL | Browser zoom restored; existing semantic headings/labels preserved. Keyboard/contrast browser audit remains unverified. |
| 34 Links | PARTIAL | All sitemap URLs reachable; related article/footer destinations resolve in code. SPA fallback prevented meaningful live broken-link detection before deployment. |
| 35 404 | PASS locally / FAIL live | Unknown route returns HTTP 404 and public NotFound page; no ads. |
| 36 Analytics | PASS reviewed | Existing consent-gated tracker retained; path query/hash stripped and referrer reduced to origin. No duplicate analytics integration added. |
| 37 Security/privacy | PARTIAL | Authentication retained; private metadata contains no personal content; advertising blocked in private and native-app routes. Complete authenticated security testing is outside this session's coverage. |
| 38 Core regressions | PARTIAL | 16 existing extraction/matching tests pass; build/typecheck run. Full signup/login/upload/export/payment/admin browser workflows not executed. |
| 39 No redesign | PASS | Changes limited to metadata, privacy, advertising preparation, caching, accessibility and lazy loading. |
| 40 Automated checks | PARTIAL | Nine audit regressions and 16 existing tests pass. No lint script configured; live viewport/creative/Core Web Vitals checks remain unverified. |

## Reproducible checks

Final results: full workspace build PASS; final frontend build PASS; final frontend typecheck PASS; Worker dry-run compilation PASS; nine audit tests PASS; 16 existing CV tests PASS; `git diff --check` PASS. No configured lint command exists. Non-fatal source-map reporting and large-chunk warnings remain. Final main JavaScript is 1,138.61 kB (339.65 kB gzip). Browser checks timed out twice and the live PageSpeed request returned HTTP 429; visual checks and Core Web Vitals cannot be reported as passed. No production deployment or APK release was performed.

- `pnpm run test:adsense`: sitemap, unique metadata, server HTML, private indexing, ownership verification, related links, advertising allowlist, persisted consent.
- `npm --prefix artifacts/api-server run test`: existing extraction, factuality and ATS role-alignment tests.
- `node scripts/audit-public-production.mjs`: read-only production URL/status/metadata check.
- Worker dry run must bypass the repository's deploy shim, which otherwise intercepts deploy commands and ignores arguments. Set `BONLIST_SKIP_WRANGLER_SHIM=1` before `wrangler deploy --dry-run`. No deployment was performed during this audit.

## Deployment and owner actions

Deploy the reviewed changes, then repeat the production audit. Configure a Cloudflare redirect rule for both `http://bonlist.site/*` and `http://www.bonlist.site/*`, and for `https://bonlist.site/*`, to `https://www.bonlist.site` while preserving path and query. The current Worker route covers HTTPS www; its redirect code alone cannot control requests outside that route.

In Search Console, create the `bonlist.site` Domain property, publish the supplied DNS TXT record, verify ownership, and submit `https://www.bonlist.site/sitemap.xml`. Inspect the homepage, Career Advice index, public job-guide index/categories and several articles. `/jobs` is a private workspace and should remain excluded. Request indexing only for indexable public canonical URLs; monitor Pages, Sitemaps, Core Web Vitals, Security Issues and Manual Actions.

Use `adsense-configuration.md` for real publisher ID, meta verification, ad units and ads.txt. Keep ads disabled until approval and appropriate consent configuration. A custom local preference panel does not replace Google's certified CMP where required.

Google retains the approval decision. The live site cannot yet be declared free of technical blockers because deployment and final browser verification are pending.
