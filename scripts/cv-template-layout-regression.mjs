import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(resolve(process.env.BONLIST_RUNTIME_MODULES, 'playwright'));
const source = readFileSync('artifacts/careerbridge-sa/src/pages/cv-builder.tsx', 'utf8');
const catalog = source.slice(source.indexOf('const TEMPLATE_CATALOG:'), source.indexOf('const TEMPLATE_CATALOG:') + 16000);
const templates = [...catalog.matchAll(/id: "([a-z_]+)",\s*category:/g)].map(m => m[1]);
const browser = await chromium.launch();
try {
 for (const template of templates.filter(id=>!process.env.CV_LAYOUT_TEMPLATES || process.env.CV_LAYOUT_TEMPLATES.split(',').includes(id))) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1400 } });
  const cv = { id: 1, structure: template, title: 'Layout regression', document: {
   structure: template, fullName: 'Regression Candidate', headline: 'Freight Controller', email: 'candidate@example.com', phone: '082 555 0100', location: 'Johannesburg',
   summary: 'Experienced freight controller handling customer enquiries and administration.',
   experiences: Array.from({length:4},(_,i)=>({ id:'work-'+i, role:'Customer Services Agent', company:'Menzies Aviation', startDate:'2023', endDate:'2025', bullets:Array.from({length:3},()=> 'Coordinated boarding and resolved customer enquiries to support on time departures and reliable daily operations.') })),
   education: [
    {id:'n2',degree:'N2 Certificate — Mechanical Engineering',institution:'Central Johannesburg College, Ellis Park',graduationYear:'2023'},
    {id:'n3',degree:'N3 Certificate — Mechanical Engineering',institution:'1 module (Drawing) outstanding',graduationYear:'In progress'},
    {id:'matric',degree:'Matric Certificate — Science',institution:'Waterval High School, Elim',graduationYear:'2018'}],
   skills:['Freight & Import Coordination','Carrier Negotiation & Rate Management','Time Management & Multitasking Under Pressure'], skillGroups:[], languages:['English — Fluent (speaking)','itsonga — Native'],
   references:['Jacky van Rooyan — Team Leader, DSV Road Brokerage • 082 320 1339','Smangaliso Thwala — Team Leader, Menzies Aviation • 083 738 6146'],keywords:[],sections:[],footerNote:'',authenticityScore:90
  }};
  await page.addInitScript(data => { sessionStorage.setItem('bonlist-generated-cv',JSON.stringify(data)); localStorage.setItem('careerbridge-profile',JSON.stringify({id:1,email:'test@example.com',name:'Test'}));localStorage.setItem('careerbridge-session-token','test'); }, cv);
  await page.route('**/api/**', route => {
   const path = new URL(route.request().url()).pathname;
   if (!path.startsWith('/api/')) return route.continue();
   return route.fulfill({contentType:'application/json',body:JSON.stringify(path.endsWith('/auth/me')?{id:1,email:'test@example.com',name:'Test'}:path.endsWith('/monetization')?{adminBypass:true}:{...cv,success:true})});
  });
  await page.goto((process.env.CV_LAYOUT_APP_URL || 'http://127.0.0.1:5177')+'/cv-builder?offline=1', {waitUntil:'domcontentloaded',timeout:120000});
  await page.locator('#bonlist-cv-document [data-a4-id="references"]').waitFor({timeout:180000});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(3000);
  if (process.env.CV_PALETTE_ONLY) {
   const expected = {serif_classic:'#18181b',corporate_blue:'#0284c7',editorial_gold:'#701a36',analyst_clean:'#18181b',double_column:'#1e3a8a',ivy_league:'#1e3a8a',elegant:'#701a36',contemporary:'#0f766e',modern:'#1e3a8a',timeline:'#0284c7',creative:'#0f766e',stylish:'#059669',single_column:'#18181b',compact:'#18181b',polished:'#1e3a8a',multicolumn:'#1e3a8a',classic:'#18181b',high_performer:'#059669',minimal:'#18181b'};
   const palette = await page.locator('#bonlist-cv-document').evaluate(root=>{
    document.documentElement.classList.add('dark');
    document.documentElement.style.setProperty('--cv-primary','#ff00ff');
    return {template:root.dataset.cvTemplate,primary:getComputedStyle(root).getPropertyValue('--cv-primary').trim(),rootPrimary:document.documentElement.style.getPropertyValue('--cv-primary')};
   });
   assert.equal(palette.template,template); assert.equal(palette.primary,expected[template]);assert.equal(palette.rootPrimary,'#ff00ff');
   if(template==='serif_classic') {
    for(const [name,id] of [['Creative','creative'],['Minimal','minimal'],['Modern','modern'],['Serif Classic','serif_classic']]) {
     await page.getByRole('button',{name:'Choose a template',exact:true}).first().click();
     const card=page.locator('article').filter({has:page.getByRole('heading',{name,exact:true})});
     await card.getByRole('button',{name:/^(Use Template|Preview|Selected)$/}).click();
     await page.waitForTimeout(300);
     assert.equal(await page.locator('#bonlist-cv-document').getAttribute('data-cv-template'),id);
     assert.equal(await page.locator('#bonlist-cv-document').evaluate(root=>getComputedStyle(root).getPropertyValue('--cv-primary').trim()),expected[id]);
    }
   }
   console.log('PALETTE PASS',template);await page.close();continue;
  }
  if (template === 'corporate_blue') {
   await page.evaluate(() => {
    const root=document.getElementById('bonlist-cv-document');
    const fields=[...root.querySelectorAll("input:not([type='hidden']), textarea, [data-inline-editable='true']")];
    const index=fields.indexOf(root.querySelector('.cv-skill-chip'));
    const cv=JSON.parse(sessionStorage.getItem('bonlist-generated-cv'));
    cv.preferences={...cv.preferences,elementPositions:{[`preview-field-${index}`]:{x:8,y:-22}}};
    sessionStorage.setItem('bonlist-generated-cv',JSON.stringify(cv));
   });
   await page.reload();
   await page.locator('#bonlist-cv-document .cv-skill-chip').first().waitFor();
   await page.evaluate(() => document.fonts.ready);
   await page.waitForTimeout(3000);
  }
  const badgesClearDivider=await page.locator('#bonlist-cv-document .cv-badge-list').evaluateAll(lists=>lists.every(list=>{
   const heading=list.previousElementSibling?.getBoundingClientRect();
   return !heading || [...list.querySelectorAll('.cv-skill-chip')].every(chip=>chip.getBoundingClientRect().top>=heading.bottom+3);
  }));
  assert(badgesClearDivider,template+': badge overlaps heading divider');
  const layout = await page.locator('#bonlist-cv-document').evaluate(root => {
   const bounds = el => {const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};
   const r=root.getBoundingClientRect(),scale=r.width/root.offsetWidth,pageHeight=root.offsetWidth*297/210;
   return {pageHeight,blocks:[...root.querySelectorAll('section[data-a4-id]')].map(el=>({id:el.dataset.a4Id,top:(el.getBoundingClientRect().top-r.top)/scale,height:el.getBoundingClientRect().height/scale})),education:bounds(root.querySelector('[data-a4-id="education"]')),skills:bounds(root.querySelector('[data-a4-id="skills"]')),items:[...root.querySelectorAll('.education-item')].map(el=>({box:bounds(el),fields:[...el.querySelectorAll('input,textarea')].map(f=>({value:f.value,...bounds(f)}))}))};
  });
  console.log('CHECK', template);
  assert(layout.skills.top >= layout.education.bottom - 2, template+': Skills overlaps Education');
  if (!process.env.CV_DIVIDER_ONLY) for(const block of layout.blocks) if(block.height>0 && block.height<layout.pageHeight-140) assert(Math.floor((block.top+1)/layout.pageHeight)===Math.floor((block.top+block.height-1)/layout.pageHeight),template+': '+block.id+' crosses a page boundary');
  for (const item of layout.items) {
   for (const field of item.fields) assert(field.bottom <= item.box.bottom + 1, template+': education field escapes its row');
   assert(item.fields[1].top >= item.fields[0].bottom - 1, template+': institution overlaps qualification');
  }
  await page.close();
 }
 console.log(`PASS: ${process.env.CV_LAYOUT_TEMPLATES ? process.env.CV_LAYOUT_TEMPLATES.split(',').length : templates.length} real CV templates checked${process.env.CV_DIVIDER_ONLY ? ' (divider alignment)' : ''}`);
} finally { await browser.close(); }
