import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(resolve(process.env.BONLIST_RUNTIME_MODULES, 'playwright'));
const { build } = require('../artifacts/api-server/node_modules/esbuild');
// Bundle the real payment return page, access provider and shared job cards.
// Only transport is mocked: no Yoco charge or production database mutation.
const bundle = await build({
  stdin: { resolveDir: resolve('artifacts/careerbridge-sa'), loader: 'tsx', contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {useLocation} from 'wouter';
    import {PaidAccessProvider,usePaidAccess,isJobUnlocked} from './src/lib/yoco';
    import {PaymentResultPage} from './src/components/YocoCheckout';
    import {JobListingCard} from './src/components/jobs/JobListingCard';
    function App(){const [path]=useLocation();const access=usePaidAccess();return path.startsWith('/payment/')?<PaymentResultPage/>:<>{[49,50,90].map(score=><JobListingCard key={score} job={{id:String(score),title:'Role '+score,company:'Employer '+score,location:'Gauteng',sourceBoard:'Test',shortSnippet:'Description',skills:[],matchScore:score}} locked={!isJobUnlocked({id:String(score),match:score},access)} onViewDetails={()=>{}}/>)}</>}
    createRoot(document.getElementById('root')).render(<PaidAccessProvider><App/></PaidAccessProvider>);
  ` }, bundle: true, write: false, format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"test"' },
  plugins: [{ name: 'mock-transport', setup(b) {
    b.onResolve({filter:/auth-session$/},()=>({path:'transport',namespace:'mock'}));
    b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents: `export const isExplicitlySignedOut=()=>false;export async function authFetch(url){window.__calls.push(url);return Response.json(url.includes('/verify')?{status:window.__paid?'paid':'pending',itemType:'JOB_MATCH_UNLOCK',success:window.__paid,hasActiveAccess:window.__paid,...window.__access}:window.__access)}`,loader:'js'}));
  }}],
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.route('https://bonlist.example/**',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
  await page.goto('https://bonlist.example/jobs');
  const empty={adminBypass:false,megaAccessActive:false,megaAccessUntil:null,jobAccessActive:false,jobAccessUntil:null,ownedTemplateIds:[],unlockedJobIds:[]};
  await page.evaluate(access=>{window.__access=access;window.__calls=[];},empty);
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.getByText('Employer 49',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Unlock All Matches for R30',exact:true}).count(),2);
  const expiry=new Date(Date.now()+86400000).toISOString();
  await page.evaluate(({access,expiry})=>{window.__access={...access,jobAccessActive:true,jobAccessUntil:expiry};window.dispatchEvent(new Event('bonlist-monetization-updated'));},{access:empty,expiry});
  await page.getByText('Employer 90',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Unlock All Matches for R30',exact:true}).count(),0,'same mounted cards unlock without reload');
  await page.evaluate(()=>{window.__access.jobAccessUntil=new Date(0).toISOString();window.dispatchEvent(new Event('bonlist-monetization-updated'));});
  await page.getByRole('button',{name:'Unlock All Matches for R30',exact:true}).first().waitFor();
  await page.goto('https://bonlist.example/payment/success?order_id=daily');
  await page.evaluate(({access,expiry})=>{window.__access={...access,jobAccessActive:true,jobAccessUntil:expiry};window.__paid=true;window.__calls=[];localStorage.setItem('bonlist-yoco-pending',JSON.stringify({orderId:'daily',itemType:'JOB_MATCH_UNLOCK',returnTo:'/pricing'}));},{access:empty,expiry});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.getByText('Access Unlocked — Valid for 24 Hours',{exact:true}).waitFor();
  await page.waitForURL('https://bonlist.example/job-matches');
  await page.getByText('Employer 90',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Unlock All Matches for R30',exact:true}).count(),0);
  console.log('PASS: threshold, instant reactive unlock, expiry relock and automatic verified-payment return.');
} finally { await browser.close(); }
