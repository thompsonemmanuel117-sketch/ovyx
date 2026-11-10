import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const runtime = await readFile(fileURLToPath(new URL('../assets/ovyx-app-studio-visual-refresh.js', import.meta.url)), 'utf8');
const html = [
'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>',
':root{--bg:#f5f5f2;--card:#ffffff;--text:#181818;--muted:#555b63;--border:#d7d9dc;--accent:#8b682c}',
'body{margin:0;background:var(--bg);color:var(--text)}',
'#view-appstudio{display:flex;flex-direction:column;gap:18px;width:100%;box-sizing:border-box;padding:24px}',
'#view-home{padding:24px}</style></head><body>',
'<section id="view-home"><nav id="ovyx-v52-bottom-bar">Dashboard navigation fixture</nav><p>Dashboard stays outside App Studio styling.</p></section>',
'<main id="view-appstudio">',
'<section id="ovyx-app-studio-experience" class="ovyx-as-hero"><h1 id="ovyx-as-title">From website to working app.</h1><p class="ovyx-as-hero__desc">Long description.</p><nav class="ovyx-as-flow">',
'<a data-ovyx-as-step="analyze"><span class="ovyx-as-flow__copy"><b>Analyze</b><small>Inspect a public URL</small></span></a>',
'<a data-ovyx-as-step="generate"><span class="ovyx-as-flow__copy"><b>Generate</b><small>Create your app</small></span></a>',
'<a data-ovyx-as-step="verify"><span class="ovyx-as-flow__copy"><b>Verify</b><small>Test real behaviour</small></span></a>',
'<a data-ovyx-as-step="release"><span class="ovyx-as-flow__copy"><b>Release</b><small>Save, export or publish</small></span></a></nav></section>',
'<section class="ovyx-as-workspace-dock"><h2>Workspace</h2><button class="ovyx-as-workspace-action">Projects</button></section>',
'<section class="ovyx-as-disclosure"><summary class="ovyx-as-disclosure__summary"><span class="ovyx-as-disclosure__copy">Brand identity</span></summary></section>',
'<section class="ovyx-ua-panel"><h3>Analyze</h3><p>Inspect your website.</p><input placeholder="Website URL"><button class="ovyx-ua-primary">Analyze website</button></section>',
'<section class="ovyx-lb-panel"><div class="ovyx-lb-heading"><h4>Build</h4></div><p class="ovyx-lb-muted">Create your app.</p><input placeholder="App name"><button class="ovyx-lb-generate">Generate app</button></section>',
'<section class="ovyx-lb-brain"><h4>Verify</h4><p>Run checks.</p><button class="ovyx-lb-brain-run">Run checks</button></section>',
'<section class="ovyx-lb-release"><h4>Release</h4><p>Save or publish.</p><button class="ovyx-lb-release-btn">Publish</button></section>',
'<section id="app-studio-clean-canvas"><div class="as4-shell">Existing conversion workflow</div></section>',
'</main><script src="/refresh.js"></script></body></html>'
].join('');
const server = createServer((req,res) => {
 if(req.url==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(html);}
 if(req.url==='/refresh.js'){res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});return res.end(runtime);}
 res.writeHead(404);res.end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base,{waitUntil:'load'});
 await page.waitForFunction(()=>document.getElementById('ovyx-app-studio-visual-refresh-style'));
 await page.waitForFunction(()=>document.querySelector('#view-appstudio .ovyx-as-flow__copy b')?.textContent==='Build');
 const desktop=await page.evaluate(()=>{
  const root=document.getElementById('view-appstudio'),panel=document.querySelector('.ovyx-ua-panel'),hero=document.querySelector('.ovyx-as-hero');
  return {paddingBottom:getComputedStyle(root).paddingBottom,text:getComputedStyle(panel).color,heroTitle:document.getElementById('ovyx-as-title').textContent,description:document.querySelector('.ovyx-as-hero__desc').textContent,panelBackground:getComputedStyle(panel).backgroundImage,animation:getComputedStyle(hero).animationName,dashboardPosition:getComputedStyle(document.getElementById('ovyx-v52-bottom-bar')).position};
 });
 assert.equal(desktop.paddingBottom,'22px','The excessive App Studio bottom runway must be removed.');
 assert.equal(desktop.text,'rgb(24, 24, 24)','App Studio text must use the active light-theme text colour.');
 assert.equal(desktop.heroTitle,'Build apps, beautifully.');
 assert.equal(desktop.description,'Analyze a site. Build, verify and release your app.');
 assert.notEqual(desktop.panelBackground,'none','Panels must retain a deliberate surface.');
 assert.notEqual(desktop.animation,'none','The workspace should keep its subtle entrance motion.');
 assert.equal(desktop.dashboardPosition,'static','Dashboard navigation must not be modified by the App Studio layer.');
 await page.evaluate(()=>{
  document.documentElement.style.setProperty('--bg','#090b10');document.documentElement.style.setProperty('--card','#151a22');document.documentElement.style.setProperty('--text','#f5f7fa');document.documentElement.style.setProperty('--muted','#b7c0cc');document.documentElement.style.setProperty('--border','#394351');
 });
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.ovyx-ua-panel')).color==='rgb(245, 247, 250)');
 assert.equal(await page.locator('.ovyx-ua-panel').evaluate(el=>getComputedStyle(el).color),'rgb(245, 247, 250)','Dark theme changes must update App Studio without a reload.');
 const mobile=await browser.newPage({viewport:{width:390,height:844}});
 await mobile.emulateMedia({reducedMotion:'reduce'});await mobile.goto(base,{waitUntil:'load'});
 await mobile.waitForFunction(()=>document.getElementById('ovyx-app-studio-visual-refresh-style'));
 const metrics=await mobile.evaluate(()=>({viewport:document.documentElement.clientWidth,document:document.documentElement.scrollWidth,root:document.getElementById('view-appstudio').scrollWidth,width:document.getElementById('view-appstudio').clientWidth,animation:getComputedStyle(document.querySelector('.ovyx-as-hero')).animationDuration}));
 assert.ok(metrics.document<=metrics.viewport+1&&metrics.root<=metrics.width+1,'App Studio must not create mobile horizontal overflow: '+JSON.stringify(metrics));
 assert.ok(parseFloat(metrics.animation)<=0.00001,'Reduced-motion must disable entrance animations.');
 assert.deepEqual(errors,[],'The visual layer must not throw browser errors.');
 console.log('OVYX App Studio visual refresh browser checks passed: live light/dark theme adaptation, compact spacing, clear copy, desktop/mobile fit and reduced-motion support.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
