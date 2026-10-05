import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(resolve(process.env.BONLIST_RUNTIME_MODULES,'playwright'));
const {build}=require('../artifacts/api-server/node_modules/esbuild');
const cv={id:1,structure:'single_column',title:'Badge regression',document:{fullName:'Regression Candidate',headline:'Freight Controller',email:'candidate@example.com',summary:'Experienced freight controller.',experiences:[],education:[],skills:['Freight & Import Coordination','Carrier Negotiation & Rate Management','Microsoft Excel & CRM / TMS Systems','Time Management & Multitasking Under Pressure','NAVIS'],languages:['English — Fluent (speaking)','itsonga — Native','Tshivenda — Intermediate (speaking)'],references:[],sections:[],skillGroups:[],keywords:[],footerNote:''}};
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1600,height:1400}});
 await page.addInitScript(cv=>{sessionStorage.setItem('bonlist-generated-cv',JSON.stringify(cv));localStorage.setItem('careerbridge-profile',JSON.stringify({id:1,email:'test@example.com',name:'Test'}));localStorage.setItem('careerbridge-session-token','test');},cv);
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;if(!path.startsWith('/api/'))return route.continue();return route.fulfill({contentType:'application/json',body:JSON.stringify(path.endsWith('/auth/me')?{id:1,email:'test@example.com',name:'Test'}:{...cv,success:true})});});
 await page.goto('http://127.0.0.1:5177/cv-builder?offline=1',{waitUntil:'domcontentloaded',timeout:120000});
 await page.locator('#bonlist-cv-document .cv-skill-chip').first().waitFor({timeout:180000});
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1500);
 const bundle=await build({entryPoints:['artifacts/careerbridge-sa/src/utils/export-cv-visual-pdf.ts'],bundle:true,write:false,format:'iife',globalName:'PdfSnapshot',plugins:[{name:'auth-stub',setup(b){b.onResolve({filter:/^@\/lib\/auth-session$/},()=>({path:'auth',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const authFetch=()=>{}',loader:'js'}));}}]});
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const measure=()=>[...document.querySelectorAll('.cv-skill-chip')].map(el=>{const r=el.getBoundingClientRect(),root=el.closest('.cv-page-sheet,.a4-capture-source'),scale=root.getBoundingClientRect().width/parseFloat(getComputedStyle(root).width),range=document.createRange();range.selectNodeContents(el);return {text:el.textContent,width:r.width/scale,height:r.height/scale,lines:[...range.getClientRects()].map(r=>({width:r.width/scale,height:r.height/scale})),css:{width:getComputedStyle(el).width,padding:getComputedStyle(el).padding,boxSizing:getComputedStyle(el).boxSizing}};});
 const html=await page.evaluate(()=>PdfSnapshot.createCvPdfSnapshot('bonlist-cv-document'));
 const live=await page.evaluate(measure);
 const render=await browser.newPage();await render.emulateMedia({media:'print'});await render.setContent(html);await render.evaluate(()=>document.fonts.ready);
 const printed=await render.evaluate(measure);
 console.log(JSON.stringify({live,printed},null,2));
 mkdirSync('tmp/pdfs',{recursive:true});writeFileSync('tmp/pdfs/badge-parity.html',html);
 await render.pdf({path:'tmp/pdfs/badge-parity.pdf',format:'A4',printBackground:true,preferCSSPageSize:true});
 await render.screenshot({path:'tmp/pdfs/badge-parity.png',fullPage:true});
 for(let i=0;i<live.length;i++){assert.equal(printed[i].lines.length,live[i].lines.length,'Badge wraps differently: '+live[i].text);assert(Math.abs(printed[i].height-live[i].height)<1,'Badge height differs: '+live[i].text);assert(Math.abs(printed[i].width-live[i].width)<1,'Badge width differs: '+live[i].text);}
 console.log('PASS: Skills and languages preserve preview text lines and badge dimensions');
}finally{await browser.close();}
