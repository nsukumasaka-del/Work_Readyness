import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(resolve(process.env.BONLIST_RUNTIME_MODULES, 'playwright'));
const output = resolve('tmp/pdfs'); mkdirSync(output, { recursive: true });
const cv = { id: 1, version: 1, structure: 'multicolumn', title: 'Integration CV', document: {
  fullName: 'PDF Regression Candidate', headline: 'Freight Controller', email: 'candidate@example.com', phone: '082 555 0100', location: 'Johannesburg',
  summary: 'Experienced freight controller handling imports, customer enquiries and administration.',
  experiences: Array.from({ length: process.env.PDF_TEST_LONG_CV ? 8 : 3 }, (_, i) => ({ id: 'experience-' + i, role: 'Freight Controller', company: 'Example Logistics ' + i, location: 'Johannesburg', startDate: '2020', endDate: '2024', bullets: ['Managed carrier rates and shipment tracking.', 'Resolved customer enquiries and delivery exceptions.', 'Prepared import documentation and operational reports.'] })),
  education: [{ id: 'education-1', degree: 'Technical Certificate', institution: 'Example College', graduationYear: '2019' }], skills: ['Customer Service', 'Freight Operations', 'Excel'], skillGroups: [], languages: ['English', 'isiZulu'],
  references: ['Jacky van Rooyan - Team Leader, DSV Road Freight; Phone: 082 555 0101', 'Smangaliso Thwala - Team Leader, Menzies Aviation; Email: referee@example.com'], keywords: [], sections: [], footerNote: '', authenticityScore: 90
} };
const denseSidebar = !!process.env.PDF_TEST_DENSE_SIDEBAR;
if (denseSidebar) {
 cv.document.education = [
  {id:'edu-n2',degree:'N2 Certificate - Mechanical Engineering',institution:'Central Johannesburg College, Ellis Park',graduationYear:'2023'},
  {id:'edu-n3',degree:'N3 Certificate - Mechanical Engineering',institution:'N3 Module (Drawing) outstanding',graduationYear:'In progress'},
  {id:'edu-matric',degree:'Matric Certificate - Science',institution:'Secondary School',graduationYear:'2018'},
 ];
 cv.document.skills = ['Freight and Import Coordination','Carrier Negotiation and Rate Management','Shipment Tracking and Exception Handling','Customer Account Management','Microsoft Excel and CRM / TMS Systems','Problem Solving and Conflict Resolution','Compliance and Accuracy','Time Management and Multitasking Under Pressure','Microsoft Outlook','NAVIS','Navis Vet','TPT Portal','Spotlight Tracking','Radixx Go'];
 cv.document.languages = ['English - Fluent (speaking)','reading','writing','itsonga - Native','Zulu - Intermediate (speaking)','Tshivenda - Intermediate (speaking)','English','Zulu','Tshivenda'];
}
const browser = await chromium.launch({ headless: true, ...(process.env.PDF_TEST_BROWSER ? { executablePath: process.env.PDF_TEST_BROWSER } : {}) });
try {
 const page = await browser.newPage({ viewport: { width: 1600, height: 1400 } });
 page.setDefaultTimeout(120000);
 const render = await browser.newPage({ viewport: { width: 794, height: 1123 } });
 page.on('pageerror', error => console.error('APP ERROR', error.message));
 page.on('console', message => { if (message.type() === 'error') console.error('BROWSER ERROR', message.text().slice(0, 500)); });
 page.on('requestfailed', request => console.error('REQUEST FAILED', new URL(request.url()).pathname, request.failure()?.errorText));
 await page.addInitScript(data => {
  sessionStorage.setItem('bonlist-generated-cv', JSON.stringify(data));
  localStorage.setItem('careerbridge-profile', JSON.stringify({ id: 1, email: 'test@example.com', name: 'Test Candidate' }));
  localStorage.setItem('careerbridge-session-token', 'local-test-only');
 }, cv);
 let payload, renderedPdf, liveBounds;
 await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (!path.startsWith('/api/')) return route.continue();
  if (path.endsWith('/export-pdf')) {
   payload = route.request().postDataJSON(); writeFileSync(resolve(output, 'real-builder-request.html'), payload.html);
   assert.match(payload.html, /References/i); assert(payload.html.includes('082 555 0101') && payload.html.includes('referee@example.com'));
   await render.emulateMedia({ media: 'print' }); await render.setContent(payload.html); await render.evaluate(() => document.fonts.ready);
   const exportedBounds = await render.locator('.a4-capture-source [data-a4-id="references"]').first().boundingBox();
   console.log('REFERENCE COORDINATES', { liveBounds, exportedBounds });
   assert(Math.abs(exportedBounds.x - liveBounds.x) < 2 && (denseSidebar ? exportedBounds.y >= liveBounds.y - 2 : Math.abs(exportedBounds.y - liveBounds.y) < 2), 'Worker print layout moved References relative to live canvas: ' + JSON.stringify({ liveBounds, exportedBounds }));
   const education = await render.locator('.a4-capture-source [data-a4-id="education"]').first().boundingBox();
   const skills = await render.locator('.a4-capture-source [data-a4-id="skills"]').first().boundingBox();
   assert(skills.y >= education.y + education.height - 1, 'Skills overlaps Education in actual builder PDF');
   renderedPdf = await render.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
   writeFileSync(resolve(output, 'real-builder.pdf'), renderedPdf); await render.close();
   return route.fulfill({ contentType: 'application/pdf', body: renderedPdf });
  }
  const saved = /\/cv\/documents(?:\/\d+)?$/.test(path) && route.request().method() !== 'GET' ? route.request().postDataJSON() : {};
  const data = path.endsWith('/auth/me') ? { id: 1, email: 'test@example.com', name: 'Test Candidate' } : path.endsWith('/monetization') ? { adminBypass: true } : path.endsWith('/pre-flight-audit') ? { overallGrade: 'Ready for Recruiter Submission', summary: { contentVerified: true, employmentHistoryChecked: true, formattingChecked: true, atsReadabilityChecked: true, aiClaimsVerified: true, professionalLanguageChecked: true }, checks: [], prioritizedActions: [] } : { ...cv, ...saved, success: true };
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
 });
 await page.goto((process.env.PDF_TEST_APP_URL || 'http://127.0.0.1:5175') + '/cv-builder?offline=1', { waitUntil: 'domcontentloaded', timeout: 120000 });
 console.log('APP LOADED', (await page.locator('body').innerText()).slice(0, 1600));
 try { await page.locator('#bonlist-cv-document [data-a4-id="references"]').waitFor({ timeout: 180000 }); }
 catch (error) { console.error('BUILDER STARTUP', (await page.locator('body').innerText()).slice(0, 3000)); throw error; }
 await page.evaluate(() => document.fonts.ready);
 // Use the real section drag handle, not a manually authored DOM transform.
 await page.locator('button').filter({ hasText: /^Edit Mode$/ }).click();
 const grip = page.getByRole('button', { name: denseSidebar ? 'Move skills section freely' : 'Move references section freely', exact: true });
 await grip.scrollIntoViewIfNeeded();
 const position = await page.locator('#bonlist-cv-document [data-a4-id="references"]').evaluate(el => {
  const root = document.getElementById('bonlist-cv-document'); const r = root.getBoundingClientRect(), e = el.getBoundingClientRect();
  const scale = r.width / root.offsetWidth;
  return { delta: (297 * 96 / 25.4 - 45) * scale - (e.bottom - r.top) };
 });
 const handle = await grip.boundingBox();
 await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
 await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + (denseSidebar ? 10 : position.delta), { steps: 12 }); await page.mouse.up();
 await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
 await page.screenshot({ path: resolve(output, 'real-builder-before.png'), fullPage: true });
 console.log('LIVE REFERENCES', await page.locator('[data-a4-id="references"]').first().evaluate(el => ({ text: el.innerText, rect: el.getBoundingClientRect().toJSON() })));
 await page.getByRole('button', { name: 'Download Resume', exact: true }).click();
 await page.getByRole('button', { name: /^PDF Print-ready/ }).click();
 await page.screenshot({ path: resolve(output, 'real-builder-dialog.png'), fullPage: true });
 console.log('DIALOG BUTTONS', await page.getByRole('dialog').getByRole('button').allTextContents());
 const confirm = page.getByRole('button', { name: 'Download Final CV', exact: true });
 // Capture settled geometry before the download UI may replace the preview.
 // Reading the live canvas in the API interceptor races that UI transition.
 liveBounds = await page.locator('#bonlist-cv-document [data-a4-id="references"]').evaluate(el => {
  const root = document.getElementById('bonlist-cv-document'), r = root.getBoundingClientRect(), e = el.getBoundingClientRect();
  const scale = r.width / parseFloat(getComputedStyle(root).width);
  return { x: (e.left - r.left) / scale, y: (e.top - r.top) / scale };
 });
 const exported = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/export-pdf'), { timeout: 300000 });
 await confirm.click();
 await exported;
 assert(payload && renderedPdf, 'No PDF export request');
 if (process.env.PDF_TEST_PYTHON) {
  const result = spawnSync(process.env.PDF_TEST_PYTHON, ['-c', "import sys; from pypdf import PdfReader; pages=[p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]; text=' '.join((' '.join(pages) if sys.argv[3]=='dense' else pages[0]).split()); assert 'REFERENCES' in text.upper(); assert 'Jacky van Rooyan' in text; assert 'Smangaliso Thwala' in text; assert '082 555 0101' in text; assert 'referee@example.com' in text; alltext=' '.join(' '.join(pages).split()); assert alltext.count('Managed carrier rates and shipment tracking.')==int(sys.argv[2]); assert alltext.count('Prepared import documentation and operational reports.')==int(sys.argv[2]); assert len(pages)>1 if int(sys.argv[2])>3 else len(pages)>=1; print('Real builder References and all work entries retained;',len(pages),'pages total')", resolve(output, 'real-builder.pdf'), String(cv.document.experiences.length), denseSidebar ? 'dense' : 'default'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); console.log(result.stdout.trim());
 }
 const raster = spawnSync(process.env.PDF_TEST_PDFTOPPM, ['-scale-to', '1000', '-png', resolve(output, 'real-builder.pdf'), resolve(output, 'rendered-real-builder')], { encoding: 'utf8' }); assert.equal(raster.status, 0, raster.stderr);
} finally { await browser.close(); }
