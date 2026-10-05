import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.BONLIST_RUNTIME_MODULES + '/playwright');
const { build } = require('../artifacts/api-server/node_modules/esbuild');
const bundle = await build({entryPoints:['artifacts/careerbridge-sa/src/utils/export-cv-visual-pdf.ts'],bundle:true,write:false,format:'iife',globalName:'CvPdfSnapshot',plugins:[{name:'test-auth',setup(b){
 b.onResolve({filter:/^@\/lib\/auth-session$/},()=>({path:'auth',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const authFetch=()=>{}',loader:'js'}));
 if(process.env.PDF_TEST_OLD)b.onLoad({filter:/export-cv-visual-pdf\.ts$/},()=>({contents:spawnSync('git',['show','HEAD:artifacts/careerbridge-sa/src/utils/export-cv-visual-pdf.ts'],{encoding:'utf8'}).stdout,loader:'ts'}));
}}]});
const browser=await chromium.launch();
try{
 const source=await browser.newPage();
 const titles=['N2 Certificate - Mechanical Engineering','N3 Certificate - Mechanical Engineering','Matric Certificate - Science'];
 const skills=['Freight and Import Coordination','Carrier Negotiation and Rate Management','Shipment Tracking and Exception Handling','Customer Account Management','Microsoft Excel and CRM / TMS Systems','Problem Solving and Conflict Resolution','Compliance and Accuracy','Time Management and Multitasking Under Pressure','Microsoft Outlook','NAVIS','Navis Vet','TPT Portal','Spotlight Tracking','Radixx Go'];
 await source.setContent(`<style>body{margin:0;font:14px/20px Arial}#cv{width:794px;min-height:1123px;padding:48px;box-sizing:border-box}.cols{display:grid;grid-template-columns:2fr 1fr;gap:32px}.side{display:flex;flex-direction:column;gap:12px}input,textarea{font:14px/20px Arial;box-sizing:border-box;width:100%;border:0;padding:0;background:transparent}textarea{resize:none;overflow:hidden}h3{margin:0;font-size:14px}.tag{border:1px solid green;padding:4px 8px;border-radius:12px}#refs{margin-top:12px}</style><article id="cv"><h1>Preview Parity Candidate</h1><div class="cols"><main><h3>WORK EXPERIENCE</h3><p>Freight Controller</p><p>Customer Services Agent</p></main><aside class="side"><section data-a4-id="education"><h3>EDUCATION</h3>${titles.map(t=>`<input value="${t}"><input value="Central Johannesburg College, Ellis Park">`).join('')}</section><section data-a4-id="skills"><h3>SKILLS</h3>${skills.map(t=>`<div class="tag"><input value="${t}"></div>`).join('')}</section><section data-a4-id="languages"><h3>LANGUAGES</h3><input value="English - Fluent speaking and reading"><input value="Zulu - Intermediate speaking"></section><div id="filler"></div><section id="refs" data-a4-id="references"><h3>REFERENCES</h3><textarea>First Referee - Team Leader\n082 555 0101</textarea><textarea>Second Referee - Team Leader\nreferee@example.com</textarea></section></aside></div></article>`);
 await source.evaluate(()=>{document.querySelectorAll('textarea').forEach(el=>el.style.height=el.scrollHeight+'px');const root=document.getElementById('cv').getBoundingClientRect(), refs=document.getElementById('refs').getBoundingClientRect();document.getElementById('filler').style.height=Math.max(0,1000-(refs.top-root.top))+'px';});
 await source.addScriptTag({content:bundle.outputFiles[0].text});
 const before=await source.evaluate(()=>({pages:CvPdfSnapshot.measureCvPages(document.getElementById('cv')).pageCount,fields:[...document.querySelectorAll('#cv input,#cv textarea')].map(el=>el.getBoundingClientRect().toJSON())}));
 assert.equal(before.pages,1,'Preview fixture must fit one page');
 const html=await source.evaluate(()=>CvPdfSnapshot.createCvPdfSnapshot('cv'));writeFileSync('tmp/pdfs/preview-parity.html',html);
 const print=await(await browser.newContext({javaScriptEnabled:false})).newPage();await print.emulateMedia({media:'print'});await print.setContent(html);
 assert.equal(await print.locator('.a4-page-frame').count(),1,'Export added a page to the one-page preview');
 const after=await print.locator('.a4-capture-source [data-export-overlay="true"]').evaluateAll(fields=>fields.map(el=>el.getBoundingClientRect().toJSON()));
 assert.equal(after.length,before.fields.length,'Snapshot changed native field layout');
 before.fields.forEach((box,i)=>{for(const key of ['x','y','width','height'])assert(Math.abs(box[key]-after[i][key])<1,'Field geometry changed: '+i+' '+key);});
 const worker=readFileSync('tmp/pdfs/worker-recovery/gateway.js','utf8');const start=worker.indexOf('await page.evaluate(async () =>',worker.indexOf('async function handleCvPdfExport'));const end=worker.indexOf('const pdf =',start);
 await new Function('page','return(async()=>{'+worker.slice(start,end)+'})()')(print);
 assert.equal(await print.locator('.a4-page-frame').count(),1,'Worker repaginated the locked preview');
 await print.pdf({path:'tmp/pdfs/preview-parity.pdf',format:'A4',printBackground:true,preferCSSPageSize:true,margin:{top:0,right:0,bottom:0,left:0}});
 const checked=spawnSync(process.env.PDF_TEST_PYTHON,['-c',"from pypdf import PdfReader; r=PdfReader('tmp/pdfs/preview-parity.pdf'); assert len(r.pages)==1; t=r.pages[0].extract_text(); assert all(v in t for v in ['REFERENCES','First Referee','Second Referee','082 555 0101','referee@example.com']); print('One-page preview -> one-page PDF; all References retained; field geometry unchanged')"],{encoding:'utf8'});assert.equal(checked.status,0,checked.stderr||checked.stdout);console.log(checked.stdout.trim());
}finally{await browser.close()}
