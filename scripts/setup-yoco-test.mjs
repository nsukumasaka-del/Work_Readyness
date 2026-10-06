// Secrets are supplied on stdin, retained only in memory, and sent directly to
// Yoco/Cloudflare. Never put credentials in source files or console output.
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url);
let input='';for await(const chunk of process.stdin) input+=chunk;
const credentials=JSON.parse(input);input='';
if(!/^sk_test_/.test(credentials.secret)||!/^pk_test_/.test(credentials.public)) throw new Error('Only Yoco test credentials are permitted.');
const endpoint='https://www.bonlist.site/api/payments/yoco/webhook';
const headers={Authorization:`Bearer ${credentials.secret}`,'Content-Type':'application/json'};
const list=await fetch('https://payments.yoco.com/api/webhooks',{headers,signal:AbortSignal.timeout(15000)});
if(!list.ok) throw new Error(`Yoco rejected the test credentials (HTTP ${list.status}). No configuration changed.`);
const current=await list.json();
const existing=current.subscriptions?.find(webhook=>webhook.url===endpoint && webhook.mode==='test');
if(existing) throw new Error('A test webhook already exists. Supply its signing secret to reuse it; no duplicate was created.');
const registration=await fetch('https://payments.yoco.com/api/webhooks',{method:'POST',headers,body:JSON.stringify({name:'BonList test payments',url:endpoint}),signal:AbortSignal.timeout(15000)});
if(!registration.ok) throw new Error(`Test webhook registration failed (HTTP ${registration.status}).`);
const webhook=await registration.json();
if(webhook.mode!=='test'||!webhook.secret?.startsWith('whsec_')) throw new Error('Yoco did not return a valid test webhook.');
const pkg=dirname(require.resolve('wrangler/package.json'));
const original=resolve(pkg,'bin/wrangler.js.bonlist-original');
const entry=existsSync(original)?original:resolve(pkg,'bin/wrangler.js');
const secrets={YOCO_SECRET_KEY:credentials.secret,YOCO_PUBLIC_KEY:credentials.public,YOCO_WEBHOOK_SECRET:webhook.secret};
const result=spawnSync(process.execPath,[entry,'secret','bulk','--config','wrangler.toml'],{input:JSON.stringify(secrets),encoding:'utf8',windowsHide:true});
if(result.status!==0){
 // Preserve the one-time signing secret in protected process memory rather
 // than printing it. A failed configuration needs explicit recovery.
 throw new Error('Cloudflare secret installation failed. Test webhook was registered; inspect Cloudflare permissions before retrying.');
}
console.log('Yoco test credentials and webhook signing secret installed securely in Cloudflare.');
console.log(`Registered test webhook: ${webhook.id}`);
const checkout=await fetch('https://payments.yoco.com/api/checkouts',{method:'POST',headers,body:JSON.stringify({amount:2000,currency:'ZAR',successUrl:'https://www.bonlist.site/payment/success',cancelUrl:'https://www.bonlist.site/payment/cancel',metadata:{purpose:'BonList test integration verification'}}),signal:AbortSignal.timeout(15000)});
if(!checkout.ok) throw new Error(`Secrets configured, but test checkout creation failed (HTTP ${checkout.status}).`);
const sample=await checkout.json();
console.log(`Test checkout created: ${sample.id}; hosted redirect returned: ${Boolean(sample.redirectUrl)}. No card charged.`);
