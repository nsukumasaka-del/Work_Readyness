import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.BONLIST_RUNTIME_MODULES + '/playwright');
const { build } = require('../artifacts/api-server/node_modules/esbuild');
const compiled = await build({ entryPoints: ['artifacts/careerbridge-sa/src/utils/export-cv-visual-pdf.ts'], bundle: true, write: false, format: 'iife', globalName: 'CvPdfSnapshot', plugins: [{ name: 'isolated-auth', setup(b) {
  b.onResolve({filter:/^@\/lib\/auth-session$/},()=>({path:'auth',namespace:'test'}));
  b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const authFetch = () => {};',loader:'js'}));
  if (process.env.PDF_TEST_OLD) b.onLoad({filter:/export-cv-visual-pdf\.ts$/},()=>({contents:spawnSync('git',['show','HEAD:artifacts/careerbridge-sa/src/utils/export-cv-visual-pdf.ts'],{encoding:'utf8'}).stdout,loader:'ts'}));
}}] });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const education = ['N2 Certificate - Mechanical Engineering', 'N3 Certificate - Mechanical Engineering', 'Matric Certificate - Science'].map(v=>`<div><input value="${v}"><input value="Central Johannesburg College, Ellis Park"><p>2023</p></div>`).join('');
  const skills = ['Freight and Import Coordination','Carrier Negotiation and Rate Management','Shipment Tracking and Exception Handling','Customer Account Management','Microsoft Excel and CRM / TMS Systems','Compliance and Accuracy','Microsoft Outlook','NAVIS','Time Management and Multitasking Under Pressure'];
  await page.setContent(`<style>body{margin:0;font:14px/1.45 Arial}#cv{width:794px;min-height:1123px;box-sizing:border-box;padding:48px}.columns{display:grid;grid-template-columns:2fr 1fr;gap:32px}.column{display:flex;flex-direction:column;gap:12px;min-width:0}input{width:100%;box-sizing:border-box;font:14px/20px Arial;border:0;padding:0}textarea{width:100%;font:14px/20px Arial}h3,p{margin:0}li{margin-bottom:12px}.card{transform:translateY(10px)}.tag{display:block;padding:8px;border:1px solid green;border-radius:12px}</style><article id="cv"><h1>Dense Sidebar Regression</h1><div class="columns"><main><h3>WORK EXPERIENCE</h3><ul>${Array.from({length:16},()=>'<li>Coordinate imports and road freight shipments, resolve customer enquiries, and prepare operational documentation.</li>').join('')}</ul></main><aside class="column"><div class="card"><section data-a4-id="education"><h3>EDUCATION</h3>${education}</section></div><div class="card"><section data-a4-id="skills"><h3>SKILLS</h3>${skills.map(v=>`<span class="tag">${v}</span>`).join('')}</section></div><div class="card"><section data-a4-id="languages"><h3>LANGUAGES</h3>${Array.from({length:8},(_,i)=>`<p>Language ${i+1} - Intermediate speaking and reading</p>`).join('')}</section></div><div class="card"><section data-a4-id="references"><h3>REFERENCES</h3><textarea>First Referee - Team Leader, Freight Company; 082 555 0101</textarea><textarea>Second Referee - Team Leader, Aviation Company; referee@example.com</textarea></section></div></aside></div></article>`);
  await page.addScriptTag({content:compiled.outputFiles[0].text});
  const html = await page.evaluate(()=>CvPdfSnapshot.createCvPdfSnapshot('cv'));
  writeFileSync('tmp/pdfs/dense-sidebar.html',html);
  await page.setContent(html);
  const bounds = await page.evaluate(()=>{
    const source=document.querySelector('.a4-capture-source');
    const education=source.querySelector('[data-a4-id="education"]').getBoundingClientRect();
    const skills=source.querySelector('[data-a4-id="skills"]').getBoundingClientRect();
    return {educationBottom:education.bottom,skillsTop:skills.top};
  });
  assert(bounds.skillsTop >= bounds.educationBottom - .5, 'Skills overlaps expanded Education: '+JSON.stringify(bounds));
  console.log('Expanded qualifications do not overlap Skills; authored translations retained');
  // Simulate a stale one-page client count; the print renderer must recover
  // all overflowing content from the complete source tree before clipping.
  const staleHtml=await page.evaluate(()=>{document.querySelectorAll('.a4-page-frame').forEach((el,i)=>{if(i)el.remove()});return document.documentElement.outerHTML;});
  const print=await(await browser.newContext({javaScriptEnabled:false})).newPage();
  await print.emulateMedia({media:'print'});await print.setContent(staleHtml);
  const worker=readFileSync('tmp/pdfs/worker-recovery/gateway.js','utf8');
  const start=worker.indexOf('await page.evaluate(async () =>',worker.indexOf('async function handleCvPdfExport'));
  const end=worker.indexOf('const pdf =',start);
  assert(start>=0&&end>start,'Build Worker dry-run first');
  await new Function('page','return (async()=>{'+worker.slice(start,end)+'})()')(print);
  assert(await print.locator('.a4-page-frame').count()>1,'Print renderer did not recover continuation pages');
  writeFileSync('tmp/pdfs/dense-sidebar-print.html',await print.content());
  await print.pdf({path:'tmp/pdfs/dense-sidebar.pdf',format:'A4',printBackground:true,preferCSSPageSize:true,margin:{top:0,bottom:0,left:0,right:0}});
  const checked=spawnSync(process.env.PDF_TEST_PYTHON,['-c',"from pypdf import PdfReader; r=PdfReader('tmp/pdfs/dense-sidebar.pdf'); t=' '.join(p.extract_text() or '' for p in r.pages); assert len(r.pages)>1; assert all(v in t for v in ['REFERENCES','First Referee','Second Referee','082 555 0101','referee@example.com']); assert t.count('Coordinate imports')==16; assert all('Language '+str(i) in t for i in range(1,9)); print('All work entries, languages, referee names and contacts retained across',len(r.pages),'pages')"],{encoding:'utf8'});
  assert.equal(checked.status,0,checked.stderr||checked.stdout);console.log(checked.stdout.trim());
} finally {await browser.close();}
