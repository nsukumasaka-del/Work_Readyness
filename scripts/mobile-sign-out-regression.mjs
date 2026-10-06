import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(resolve(process.env.BONLIST_RUNTIME_MODULES, 'playwright'));
const { build } = require('../artifacts/api-server/node_modules/esbuild');
const bundle = await build({ stdin: { resolveDir: resolve('artifacts/careerbridge-sa'), loader: 'ts', contents: `
  import * as auth from './src/lib/auth-session';
  import {beginSignOut,installSignedOutNavigation} from './src/lib/sign-out';
  window.testAuth={...auth,beginSignOut,installSignedOutNavigation};
` }, bundle: true, write: false, format: 'iife', plugins: [{ name: 'native-test', setup(b) {
  b.onResolve({filter:/^@capacitor\/core$/},()=>({path:'core',namespace:'mock'}));
  b.onResolve({filter:/^@capacitor\/preferences$/},()=>({path:'preferences',namespace:'mock'}));
  b.onResolve({filter:/^@capacitor\/app$/},()=>({path:'app',namespace:'mock'}));
  b.onResolve({filter:/api-base$/},()=>({path:'api',namespace:'mock'}));
  b.onLoad({filter:/.*/,namespace:'mock'},args=>({loader:'js',contents: args.path==='core' ? `export const Capacitor={isNativePlatform:()=>true};export const CapacitorCookies={deleteCookie:async args=>{window.cookieDeletes.push(args);}};` : args.path==='preferences' ? `export const Preferences={remove:async args=>{window.preferenceDeletes.push(args.key);}};` : args.path==='app' ? `export const App={addListener:async(name,callback)=>{window.nativeBack=callback;return {remove:async()=>{window.nativeBack=null;}};},exitApp:async()=>{window.exited=true;}};` : `export const apiUrl=path=>path;`}));
}}] });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.route('https://bonlist.example/**',route=>route.fulfill({contentType:'text/html',body:'<main>Logout regression</main>'}));
  await page.goto('https://bonlist.example/dashboard');
  await page.evaluate(()=>{
    window.cookieDeletes=[];window.preferenceDeletes=[];window.requests=[];
    for(const store of [localStorage,sessionStorage]){
      store.setItem('careerbridge-profile',JSON.stringify({id:'user1',email:'test@example.com'}));
      store.setItem('careerbridge-session-token','saved-token');store.setItem('careerbridge-admin-token','admin-token');store.setItem('careerbridge-is-admin','1');
      store.setItem('careerbridge-report','private-report');store.setItem('bonlist-yoco-pending','private-order');
    }
    localStorage.setItem('theme','light');
    window.fetch=(url,init)=>{
      window.requests.push({url,authorization:init.headers.Authorization,credentials:init.credentials});
      return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
    };
  });
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const result = await page.evaluate(async()=>{
    const auth=window.testAuth;
    const inFlight=auth.authFetch('/api/auth/me').catch(e=>e.name);
    let events=0;window.addEventListener('careerbridge-profile-updated',()=>events++);
    const started=Date.now();const completion=auth.beginSignOut();
    const immediate={profile:auth.readProfile(),token:auth.getSessionToken(),admin:auth.isAdminUser(),events};
    auth.persistSessionToken('stale-hydration');auth.persistProfile({id:'user1',email:'test@example.com'});
    await completion;
    const removed=[localStorage,sessionStorage].every(s=>['careerbridge-profile','careerbridge-session-token','careerbridge-admin-token','careerbridge-is-admin','careerbridge-report','bonlist-yoco-pending'].every(key=>s.getItem(key)===null));
    return {immediate,removed,elapsed:Date.now()-started,aborted:await inFlight,cookieDeletes:window.cookieDeletes,preferenceDeletes:window.preferenceDeletes,requests:window.requests,theme:localStorage.getItem('theme')};
  });
  assert.deepEqual(result.immediate,{profile:null,token:null,admin:false,events:1});
  assert.ok(result.removed);assert.ok(result.elapsed<4500);assert.equal(result.aborted,'AbortError');assert.equal(result.theme,'light');
  assert.equal(result.requests.find(r=>r.url.endsWith('/logout')).authorization,'Bearer saved-token');
  assert.equal(result.cookieDeletes.length,6);
  assert.deepEqual(result.preferenceDeletes,['bonlist.native.offline-workstation.v1'],'saved offline CVs must not be erased');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  assert.equal(await page.evaluate(()=>window.testAuth.isExplicitlySignedOut()),true,'logout marker survives fresh module startup');
  await page.evaluate(()=>window.testAuth.completeAuthSession({id:'user2',email:'new@example.com',sessionToken:'new-token'}));
  assert.equal(await page.evaluate(()=>window.testAuth.getSessionToken()),'new-token','fresh login is allowed');
  await page.evaluate(()=>window.testAuth.clearAuthSession());
  await page.goto('https://bonlist.example/login?signedOut=1');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(async()=>{window.testAuth.installSignedOutNavigation();await Promise.resolve();window.nativeBack({canGoBack:true});});
  assert.ok(await page.evaluate(()=>window.exited),'native back exits rather than reopening protected history');
  await page.evaluate(()=>{history.replaceState({},'', '/dashboard');window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
  await page.waitForURL('https://bonlist.example/login?signedOut=1');
  console.log('PASS: immediate reset, storage cleanup, stale hydration rejection, bounded offline logout, fresh login, native Back and restored-page protection.');
} finally {await browser.close();}
