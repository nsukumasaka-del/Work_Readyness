import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(resolve(process.env.BONLIST_RUNTIME_MODULES, 'playwright'));
const { build } = require('../artifacts/api-server/node_modules/esbuild');
const bundle = await build({
  stdin: { resolveDir: resolve('artifacts/careerbridge-sa'), loader: 'tsx', contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {YocoCheckoutHost} from './src/components/YocoCheckout';
    import {requestPayment} from './src/lib/yoco';
    window.openDaily=()=>requestPayment({itemType:'JOB_MATCH_UNLOCK',targetId:'job1'});
    function Fixture(){React.useEffect(()=>{window.checkoutReady=true;},[]);return <YocoCheckoutHost/>;}
    createRoot(document.getElementById('root')).render(<Fixture/>);
  ` }, bundle: true, write: false, format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"test"' },
  plugins: [{ name: 'mock-payment-transport', setup(b) {
    b.onResolve({filter:/auth-session$/},()=>({path:'transport',namespace:'mock'}));
    b.onLoad({filter:/.*/,namespace:'mock'},()=>({loader:'js',contents:`
      export const isExplicitlySignedOut=()=>false;
      export async function authFetch(url,init){window.checkoutRequests.push(JSON.parse(init.body));return Response.json(window.checkoutResponse);}
    `}));
  }}],
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
  await page.route('https://bonlist.example/**',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
  await page.goto('https://bonlist.example/jobs');
  await page.evaluate(()=>{window.checkoutRequests=[];window.checkoutResponse={itemType:'MEGA_ACCESS',amount:8000,orderId:'wrong',redirectUrl:'https://c.yoco.com/wrong'};});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  // Let the actual checkout host's event subscription mount before opening it.
  await page.waitForFunction(()=>window.checkoutReady===true);
  await page.evaluate(()=>window.openDaily());
  await page.getByRole('button',{name:'Pay R30 with Yoco',exact:true}).click();
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').textContent(),/does not match/);
  assert.equal(page.url(),'https://bonlist.example/jobs','R80 response must not open Yoco from the R30 button');
  const daily = await page.evaluate(()=>window.checkoutRequests[0]);
  assert.equal(daily.itemType,'JOB_MATCH_UNLOCK');
  assert.equal(daily.amount,3000);
  assert.equal(daily.expectedAmount,3000);
  assert.equal(daily.currency,'ZAR');
  await page.getByRole('button',{name:'Choose 1 Week Mega Access · R80',exact:true}).click();
  await page.getByRole('button',{name:'Pay R80 with Yoco',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.checkoutRequests.length),1,'promotion selection must not immediately create a checkout');
  await page.evaluate(()=>{window.checkoutResponse={itemType:'JOB_MATCH_UNLOCK',amount:3000,orderId:'wrong2',redirectUrl:'https://c.yoco.com/wrong2'};});
  await page.getByRole('button',{name:'Pay R80 with Yoco',exact:true}).click();
  await page.getByRole('alert').waitFor();
  const mega = await page.evaluate(()=>window.checkoutRequests[1]);
  assert.equal(mega.itemType,'MEGA_ACCESS');
  assert.equal(mega.amount,8000);
  assert.equal(mega.expectedAmount,8000);
  assert.equal(page.url(),'https://bonlist.example/jobs');
  console.log('PASS: R30 payload, mismatched quote blocking, explicit R80 selection and separate confirmation. No live checkout created.');
} finally { await browser.close(); }
