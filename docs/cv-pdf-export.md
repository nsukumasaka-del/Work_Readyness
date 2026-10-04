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
- Convert editable controls to selectable text with the same width, typography, minimum height and positioning. Never force arbitrary mid-word breaks or fixed text heights.
- Retain the full captured control typography and anchor `[data-a4-id]` blocks to their live, unzoomed coordinates after control conversion. Native input baselines must not shift subsequent sections in the print snapshot.
- Section headings contain actual words, not spaces between individual characters.
- Preview and export share A4 page metrics and DOM-order spacer measurement. Nested blocks account for earlier moves, and trailing paper padding is not a new page.
- Slice the continuous two-column canvas with translated content inside exact 210mm x 297mm frames. Chromium receives zero print margins, background printing and scale 1.
- Wait for fonts, images and layout commits before printing. Remove editor controls and editable bindings from the snapshot.

## Regression harness

`scripts/pdf-export-regression.mjs` requires Playwright/Chromium and esbuild. The optional `BONLIST_RUNTIME_MODULES` points to a bundled Node package directory; `PDF_TEST_BROWSER` selects an installed Chromium executable.

Set `PDF_TEST_PYTHON` to a Python executable containing pypdf to check PDF text/page integrity. Set `PDF_TEST_FONT` to an available test TTF to exercise imported-font embedding. Then run:

`node scripts/pdf-export-regression.mjs`

The fixtures cover one/two columns, fixed-height/nested scrollers, modern OKLCH/HSL colours, multi-page bullet lists, hostile application print rules, exact column widths, heading wrapping, font embedding and control overflow. With Python enabled they require 42 bullets exactly once, coloured PDF text, final-page content and no blank continuation pages. Poppler renders the actual PDFs for visual inspection.

Intermediate PDFs/PNGs are written to `tmp/pdfs`. Visually inspect the rendered PDF pages, not just DOM screenshots. A production rollout still requires deployment and a check using the user's previously failing CV.

The Page 1 References fixture executes the actual builder download handler with isolated auth/UI dependencies and rejects layout mutations. It verifies unchanged DOM/coordinates and requires the References heading, both names, phone and email on PDF page 1.

For primary integration coverage, start the actual Vite app and set `PDF_TEST_APP_URL` (for example `http://127.0.0.1:5175`) before running the regression harness. This mounts the real application, hydrates synthetic CV/auth data, drags References using the real handle, clicks through the actual download dialogs, intercepts only `/api/` requests, and renders the submitted HTML using Chromium's Worker print options. It checks payload contacts, preview-to-print coordinates and all reference details on PDF page 1. Repeat against `vite preview` after a production build. `scripts/pdf-builder-integration.mjs` can also run independently. All APIs are mocked; it must never use real accounts or payments. `debugCvPdf=1` explicitly logs outgoing CV HTML in the local console for diagnosis (contains personal data; remove it afterwards).
