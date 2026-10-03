import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
const runtime = process.env.BONLIST_RUNTIME_MODULES;
const { chromium } = runtime ? require(resolve(runtime, "playwright")) : require("playwright");
const { build } = require("../artifacts/api-server/node_modules/esbuild");
const output = resolve("tmp/pdfs");
mkdirSync(output, { recursive: true });
const compiled = await build({
  entryPoints: ["artifacts/careerbridge-sa/src/utils/export-cv-visual-pdf.ts"],
  bundle: true, write: false, format: "iife", globalName: "CvPdfSnapshot",
  plugins: [{ name: "no-network-auth", setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/auth-session$/ }, () => ({ path: "auth", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const authFetch = () => { throw new Error('No payment/API calls in rendering tests'); };", loader: "js" }));
  }}],
});
const browser = await chromium.launch({ headless: true, ...(process.env.PDF_TEST_BROWSER ? { executablePath: process.env.PDF_TEST_BROWSER } : {}) });
try {
  for (const columns of [1, 2]) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
    const entries = Array.from({ length: 42 }, (_, i) => '<li data-a4-id="bullet-' + i + '"><textarea data-test="bullet-' + i + '">Negotiated carrier rates and managed customer enquiries with accurate reporting.</textarea></li>').join("");
    await page.setContent('<style>body{margin:0;font-family:Arial}#cv{box-sizing:border-box;width:210mm;min-height:297mm;padding:40px;border:1px solid #ddd}h1{margin:0 0 8px}h2{font-size:14px;letter-spacing:.28em;margin:0 0 12px}.grid{display:grid;grid-template-columns:' + (columns === 2 ? 'minmax(0,35fr) minmax(0,65fr)' : '1fr') + ';gap:24px}.col{min-width:0}ul{padding-left:20px}li{padding-bottom:8px}textarea{box-sizing:border-box;width:100%;padding:0;border:0;resize:none;font:14px/1.45 Arial;overflow:hidden;display:block}input{font:14px/1.45 Arial;width:100%;border:0}.no-print{position:absolute} @media print {.grid{display:block!important}.col{width:90px!important}h2{word-break:break-all!important}}</style><article id="cv"><button class="no-print" data-preview-only="true">Edit controls</button><h1>Candidate Name</h1><input value="Customer Service | Administration Officer"><div class="grid" data-test="grid"><aside class="col"><h2 data-test="heading">EDUCATION</h2><p>Technical Certificate</p><h2>SKILLS</h2><p>Customer service and logistics</p></aside><section class="col"><h2>EXPERIENCE</h2><ul>' + entries + '</ul></section></div></article>');
    await page.evaluate(() => document.querySelectorAll("textarea").forEach(el => { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }));
    if (process.env.PDF_TEST_FONT) {
      await page.route("https://fixture.invalid/font.ttf", route => route.fulfill({ body: readFileSync(process.env.PDF_TEST_FONT), contentType: "font/ttf", headers: { "Access-Control-Allow-Origin": "*" } }));
      await page.route("https://fixture.invalid/fonts.css?weights=400;700", route => route.fulfill({ body: "@font-face{font-family:FixtureFont;src:url('https://fixture.invalid/font.ttf')}", contentType: "text/css", headers: { "Access-Control-Allow-Origin": "*" } }));
      await page.addStyleTag({ content: "@import url('https://fixture.invalid/fonts.css?weights=400;700'); h2{font-family:FixtureFont}" });
      await page.evaluate(() => document.fonts.load("14px FixtureFont"));
    }
    await page.addScriptTag({ content: compiled.outputFiles[0].text });
    await page.evaluate(() => {
      const root = document.getElementById("cv");
      const spacers = CvPdfSnapshot.computeCvPageSpacers(root);
      for (const [id, height] of Object.entries(spacers)) {
        const spacer = document.createElement("div");
        spacer.dataset.a4Spacer = id; spacer.style.cssText = "height:" + height + "px;min-height:" + height + "px;flex-shrink:0";
        root.querySelector('[data-a4-id="' + id + '"]').before(spacer);
      }
    });
    const before = await page.evaluate(() => ({
      width: getComputedStyle(document.getElementById("cv")).width,
      grid: getComputedStyle(document.querySelector(".grid")).gridTemplateColumns,
    }));
    const html = await page.evaluate(() => CvPdfSnapshot.createCvPdfSnapshot("cv"));
    writeFileSync(resolve(output, "columns-" + columns + ".html"), html);
    assert(!html.includes("Edit controls"));
    assert(!html.includes("@media print"));
    assert(!html.includes("<textarea"));
    if (process.env.PDF_TEST_FONT) {
      assert(html.includes("data:font/ttf;base64,"), "Font must be embedded");
      assert(!html.includes("https://fixture.invalid/font.ttf"), "Export must not depend on remote font fetching");
    }
    const exportPage = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    await exportPage.emulateMedia({ media: "print" });
    await exportPage.setContent(html);
    const metrics = await exportPage.evaluate(() => {
      const source = document.querySelector(".a4-capture-source");
      const heading = source.querySelector('[data-test="heading"]');
      const rect = heading.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(heading);
      const textRects = [...range.getClientRects()];
      const controls = [...source.querySelectorAll("[data-export-text-control]")];
      return { width: getComputedStyle(source).width, grid: getComputedStyle(source.querySelector('[data-test="grid"]')).gridTemplateColumns,
        headingLines: textRects.length, headingHeight: rect.height,
        overflow: controls.filter(el => el.scrollHeight > el.clientHeight + 1).length,
        frames: [...document.querySelectorAll(".a4-page-frame")].map(el => ({ height: el.getBoundingClientRect().height, overflow: getComputedStyle(el).overflow })),
        sources: [...document.querySelectorAll(".a4-capture-source")].map(el => ({ position: getComputedStyle(el).position, top: getComputedStyle(el).top })),
        pages: document.querySelectorAll(".a4-page-frame").length };
    });
    assert.equal(metrics.width, before.width, "A4 width drift");
    assert.equal(metrics.grid, before.grid, "Columns changed during print");
    assert.equal(metrics.headingLines, 1, "EDUCATION split mid-word");
    assert.equal(metrics.overflow, 0, "Text overflows fixed control height");
    assert(metrics.pages > 1, "Fixture should cover multiple pages");
    await exportPage.pdf({ path: resolve(output, "columns-" + columns + ".pdf"), format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
    if (process.env.PDF_TEST_PYTHON) {
      const result = spawnSync(process.env.PDF_TEST_PYTHON, ["-c", "import sys; from pypdf import PdfReader; r=PdfReader(sys.argv[1]); texts=[p.extract_text() or '' for p in r.pages]; count=''.join(texts).count('Negotiated carrier rates'); assert count==42,(count,[len(t) for t in texts]); assert len(r.pages)==int(sys.argv[2]); assert all(t.strip() for t in texts), 'Blank continuation page'; print('PDF text integrity: 42 bullets, no blank pages')", resolve(output, "columns-" + columns + ".pdf"), String(metrics.pages)], { encoding: "utf8" });
      if (result.status !== 0) throw new Error(result.stderr || result.stdout || "PDF text integrity failed");
      console.log(result.stdout.trim());
    }
    await exportPage.screenshot({ path: resolve(output, "columns-" + columns + ".png"), fullPage: true });
    console.log(JSON.stringify({ columns, ...metrics }));
    await page.close(); await exportPage.close();
  }
} finally { await browser.close(); }
