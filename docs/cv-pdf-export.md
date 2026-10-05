# CV PDF export

PDF downloads use Cloudflare Browser Run / headless Chromium, not html2canvas.
The preview is captured at its unscaled A4 CSS width; zoom and mobile breakpoints are not recalculated by the print browser.

## Layout contract

- Copy the screen's resolved styles and author positioning, but do not copy application stylesheets or their print overrides.
- The download handler must not sanitize/update CV state or recalculate A4 spacers. Editing owns those changes; export snapshots the settled canvas read-only.
- Do not auto-space manually translated blocks: their drag coordinates are authoritative. Measure their visible bounds for pagination, but never move them again. Disable copied section/heading fragmentation rules inside the already-sliced export frames.
- Bake text, fill, border and background colours into static sRGB declarations; force exact colour printing and a light document colour scheme. Application dark/print rules never repaint the snapshot.
- Expand root and overflowing document scroll containers only in the clone. Measure the full off-screen clone after converting editable controls, so viewport heights cannot cut off continuation pages. Preserve intentionally clipped managed-page slices.
- Embed the relevant font-face files. Font-download failures stop export rather than silently changing typography. Inter, Roboto, Garamond and Mono choices use portable web fonts.
- For a settled preview without clipped scrollers, preserve native field dimensions/typography and serialize readonly field values. Paint these fields at the preview's exact unzoomed coordinates over invisible in-flow placeholders; this avoids screen/print textarea baseline differences. Copy resolved container heights/grid rows and use the preview's page count. Do not convert compact input fields to wrapping spans or recompute spacers.
- Retain full captured control typography and authored drag translations. Never pin section Y coordinates back to old native-control bounds: wrapped qualifications must push later sections down instead of overlapping them. Recompute keep-together spacers in the clone only, never in the live canvas.
- Section headings contain actual words, not spaces between individual characters.
- Preview and export share A4 page metrics and DOM-order spacer measurement. Nested blocks account for earlier moves, and trailing paper padding is not a new page.
- Slice the continuous two-column canvas with translated content inside exact 210mm x 297mm frames. Chromium receives zero print margins, background printing and scale 1.
- Wait for fonts, images and layout commits before printing. Remove editor controls and editable bindings from the snapshot.
- Load every used font weight/style explicitly before `document.fonts.ready`, then allow two animation frames for layout. Preview textareas refit after font loading. Worker rendering waits for network idle, the same font barrier, decoded images and a settled layout.
- Animation-frame waits apply only to the interactive client. The Worker disables JavaScript for untrusted HTML; animation-frame callbacks do not fire in that configuration. Flush final layout with a synchronous geometry read after font/image readiness instead.
- `data-export-layout="preview-locked"` snapshots retain their supplied frames and boundaries in the Worker. Do not repaginate, shrink, or move their content. Legacy/clipped snapshots retain the overflow recovery path; only that path may add frames or adjust line boundaries.

## Regression harness

`scripts/pdf-export-regression.mjs` requires Playwright/Chromium and esbuild. The optional `BONLIST_RUNTIME_MODULES` points to a bundled Node package directory; `PDF_TEST_BROWSER` selects an installed Chromium executable.

Set `PDF_TEST_PYTHON` to a Python executable containing pypdf to check PDF text/page integrity. Set `PDF_TEST_FONT` to an available test TTF to exercise imported-font embedding. Then run:

`node scripts/pdf-export-regression.mjs`

The fixtures cover one/two columns, fixed-height/nested scrollers, modern OKLCH/HSL colours, multi-page bullet lists, hostile application print rules, exact column widths, heading wrapping, font embedding and control overflow. With Python enabled they require 42 bullets exactly once, coloured PDF text, final-page content and no blank continuation pages. Poppler renders the actual PDFs for visual inspection.

Intermediate PDFs/PNGs are written to `tmp/pdfs`. Visually inspect the rendered PDF pages, not just DOM screenshots. A production rollout still requires deployment and a check using the user's previously failing CV.

`scripts/pdf-preview-parity-regression.mjs` requires a one-page screen fixture to produce exactly one PDF page with all reference contacts and unchanged field rectangles. `PDF_TEST_OLD=1` reproduces the unwanted second page. Real builder integration also compares page counts and every visible field rectangle; `PDF_TEST_PREVIEW_PARITY=1` seeds compact one-page design preferences for the dense-sidebar case.

After the real builder integration writes its request HTML, run `wrangler deploy --dry-run --outdir tmp/pdfs/worker-recovery` and `node scripts/pdf-worker-readiness-regression.mjs`. This executes the actual compiled Worker readiness callback in a script-disabled Chromium context, with a bounded timeout, and generates a PDF from the real request. With `PDF_TEST_PYTHON`, it also checks all References names/contact details on page 1. The pre-fix animation-frame wait times out; the synchronous layout flush completes.

`scripts/pdf-dense-sidebar-regression.mjs` covers three long qualifications, moved Skills, a dense Languages list and full References. `PDF_TEST_OLD=1` must fail with Education/Skills overlap; current code must pass. The renderer test deliberately supplies a stale single-page snapshot and requires complete referee names/contact details on continuation pages. Set `PDF_TEST_DENSE_SIDEBAR=1` for equivalent real-builder integration coverage.

The Page 1 References fixture executes the actual builder download handler with isolated auth/UI dependencies and rejects layout mutations. It verifies unchanged DOM/coordinates and requires the References heading, both names, phone and email on PDF page 1.

For primary integration coverage, start the actual Vite app and set `PDF_TEST_APP_URL` (for example `http://127.0.0.1:5175`) before running the regression harness. This mounts the real application, hydrates synthetic CV/auth data, drags References using the real handle, clicks through the actual download dialogs, intercepts only `/api/` requests, and renders the submitted HTML using Chromium's Worker print options. It checks payload contacts, preview-to-print coordinates and all reference details on PDF page 1. Repeat against `vite preview` after a production build. `scripts/pdf-builder-integration.mjs` can also run independently. All APIs are mocked; it must never use real accounts or payments. `debugCvPdf=1` explicitly logs outgoing CV HTML in the local console for diagnosis (contains personal data; remove it afterwards).
