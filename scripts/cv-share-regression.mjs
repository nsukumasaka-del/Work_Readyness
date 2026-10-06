import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { build } = require('../artifacts/api-server/node_modules/esbuild');
const runtime = createRequire(path.join(process.env.BONLIST_RUNTIME_MODULES, 'package.json'));
const { chromium } = runtime('playwright');
const bundle = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Dashboard from './src/pages/CvDashboard'; createRoot(document.getElementById('root')).render(<Dashboard/>);`, resolveDir: path.resolve('artifacts/careerbridge-sa'), loader: 'tsx' },
  bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
  plugins: [{ name: 'transport', setup(build) {
    build.onResolve({ filter: /auth-session$/ }, args => args.importer.endsWith('CvDashboard.tsx') ? { path: 'transport', namespace: 'fixture' } : undefined);
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const authFetch = (url, options) => fetch(url, options);', loader: 'js' }));
  } }],
});
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let shares = 0;
  await page.route('http://localhost/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/share')) { shares++; return route.fulfill({ json: { url: 'https://www.bonlist.site/shared-cv/' + 'a'.repeat(64) } }); }
    if (url.pathname === '/api/career/cv/documents') return route.fulfill({ json: { documents: [{ id: 1, title: 'Recruiter CV', structure: 'classic', completionScore: 80, document: { fullName: 'Candidate', skills: [] } }] } });
    return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
  });
  await page.goto('http://localhost/');
  await page.evaluate(() => { window.confirm = () => true; Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByRole('dialog', { name: 'Share CV' }).waitFor();
  assert.equal(shares, 1);
  assert.equal(await page.getByRole('link', { name: 'WhatsApp', exact: true }).count(), 1);
  assert.match(await page.getByRole('link', { name: 'Email', exact: true }).getAttribute('href'), /^mailto:/);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedLink = text; } } }));
  await page.getByRole('button', { name: 'Copy Share Link' }).click();
  await page.getByRole('button', { name: 'Link copied to clipboard!' }).waitFor();
  assert.match(await page.evaluate(() => window.copiedLink), /\/shared-cv\/[a-f0-9]{64}$/);
  await page.getByRole('button', { name: 'Close sharing' }).click();
  await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async payload => { window.nativeShare = payload; } }));
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.waitForFunction(() => window.nativeShare);
  assert.equal(await page.evaluate(() => window.nativeShare.title), 'My CV - Recruiter CV');
  assert.equal(await page.getByRole('dialog').count(), 0);
  const previewBundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import SharedCv from './src/pages/SharedCv'; createRoot(document.getElementById('root')).render(<SharedCv/>);`, resolveDir: path.resolve('artifacts/careerbridge-sa'), loader: 'tsx' }, bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' } });
  const recipient = await browser.newPage();
  await recipient.route('http://localhost/**', route => new URL(route.request().url()).pathname.startsWith('/api/')
    ? route.fulfill({ json: { title: 'Recruiter CV', document: { fullName: 'Sample Candidate', summary: 'Career summary', references: ['Example Referee · 012 345 6789'] } } })
    : route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await recipient.goto('http://localhost/shared-cv/' + 'a'.repeat(64));
  await recipient.addScriptTag({ content: previewBundle.outputFiles[0].text });
  await recipient.getByRole('heading', { name: 'Sample Candidate' }).waitFor();
  await recipient.getByText('Example Referee · 012 345 6789', { exact: true }).waitFor();
  assert.equal(await recipient.locator('input, textarea, [contenteditable="true"]').count(), 0);
  console.log('CV sharing: desktop fallback, copy feedback, social links and native sharing passed.');
  console.log('Shared CV: signed-out recipient preview includes references and has no editing controls.');
} finally { await browser.close(); }
