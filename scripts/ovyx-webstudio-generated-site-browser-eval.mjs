import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(process.argv[2] || 'artifacts/webstudio-generated-sites');
const OUT = path.resolve(process.argv[3] || 'artifacts/webstudio-evaluation-report/browser');
const VIEWPORTS = [{name:'mobile-320',width:320,height:700},{name:'mobile-390',width:390,height:844},{name:'tablet-768',width:768,height:1024},{name:'laptop-1024',width:1024,height:768},{name:'desktop-1440',width:1440,height:900}];
const MIME = {'.html':'text/html; charset=utf-8','.htm':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.gif':'image/gif','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf','.json':'application/json; charset=utf-8'};
const QA_ENDPOINT = '/.well-known/ovyx-qa-enquiry';
function publicEndpoint(raw, allowQuery = false) {
  try {
    const url = new URL(String(raw || ''));
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (!allowQuery && [...url.searchParams.keys()].some(key => /(?:api[-_]?key|token|secret|auth|signature|credential|password)/i.test(key))) return null;
    return { origin: url.origin, pathname: url.pathname, href: url.href };
  } catch { return null; }
}
const LISTING_FEED = publicEndpoint(process.env.OVYX_EVAL_LISTINGS_PUBLIC_BROWSER_URL);
const PUBLIC_ENQUIRY = String(process.env.OVYX_EVAL_ENABLE_EXTERNAL_ENQUIRY_PROBE || '').trim().toLowerCase() === 'true'
  ? publicEndpoint(process.env.OVYX_EVAL_PUBLIC_ENQUIRY_URL)
  : null;
const ENQUIRY_TEST_RECIPIENT = String(process.env.OVYX_EVAL_ENQUIRY_TEST_RECIPIENT || '').trim();

async function walk(dir,prefix='') {
  const entries=await fs.readdir(dir,{withFileTypes:true}); const files=[];
  for(const entry of entries){if(entry.name.startsWith('.')||entry.name==='node_modules')continue;const rel=prefix?prefix+'/'+entry.name:entry.name;if(entry.isDirectory())files.push(...await walk(path.join(dir,entry.name),rel));else if(entry.isFile())files.push(rel);}
  return files;
}
function normalizeRoute(value) {
  let route=String(value||'/').split(/[?#]/,1)[0]||'/';
  try{route=decodeURIComponent(route);}catch{}
  if(!route.startsWith('/'))route='/'+route;
  route=route.replace(/\/{2,}/g,'/');
  if(/\/index\.html?$/i.test(route))route=route.replace(/index\.html?$/i,'');
  if(!route.endsWith('/')&&!/\.[a-z0-9]{1,12}$/i.test(route))route+='/';
  return route.toLowerCase();
}
function safeFile(root, relative) {
  const file=path.resolve(root, String(relative||'').replace(/^\/+/, ''));
  return file===root||file.startsWith(root+path.sep)?file:null;
}
async function loadSiteMetadata(root) {
  try {return JSON.parse(await fs.readFile(path.join(root,'ovyx-live-generation.json'),'utf8'));} catch {return {};}
}
function buildRouteMap(metadata) {
  const map=new Map();
  const pages=metadata&&metadata.siteMap&&Array.isArray(metadata.siteMap.pages)?metadata.siteMap.pages:[];
  for(const page of pages) if(page&&page.path&&page.url) map.set(normalizeRoute(page.url),String(page.path).replace(/^\/+/, ''));
  return map;
}
function serve(root, metadata) {
  const routeMap=buildRouteMap(metadata);
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url||'/', 'http://127.0.0.1');
      if(req.method==='POST'&&url.pathname===QA_ENDPOINT) {
        let body=''; for await (const chunk of req) {body+=chunk.toString(); if(body.length>20000)break;}
        const report={ok:true,qaOnly:true,receivedAt:new Date().toISOString(),payloadBytes:body.length};
        res.writeHead(202,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'});
        res.end(JSON.stringify(report)); return;
      }
      if(req.method==='OPTIONS'&&url.pathname===QA_ENDPOINT) {
        res.writeHead(204,{'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type','cache-control':'no-store'});
        res.end(); return;
      }
      if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end('Method not allowed');return;}
      let pathname=decodeURIComponent(url.pathname||'/').replace(/^\/+/, '');
      const route=normalizeRoute(url.pathname);
      if(routeMap.has(route)) pathname=routeMap.get(route);
      else if(!pathname||String(url.pathname).endsWith('/')) pathname+='index.html';
      const file=safeFile(root,pathname);
      if(!file){res.writeHead(403);res.end('Forbidden');return;}
      try{await fs.access(file);}catch{res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('Not found');return;}
      let body=await fs.readFile(file);
      if(/\.html?$/i.test(file)&&routeMap.has(route)) {
        const base=path.posix.dirname('/'+routeMap.get(route).replace(/^\/+/, ''))+'/';
        let source=body.toString('utf8');
        if(!/<base\b/i.test(source)) source=source.replace(/<head(\s[^>]*)?>/i, match=>match+'\n<base href="'+base.replace(/"/g,'&quot;')+'">');
        body=Buffer.from(source);
      }
      res.writeHead(200,{'content-type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'});
      if(req.method==='HEAD')res.end();else res.end(body);
    }catch{res.writeHead(400);res.end('Bad request');}
  });
  return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve({server,port:server.address().port})));
}
async function inspectPage(page) {
  return await page.evaluate(()=> {
    const visibleText=((document.body&&document.body.innerText)||'').replace(/\s+/g,' ').trim();
    const copyRules=[
      ['lorem ipsum',/\blorem ipsum\b/i],
      ['unfinished placeholder',/\b(?:insert|replace|add)\s+(?:your\s+)?(?:text|copy|content|image|logo|company name|business name)\s+here\b/i],
      ['bracketed content placeholder',/\[\s*(?:your|insert|replace|add)\s+(?:business|company|brand|product|text|content|image)\b[^\]]{0,80}\]/i],
      ['generic brand placeholder',/\b(?:your company name|your business name|your brand name|company name goes here|brand name goes here)\b/i],
      ['unfinished marker',/\b(?:TODO|FIXME)\b/i],
      ['generic launch filler',/\b(?:coming soon|under construction|content goes here|sample text)\b/i],
    ];
    const labels=new Set(Array.from(document.querySelectorAll('label[for]')).map(l=>l.htmlFor));
    const unlabeledControls=Array.from(document.querySelectorAll('input,select,textarea')).filter(el=>{
      if(['hidden','submit','button','reset','image'].includes((el.type||'').toLowerCase()))return false;
      const aria=el.getAttribute('aria-label')||el.getAttribute('aria-labelledby');
      return !aria&&!labels.has(el.id)&&!el.closest('label');
    }).map(el=>({tag:el.tagName.toLowerCase(),type:el.type||'',name:el.name||'',id:el.id||''})).slice(0,20);
    const deadLinks=Array.from(document.querySelectorAll('a')).filter(a=>{
      const href=(a.getAttribute('href')||'').trim();
      return !href||href==='#'||/^javascript:/i.test(href);
    }).map(a=>({text:(a.innerText||a.getAttribute('aria-label')||'').trim().slice(0,100),href:a.getAttribute('href')||''})).slice(0,30);
    const internalLinks=Array.from(document.querySelectorAll('a[href]')).filter(a=>{
      try{return new URL(a.href,location.href).origin===location.origin;}catch{return false;}
    }).map(a=>({text:(a.innerText||a.getAttribute('aria-label')||'').trim().slice(0,100),href:a.href}));
    const externalLinks=Array.from(document.querySelectorAll('a[href]')).filter(a=>{
      try{const u=new URL(a.href,location.href);return u.origin!==location.origin&&/^https?:$/i.test(u.protocol);}catch{return false;}
    }).map(a=>({text:(a.innerText||a.getAttribute('aria-label')||'').trim().slice(0,100),href:a.href.slice(0,400)})).slice(0,50);
    const forms=Array.from(document.forms).map(f=>({action:f.getAttribute('action')||'',method:(f.getAttribute('method')||'get').toLowerCase(),fieldCount:f.querySelectorAll('input,select,textarea').length,hasRequired:Array.from(f.querySelectorAll('input,select,textarea')).some(el=>el.required),hasSubmit:!!f.querySelector('button[type="submit"],input[type="submit"],button:not([type])')}));
    const buttons=Array.from(document.querySelectorAll('button,[role="button"]')).map((b,index)=>{const rect=b.getBoundingClientRect();return {index,text:(b.innerText||b.getAttribute('aria-label')||'').trim().slice(0,100),type:b.getAttribute('type')||'',disabled:!!b.disabled,hasHref:!!b.closest('a'),inForm:!!b.closest('form'),visible:rect.width>0&&rect.height>0&&getComputedStyle(b).visibility!=='hidden',hasInlineHandler:!!(b.getAttribute('onclick')||b.getAttribute('onchange'))};});
    return {
      title:document.title,lang:document.documentElement.lang||'',viewportWidth:innerWidth,documentWidth:document.documentElement.scrollWidth,
      horizontalOverflow:document.documentElement.scrollWidth>innerWidth+2||(document.body&&document.body.scrollWidth>innerWidth+2),
      imageCount:document.images.length,
      brokenImages:Array.from(document.images).filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.currentSrc||i.src).slice(0,15),
      interactiveControls:document.querySelectorAll('a[href],button,input,select,textarea,[role="button"],[tabindex]').length,
      imagesMissingAlt:Array.from(document.images).filter(i=>!i.hasAttribute('alt')).length,
      missingDocumentDescription:!document.querySelector('meta[name="description"]'),
      reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,
      visibleText:visibleText.slice(0,25000),
      copyIssues:copyRules.filter(rule=>rule[1].test(visibleText)).map(rule=>rule[0]),
      deadLinks,internalLinks:internalLinks.slice(0,100),externalLinks,forms,unlabeledControls,buttons,
    };
  });
}
async function testInternalLinks(page, links) {
  const checked=[];
  const current=new URL(page.url());
  const candidates=[...new Map((links||[]).map(item=>[item.href,item])).values()].slice(0,50);
  for(const item of candidates){
    let url;try{url=new URL(item.href,current);}catch{checked.push({href:item.href,status:'invalid-url'});continue;}
    if(url.origin!==current.origin)continue;
    if(url.hash&&url.pathname===current.pathname&&url.search===current.search){
      let targetExists=false;
      try{targetExists=await page.evaluate(fragment=>{let id=fragment;try{id=decodeURIComponent(fragment.replace(/^#/,'').replace(/\+/g,' '));}catch{}return !!document.getElementById(id)||!!document.querySelector('[name="'+CSS.escape(id)+'"]');},url.hash);}catch{}
      if(!targetExists)checked.push({href:item.href,status:'missing-fragment-target'});
      else checked.push({href:item.href,status:'fragment-target-found'});
      continue;
    }
    try{
      const response=await page.request.get(url.href.split('#')[0],{timeout:6000,maxRedirects:3});
      checked.push({href:item.href,httpStatus:response.status(),status:response.ok()?'reachable-local-route':'local-route-http-error'});
    }catch(error){checked.push({href:item.href,status:'local-route-request-failed',error:String(error.message||error).slice(0,160)});}
  }
  return checked;
}
async function interactionSnapshot(page) {
  return await page.evaluate(() => ({
    url: location.href,
    text: ((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').trim().slice(0, 12000),
    scrollY: Math.round(window.scrollY),
    dialogs: document.querySelectorAll('dialog[open],[role="dialog"]:not([hidden])').length,
    states: Array.from(document.querySelectorAll('button,[role="button"],[aria-expanded],[aria-pressed],[aria-selected],details,dialog,input,select,textarea')).slice(0,120).map(el => ({
      tag: el.tagName.toLowerCase(), id: el.id || '', name: el.getAttribute('name') || '',
      expanded: el.getAttribute('aria-expanded'), pressed: el.getAttribute('aria-pressed'),
      selected: el.getAttribute('aria-selected'), hidden: !!el.hidden, open: !!el.open,
      checked: 'checked' in el ? !!el.checked : null, value: 'value' in el ? String(el.value).slice(0,120) : null,
      text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0,120),
    })),
  }));
}
async function exerciseButtons(page, baseUrl, route) {
  const output = [];
  const buttons = page.locator('button,[role="button"]');
  const candidates = await buttons.evaluateAll(elements => elements.map(el => {
    const rect = el.getBoundingClientRect();
    return {
      text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0,100),
      type: (el.getAttribute('type') || '').toLowerCase(),
      disabled: !!el.disabled, inForm: !!el.closest('form'), hasHref: !!el.closest('a'),
      visible: rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden',
    };
  })).catch(() => []);
  const count = Math.min(candidates.length, 20);
  for (let index = 0; index < count; index++) {
    const info = candidates[index];
    if (!info) continue;
    if (!info.visible || info.disabled || info.inForm || info.hasHref || info.type === 'submit') {
      output.push({ index, text: info.text, status: 'skipped-not-a-safe-standalone-button' });
      continue;
    }
    try {
      await page.goto(baseUrl + route, { waitUntil: 'domcontentloaded', timeout: 7000 });
      const fresh = page.locator('button,[role="button"]').nth(index);
      await fresh.scrollIntoViewIfNeeded({ timeout: 1500 });
      const before = await interactionSnapshot(page);
      let popupOpened = false;
      const popupHandler = popup => { popupOpened = true; popup.close().catch(() => {}); };
      page.on('popup', popupHandler);
      let clickError = '';
      try { await fresh.click({ timeout: 1800 }); }
      catch (error) { clickError = String(error.message || error).slice(0,180); }
      await page.waitForTimeout(180).catch(() => {});
      page.off('popup', popupHandler);
      const after = await interactionSnapshot(page).catch(() => null);
      const changed = !!after && (
        before.url !== after.url ||
        before.text !== after.text ||
        Math.abs(before.scrollY - after.scrollY) > 12 ||
        before.dialogs !== after.dialogs ||
        JSON.stringify(before.states) !== JSON.stringify(after.states)
      );
      output.push({
        index, text: info.text, clickError: clickError || null,
        status: clickError ? 'click-failed' : popupOpened ? 'popup-opened' : changed ? 'observable-state-change' : 'no-observable-state-change',
      });
    } catch (error) {
      output.push({ index, text: info.text, status: 'interaction-test-error', error: String(error.message || error).slice(0,180) });
    }
  }
  await page.goto(baseUrl + route, { waitUntil: 'domcontentloaded', timeout: 7000 }).catch(() => {});
  return { tested: output.filter(item => !String(item.status).startsWith('skipped')).length, skipped: output.filter(item => String(item.status).startsWith('skipped')).length, results: output };
}
async function exercisePublicEnquiryForms(page) {
  if (!PUBLIC_ENQUIRY || !ENQUIRY_TEST_RECIPIENT) {
    return { status: 'not-configured-or-not-opted-in', requestObserved: false, endpointAcceptedTestPayload: false, explicitDeliveryReceipt: false, realEnquiryDeliveryConfirmed: false, note: 'No public enquiry URL, owner-controlled test recipient, and explicit probe approval were all present.' };
  }
  const forms=page.locator('form');
  const count=await forms.count().catch(()=>0);
  const results=[];
  for(let index=0;index<count;index++){
    const form=forms.nth(index);
    const details=await form.evaluate(f=>({action:f.getAttribute('action')||'',method:(f.getAttribute('method')||'get').toLowerCase()})).catch(()=>({}));
    let formUrl;
    try{formUrl=new URL(details.action,page.url());}catch{continue;}
    if(formUrl.origin!==PUBLIC_ENQUIRY.origin||formUrl.pathname!==PUBLIC_ENQUIRY.pathname||details.method!=='post')continue;
    const fields=form.locator('input,select,textarea');
    for(let j=0;j<await fields.count();j++){
      const field=fields.nth(j);
      const info=await field.evaluate(el=>({tag:el.tagName.toLowerCase(),type:(el.type||'').toLowerCase(),disabled:!!el.disabled,value:el.value||'',name:(el.name||'').toLowerCase(),options:el.tagName==='SELECT'?Array.from(el.options).filter(o=>!o.disabled&&o.value).map(o=>o.value):[]}));
      if(info.disabled||['hidden','submit','button','reset','file','image'].includes(info.type))continue;
      if(info.type==='checkbox'||info.type==='radio'){if(info.type==='checkbox')await field.check({force:true}).catch(()=>{});continue;}
      if(info.tag==='select'){if(info.options.length)await field.selectOption(info.options[0]).catch(()=>{});continue;}
      const value=info.type==='email'||info.name.includes('email')?ENQUIRY_TEST_RECIPIENT
        :info.type==='tel'?'+15555550123'
        :info.type==='url'?'https://example.invalid'
        :info.type==='number'?'1'
        :/name/.test(info.name)?'OVYX Automated QA Test'
        :/subject/.test(info.name)?'OVYX QA integration test — no action needed'
        :/message|comment|note/.test(info.name)?'OVYX automated integration test; no action needed. test=true; dryRun=true.'
        :'OVYX QA integration test';
      await field.fill(value).catch(()=>{});
    }
    let response=null,responseBody=null,requestError=null;
    const responsePromise=page.waitForResponse(candidate=>candidate.url().split('#')[0]===PUBLIC_ENQUIRY.href.split('#')[0]&&candidate.request().method()==='POST',{timeout:10000}).then(async candidate=>{
      response=candidate;
      try{responseBody=await candidate.json();}catch{responseBody=null;}
      return candidate;
    }).catch(error=>{requestError=String(error.message||error).slice(0,180);return null;});
    await form.evaluate(f=>{if(typeof f.requestSubmit==='function')f.requestSubmit();else f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));}).catch(error=>{requestError=String(error.message||error).slice(0,180);});
    await responsePromise;
    await page.waitForTimeout(250).catch(()=>{});
    const status=response?response.status():null;
    const obj=responseBody&&typeof responseBody==='object'?responseBody:{};
    const nested=obj.delivery&&typeof obj.delivery==='object'?obj.delivery:{};
    const deliveryStatus=String(obj.deliveryStatus||obj.messageStatus||nested.status||'').trim().toLowerCase().replace(/[\s_-]+/g,' ');
    const explicitDelivery=obj.delivered===true||obj.messageDelivered===true||nested.delivered===true||['delivered','delivery confirmed','delivered to recipient'].includes(deliveryStatus);
    const endpointAccepted=Boolean(response&&status>=200&&status<300&&(obj.ok===true||obj.accepted===true||obj.success===true||obj.queued===true||obj.delivered===true||String(obj.status||'').toLowerCase()==='accepted'));
    const deliveryConfirmed=endpointAccepted&&explicitDelivery;
    results.push({
      status:deliveryConfirmed?'endpoint-reported-delivery-confirmed':endpointAccepted?'endpoint-accepted-test-payload-delivery-unverified':response?'endpoint-did-not-confirm-test-acceptance':'external-enquiry-request-not-observed',
      requestObserved:Boolean(response),httpStatus:status,endpointAcceptedTestPayload:endpointAccepted,explicitDeliveryReceipt:explicitDelivery,
      realEnquiryDeliveryConfirmed:deliveryConfirmed,deliveryStatusReported:deliveryStatus||null,requestError,
      responseFields:Object.keys(obj).slice(0,20),
      note:'This was an owner-authorized QA payload only. A local test report cannot independently prove inbox receipt; only an explicit endpoint delivery receipt is recorded as provider-reported delivery.',
    });
  }
  if(!results.length)return {status:'public-enquiry-form-not-found',requestObserved:false,endpointAcceptedTestPayload:false,explicitDeliveryReceipt:false,realEnquiryDeliveryConfirmed:false,note:'No form targeting the exact approved public endpoint was present in the rendered page.'};
  const confirmed=results.some(item=>item.realEnquiryDeliveryConfirmed);
  const accepted=results.some(item=>item.endpointAcceptedTestPayload);
  return {status:confirmed?'endpoint-reported-delivery-confirmed':accepted?'endpoint-accepted-test-payload-delivery-unverified':'public-enquiry-test-failed',requestObserved:results.some(item=>item.requestObserved),endpointAcceptedTestPayload:accepted,explicitDeliveryReceipt:confirmed,realEnquiryDeliveryConfirmed:confirmed,attempts:results};
}

async function exerciseQAForms(page) {
  const records=[];
  const forms=page.locator('form');
  const count=await forms.count().catch(()=>0);
  for(let index=0;index<count;index++){
    const form=forms.nth(index);
    const details=await form.evaluate(f=>({action:f.getAttribute('action')||'',method:(f.getAttribute('method')||'get').toLowerCase()})).catch(()=>({}));
    if(details.action!==QA_ENDPOINT||details.method!=='post')continue;
    const fields=form.locator('input,select,textarea');
    for(let j=0;j<await fields.count();j++){
      const field=fields.nth(j);
      const info=await field.evaluate(el=>({tag:el.tagName.toLowerCase(),type:(el.type||'').toLowerCase(),required:!!el.required,disabled:!!el.disabled,value:el.value||'',options:el.tagName==='SELECT'?Array.from(el.options).filter(o=>!o.disabled&&o.value).map(o=>o.value):[]}));
      if(info.disabled||['hidden','submit','button','reset','file','image'].includes(info.type))continue;
      if(info.type==='checkbox'||info.type==='radio'){if(info.required||info.type==='checkbox')await field.check({force:true}).catch(()=>{});continue;}
      if(info.tag==='select'){if(info.options.length)await field.selectOption(info.options[0]).catch(()=>{});continue;}
      if(info.value)continue;
      const value=info.type==='email'?'ovyx-qa@example.invalid':info.type==='tel'?'+15555550123':info.type==='url'?'https://example.invalid':info.type==='number'?'1':'OVYX QA evaluation';
      await field.fill(value).catch(()=>{});
    }
    const before=Date.now();
    const responseWait=page.waitForResponse(response=>response.url().includes(QA_ENDPOINT)&&response.request().method()==='POST',{timeout:8000}).catch(()=>null);
    await form.evaluate(f=>{if(typeof f.requestSubmit==='function')f.requestSubmit();else f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));}).catch(()=>{});
    const response=await responseWait;
    await page.waitForTimeout(300).catch(()=>{});
    const responseStatus=response?response.status():null;
    const state=await page.evaluate(()=>((document.body&&document.body.innerText)||'').replace(/\s+/g,' ').trim()).catch(()=>'');
    const successVisible=/\b(?:enquiry|inquiry|message|request).{0,60}(?:sent|received|submitted|complete|thank you)|\bthank you\b/i.test(state);
    const errorVisible=/\b(?:could not|unable to|failed to|error sending|try again|not connected|error occurred)\b/i.test(state);
    records.push({
      endpoint:QA_ENDPOINT,requestObserved:!!response,httpStatus:responseStatus,elapsedMs:Date.now()-before,
      visibleSuccessState:successVisible,visibleErrorState:errorVisible,
      classification:responseStatus===202&&successVisible?'qa-only-local-form-post-and-success-ui-verified'
       :responseStatus===202?'qa-only-local-post-received-but-success-ui-unverified'
       :response?'qa-only-local-post-returned-non-success-status'
       :'form-did-not-submit-to-qa-endpoint',
      realEnquiryDeliveryConfirmed:false,
      note:'The local QA endpoint returns an isolated acknowledgement only. It does not send email, WhatsApp, social messages or persist customer leads.',
    });
  }
  return records;
}
async function main() {
  await fs.mkdir(OUT,{recursive:true}); let entries=[];
  try{entries=await fs.readdir(ROOT,{withFileTypes:true});}catch{}
  const sites=entries.filter(e=>e.isDirectory()&&!e.name.startsWith('.'));
  if(!sites.length){const report={status:'not-run-no-real-artifacts',reason:'No generated-site folders were supplied. No real website was marked as tested.',evaluatedSites:[],generatedAt:new Date().toISOString()};await fs.writeFile(path.join(OUT,'browser-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));return;}
  const browser=await chromium.launch({headless:true});const results=[];
  try{
    for(const site of sites){
      const root=path.resolve(ROOT,site.name);const files=await walk(root);const html=files.filter(f=>/\.html?$/i.test(f)).sort();
      if(!html.length){results.push({site:site.name,status:'needs-attention',reason:'No HTML entry pages found.'});continue;}
      const metadata=await loadSiteMetadata(root);const {server,port}=await serve(root,metadata);const output=path.join(OUT,site.name);await fs.mkdir(output,{recursive:true});const checks=[];
      try{
        for(const relative of html.slice(0,12)){
          const routeEntry=(metadata.siteMap?.pages||[]).find(p=>String(p.path||'').replace(/^\/+/, '')===relative);
          const route=routeEntry?.url||('/'+relative.split('/').map(encodeURIComponent).join('/'));
          for(const vp of VIEWPORTS){
            const page=await browser.newPage({viewport:{width:vp.width,height:vp.height},reducedMotion:'reduce'});
            const errors=[],consoleErrors=[],failedRequests=[],blockedExternalRequests=[];
            const baseOrigin='http://127.0.0.1:'+port;
            await page.route('**/*',async route=>{
              const request=route.request(),raw=request.url();
              let target;
              try{target=new URL(raw);}catch{return route.abort('blockedbyclient');}
              if(['data:','blob:','about:'].includes(target.protocol)||target.origin===baseOrigin)return route.continue();
              const safeListingRequest=Boolean(LISTING_FEED)&&target.protocol==='https:'&&target.origin===LISTING_FEED.origin&&target.pathname===LISTING_FEED.pathname&&target.search===LISTING_FEED.search&&['GET','HEAD','OPTIONS'].includes(request.method())&&['fetch','xhr'].includes(request.resourceType());
              const safeEnquiryTarget=Boolean(PUBLIC_ENQUIRY)&&Boolean(ENQUIRY_TEST_RECIPIENT)&&target.protocol==='https:'&&target.origin===PUBLIC_ENQUIRY.origin&&target.pathname===PUBLIC_ENQUIRY.pathname&&target.search===PUBLIC_ENQUIRY.search&&['POST','OPTIONS'].includes(request.method())&&['fetch','xhr'].includes(request.resourceType());
              let safeEnquiryRequest=false;
              if(safeEnquiryTarget&&request.method()==='OPTIONS')safeEnquiryRequest=true;
              else if(safeEnquiryTarget&&request.method()==='POST'){
                let payload=null;
                try{payload=request.postDataJSON();}catch{}
                const recipient=String(payload?.email||payload?.recipient||'').trim().toLowerCase();
                const markedQA=payload?.test===true&&payload?.dryRun===false&&String(payload?.source||'').trim()==='OVYX QA';
                const QAIdentity=/^OVYX(?: automated)? QA/i.test(String(payload?.name||'').trim());
                const QAMessage=/OVYX.*(?:test|QA)|no action needed/i.test(String(payload?.message||payload?.subject||''));
                safeEnquiryRequest=Boolean(markedQA&&QAIdentity&&QAMessage&&recipient===ENQUIRY_TEST_RECIPIENT.toLowerCase());
                if(!safeEnquiryRequest)blockedExternalRequests.push({url:raw.slice(0,300),method:request.method(),resourceType:request.resourceType(),reason:'blocked: public enquiry payload did not prove it was an owner-approved QA-only submission'});
              }
              if(safeListingRequest||safeEnquiryRequest)return route.continue();
              if(!safeEnquiryTarget)blockedExternalRequests.push({url:raw.slice(0,300),method:request.method(),resourceType:request.resourceType()});
              return route.abort('blockedbyclient');
            });
            page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,250)));
            page.on('console',m=>{if(m.type()==='error')consoleErrors.push(String(m.text()||'').slice(0,300));});
            page.on('requestfailed',r=>{if(/\.(?:png|jpe?g|webp|avif|gif|svg|css|m?js|woff2?|ttf|otf)(?:[?#]|$)/i.test(r.url())||r.url().includes(QA_ENDPOINT))failedRequests.push({url:r.url().slice(0,250),error:r.failure()?.errorText||''});});
            let navigationError='';
            try{await page.goto('http://127.0.0.1:'+port+route,{waitUntil:'networkidle',timeout:12000});}
            catch(e){navigationError=String(e.message||e).slice(0,250);try{await page.goto('http://127.0.0.1:'+port+route,{waitUntil:'domcontentloaded',timeout:6000});}catch{}}
            const metrics=await inspectPage(page);
            if(vp.width!==390)delete metrics.visibleText;
            const screenshot=relative.replace(/[^a-z0-9_-]+/gi,'_')+'__'+vp.name+'.png';
            await page.screenshot({path:path.join(output,screenshot),fullPage:true,animations:'disabled',timeout:12000}).catch(()=>{});
            const internalLinkChecks=vp.width===390?await testInternalLinks(page,metrics.internalLinks):[];
            const buttonInteractions=vp.width===390?await exerciseButtons(page,baseOrigin,route):{tested:0,skipped:0,results:[]};
            const publicEnquiryInteractions=vp.width===390&&PUBLIC_ENQUIRY&&ENQUIRY_TEST_RECIPIENT&&metrics.forms.some(form=>{try{const u=new URL(form.action,page.url());return u.origin===PUBLIC_ENQUIRY.origin&&u.pathname===PUBLIC_ENQUIRY.pathname&&form.method==='post';}catch{return false;}})
              ?await exercisePublicEnquiryForms(page)
              :{status:PUBLIC_ENQUIRY&&ENQUIRY_TEST_RECIPIENT?'public-enquiry-form-not-on-this-route':'not-configured-or-not-opted-in',requestObserved:false,endpointAcceptedTestPayload:false,explicitDeliveryReceipt:false,realEnquiryDeliveryConfirmed:false};
            const formInteractions=vp.width===390?await exerciseQAForms(page):[];
            const interactionScreenshot=vp.width===390?relative.replace(/[^a-z0-9_-]+/gi,'_')+'__mobile-390__post-interactions.png':null;
            if(interactionScreenshot)await page.screenshot({path:path.join(output,interactionScreenshot),fullPage:true,animations:'disabled',timeout:12000}).catch(()=>{});
            checks.push({page:relative,route,viewport:vp.name,metrics,pageErrors:errors,consoleErrors,failedRequests,blockedExternalRequests,navigationError,internalLinkChecks,buttonInteractions,publicEnquiryInteractions,formInteractions,screenshot,interactionScreenshot});
            await page.close();
          }
        }
      } finally {await new Promise(resolve=>server.close(resolve));}
      const formResults=checks.flatMap(c=>c.formInteractions||[]);
      const publicEnquiryChecks=checks.filter(c=>c.viewport==='mobile-390').map(c=>({page:c.page,...(c.publicEnquiryInteractions||{})}));
      const publicEnquiryFormObserved=publicEnquiryChecks.some(item=>item.requestObserved===true);
      const publicEnquiryDeliveryConfirmed=publicEnquiryChecks.some(item=>item.realEnquiryDeliveryConfirmed===true);
      const publicEnquiryFailure=Boolean(PUBLIC_ENQUIRY&&ENQUIRY_TEST_RECIPIENT)&&!publicEnquiryDeliveryConfirmed;
      const buttonResults=checks.filter(c=>c.viewport==='mobile-390').flatMap(c=>c.buttonInteractions?.results||[]);
      const qaFormMissing=formResults.length===0;
      const noOpButtons=buttonResults.filter(item=>['no-observable-state-change','click-failed','interaction-test-error'].includes(item.status));
      const externalRequests=checks.flatMap(c=>c.blockedExternalRequests||[]);
      const failures=checks.filter(c=>c.navigationError||c.metrics?.horizontalOverflow||c.metrics?.brokenImages?.length||c.metrics?.copyIssues?.length||c.metrics?.deadLinks?.length||c.metrics?.unlabeledControls?.length||c.pageErrors.length||c.consoleErrors.length||c.failedRequests.length||c.blockedExternalRequests.length||c.internalLinkChecks.some(link=>['invalid-url','missing-fragment-target','local-route-http-error','local-route-request-failed'].includes(link.status))||c.buttonInteractions?.results?.some(item=>['no-observable-state-change','click-failed','interaction-test-error'].includes(item.status))||c.formInteractions.some(f=>f.classification!=='qa-only-local-form-post-and-success-ui-verified'));
      if(qaFormMissing)failures.push({page:'site-level',reason:'Required QA-only enquiry form did not submit to the isolated test receiver.'});
      if(publicEnquiryFailure)failures.push({page:'site-level',reason:'Owner-approved public enquiry form did not return an explicit delivery receipt.'});
      results.push({
        site:site.name,status:failures.length?'needs-attention':html.length>12?'pass-with-limited-route-sample':'browser-checked-no-obvious-blockers',
        htmlRoutes:html.length,testedRoutes:Math.min(html.length,12),routeSampleLimited:html.length>12,
        viewportWidths:VIEWPORTS.map(v=>v.width),failingChecks:failures.length,
        formInteractionStatus:formResults.length?(formResults.every(f=>f.classification==='qa-only-local-form-post-and-success-ui-verified')?'qa-local-post-tested':'qa-form-test-has-findings'):'no-qa-form-submission-tested',
        qaLocalPosts:formResults.length,qaFormMissing,
        publicEnquiryEndpointConfigured:Boolean(PUBLIC_ENQUIRY),publicEnquiryFormObserved,publicEnquiryDeliveryConfirmed,
        publicEnquiryStatus:publicEnquiryChecks.some(item=>item.status==='endpoint-reported-delivery-confirmed')?'endpoint-reported-delivery-confirmed':publicEnquiryFormObserved?'public-form-submitted-without-confirmed-delivery':PUBLIC_ENQUIRY?'configured-public-form-not-observed':'not-configured-or-not-opted-in',
        publicEnquiryChecks,realEnquiryDeliveryConfirmed:publicEnquiryDeliveryConfirmed,
        buttonsTested:buttonResults.filter(item=>!String(item.status).startsWith('skipped')).length,
        noOpButtons:noOpButtons.length,buttonInteractionResults:buttonResults,
        blockedExternalRequests:externalRequests.length,realInventoryFeedConfigured:metadata.liveInventorySourceConfigured===true,
        realListingsConfirmed:metadata.inventoryHonesty?.realListingsConfirmed===true,
        pages:checks,
        caveats:[
          'The local QA endpoint is a simulated receiver and does not deliver customer messages.',
          'Outbound third-party/contact links are inventoried but not clicked or treated as proof of service availability.',
          'Automated source/DOM/browser checks cannot certify subjective premium visual quality or fully proofread grammar/factual accuracy.',
        ]
      });
    }
  } finally {await browser.close();}
  const report={
    schemaVersion:2,generatedAt:new Date().toISOString(),
    status:results.some(r=>r.status==='needs-attention')?'needs-attention':'browser-evaluated',
    sitesFound:sites.length,evaluatedSites:results.length,viewportWidths:VIEWPORTS.map(v=>v.width),results,
    verifiedClaims:{
      realListingsConfirmed:false,
      realEnquiryDeliveryConfirmed:PUBLIC_ENQUIRY&&ENQUIRY_TEST_RECIPIENT&&results.length>0&&results.every(site=>site.publicEnquiryDeliveryConfirmed===true),
      humanVisualReviewCompleted:false,humanEditorialReviewCompleted:false,
    },
    note:'Browser checks detect common visible blockers and test QA-only POST forms. They do not fully proofread grammar, style, factual accuracy, subjective premium design, or live payment, booking, messaging, social, production-data or external service integration.',
  };
  await fs.writeFile(path.join(OUT,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,sitesFound:report.sitesFound,evaluatedSites:report.evaluatedSites,formSubmissionsTested:results.reduce((n,r)=>n+r.qaLocalPosts,0),report:path.join(OUT,'browser-report.json')},null,2));
  if(results.some(r=>r.status==='needs-attention'))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error('Generated-site browser evaluation failed:',e);process.exitCode=1;});
