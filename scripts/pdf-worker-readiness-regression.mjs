import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
// Run pdf-builder-integration.mjs first to capture the real builder payload,
// then `wrangler deploy --dry-run --outdir tmp/pdfs/worker-recovery`.
// Unlike the snapshot tests, this executes the compiled Worker readiness
// callback with JavaScript disabled, exactly as production does.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.BONLIST_RUNTIME_MODULES + '/playwright');
const browser = await chromium.launch();
try {
  const page = await (await browser.newContext({ javaScriptEnabled: false })).newPage();
  page.on('console', message => console.log(message.text()));
  await page.emulateMedia({ media: 'print' });
  await page.setContent(readFileSync('tmp/pdfs/real-builder-request.html', 'utf8'), { waitUntil: 'networkidle' });
  const source = readFileSync('tmp/pdfs/worker-recovery/gateway.js', 'utf8');
  const start = source.indexOf('await page.evaluate(async () =>', source.indexOf('async function handleCvPdfExport'));
  const end = source.indexOf('const pdf =', start);
  if (start < 0 || end < 0) throw new Error('Compiled renderer not found');
  const readiness = source.slice(start, end)
    .replace('await Promise.all([...fonts]', "console.log('font load'); await Promise.all([...fonts]")
    .replace('await document.fonts.ready', "console.log('fonts ready'); await document.fonts.ready")
    .replace('await Promise.all(Array.from(document.images)', "console.log('images'); await Promise.all(Array.from(document.images)")
    .replace('await new Promise', "console.log('animation frames'); await new Promise");
  let timer;
  try {
    await Promise.race([
      new Function('page', 'return (async () => {' + readiness + '})()')(page),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Worker readiness timeout')), 10000); }),
    ]);
  } finally { clearTimeout(timer); }
  await page.pdf({ path: 'tmp/pdfs/worker-readiness.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  assert(readFileSync('tmp/pdfs/worker-readiness.pdf').subarray(0, 5).toString() === '%PDF-', 'Renderer did not produce a PDF');
  if (process.env.PDF_TEST_PYTHON) {
    const checked = spawnSync(process.env.PDF_TEST_PYTHON, ['-c', "from pypdf import PdfReader; r=PdfReader('tmp/pdfs/worker-readiness.pdf'); t=r.pages[0].extract_text(); assert all(s in t for s in ['REFERENCES','Jacky van Rooyan','Smangaliso Thwala','082 555 0101','referee@example.com']); print('Worker PDF retains References and all referee contact details on page 1')"], { encoding: 'utf8' });
    assert.equal(checked.status, 0, checked.stderr || checked.stdout);
    console.log(checked.stdout.trim());
  }
  console.log('Compiled Worker readiness and PDF rendering passed with scripting disabled');
} finally { await browser.close(); }
