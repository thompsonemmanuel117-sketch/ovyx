import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const runtime = await readFile(fileURLToPath(new URL('../assets/ovyx-app-studio-visual-redesign.js', import.meta.url)), 'utf8');
const html = [
'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>',
':root{--bg:#f5f5f2;--card:#fff;--text:#181818;--muted:#555b63;--border:#d7d9dc;--accent:#8b682c}',
'body{margin:0;background:var(--bg);color:var(--text)}#view-appstudio{display:flex;flex-direction:column;gap:22px;padding:24px;width:100%;box-sizing:border-box}',
'.ovyx-as-hero,.ovyx-as-workspace-dock,.ovyx-ua-panel,.ovyx-lb-panel,.ovyx-lb-brain,.ovyx-lb-release{border:1px solid var(--border);padding:24px}',
'</style></head><body><main id="view-appstudio">',
'<section class="ovyx-as-workspace-dock" id="ovyx-app-studio-workspace-dock"><div class="ovyx-as-workspace-dock__heading"><p class="ovyx-as-kicker">APP WORKSPACE</p><h2>Workspace overview</h2></div><p class="ovyx-as-workspace-status">Old status copy</p><button data-ovyx-as-workspace-action="projects">Open Projects</button><details class="ovyx-as-workspace-more"><summary>More actions</summary></details><div class="ovyx-as-project-state"><div class="ovyx-as-project-state__item"><span>Project</span><strong>Example</strong></div></div></section>',
'<section class="ovyx-as-hero" id="ovyx-app-studio-experience"><div class="ovyx-as-hero__top"><div class="ovyx-as-hero__copy"><p class="ovyx-as-kicker">OVYX · APP STUDIO</p><h1 id="ovyx-as-title">Build apps, beautifully.</h1><p class="ovyx-as-hero__desc">Old long description.</p></div></div><nav class="ovyx-as-flow" aria-label="App build steps">',
'<a href="#ovyx-app-studio-url-analyzer-panel" data-ovyx-as-step="analyze"><span class="ovyx-as-flow__number">01</span><span class="ovyx-as-flow__copy"><b>Analyze</b><small>Inspect a site</small></span><span class="ovyx-as-flow__state">Start here</span></a>',
'<a href="#ovyx-app-studio-link-builder" data-ovyx-as-step="generate"><span class="ovyx-as-flow__number">02</span><span class="ovyx-as-flow__copy"><b>Build</b><small>Create app</small></span><span class="ovyx-as-flow__state">Next</span></a>',
'<a href="#ovyx-app-studio-project-brain" data-ovyx-as-step="verify"><span class="ovyx-as-flow__number">03</span><span class="ovyx-as-flow__copy"><b>Verify</b><small>Run checks</small></span><span class="ovyx-as-flow__state">Next</span></a>',
'<a href="#ovyx-app-studio-release" data-ovyx-as-step="release"><span class="ovyx-as-flow__number">04</span><span class="ovyx-as-flow__copy"><b>Release</b><small>Publish</small></span><span class="ovyx-as-flow__state">Next</span></a></nav><p class="ovyx-as-hero__helper">Long helper.</p></section>',
'<section class="ovyx-ua-panel" id="ovyx-app-studio-url-analyzer-panel"><h3>Analyze</h3><input placeholder="Website URL"><button class="ovyx-ua-primary">Analyze website</button></section>',
'<section class="ovyx-lb-panel" id="ovyx-app-studio-link-builder"><div class="ovyx-lb-heading"><h4>Build</h4></div><button class="ovyx-lb-generate">Generate</button><button data-lb-export-zip>Export</button></section>',
'<section class="ovyx-lb-brain" id="ovyx-app-studio-project-brain"><h4>Verify</h4><button class="ovyx-lb-brain-run">Run checks</button></section>',
'<section class="ovyx-lb-release" id="ovyx-app-studio-release"><h4>Release</h4><button class="ovyx-lb-release-btn" data-lb-publish>Publish</button><details data-lb-mobile-build><summary>Build for Android or iOS</summary></details></section>',
'<section id="ovyx-app-studio-brand-dna-panel">Brand DNA controls</section><section id="app-studio-clean-canvas">Existing conversion flow</section>',
'</main><script src="/redesign.js"></script></body></html>'
].join('');
const server=createServer((req,res)=>{
 if(req.url==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(html);}
 if(req.url==='/redesign.js'){res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});return res.end(runtime);}
 res.writeHead(404);res.end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base,{waitUntil:'load'});
 await page.waitForFunction(()=>document.getElementById('ovyx-app-studio-visual-redesign-style'));
 const desktop=await page.evaluate(()=>{
  const root=document.getElementById('view-appstudio'),hero=document.getElementById('ovyx-app-studio-experience'),dock=document.getElementById('ovyx-app-studio-workspace-dock');
  return {order:hero.nextElementSibling?.id,copy:document.querySelector('.ovyx-as-hero__desc').textContent,projectTitle:document.querySelector('.ovyx-as-workspace-dock h2').textContent,gap:getComputedStyle(root).rowGap,paddingBottom:getComputedStyle(root).paddingBottom,heroColumns:getComputedStyle(document.querySelector('.ovyx-as-flow')).gridTemplateColumns,primaryColor:getComputedStyle(document.querySelector('.ovyx-ua-primary')).color,featureCount:['#ovyx-app-studio-url-analyzer-panel','#ovyx-app-studio-link-builder','#ovyx-app-studio-project-brain','#ovyx-app-studio-release','#ovyx-app-studio-brand-dna-panel','#app-studio-clean-canvas'].filter(s=>document.querySelector(s)).length};
 });
 assert.equal(desktop.order,'ovyx-app-studio-workspace-dock','The guided flow must appear before project status.');
 assert.equal(desktop.copy,'Analyze. Build. Verify. Release.');
 assert.equal(desktop.projectTitle,'Your project');
 assert.equal(desktop.paddingBottom,'12px','The page must not leave an unnecessary blank bottom runway.');
 assert.equal(desktop.featureCount,6,'Every existing feature panel must remain mounted.');
 assert.equal(desktop.primaryColor,'rgb(23, 20, 14)','Gold primary actions must retain readable foreground contrast.');
 await page.locator('[data-ovyx-as-step="release"]').click();
 assert.equal(new URL(page.url()).hash,'#ovyx-app-studio-release','Guided navigation must still target the real release panel.');
 await page.evaluate(()=>{
  document.documentElement.style.setProperty('--bg','#090b10');document.documentElement.style.setProperty('--card','#151a22');document.documentElement.style.setProperty('--text','#f5f7fa');document.documentElement.style.setProperty('--muted','#b7c0cc');document.documentElement.style.setProperty('--border','#394351');
 });
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.ovyx-lb-panel')).color==='rgb(245, 247, 250)');
 const mobile=await browser.newPage({viewport:{width:390,height:844}});
 await mobile.emulateMedia({reducedMotion:'reduce'});
 await mobile.goto(base,{waitUntil:'load'});
 const metrics=await mobile.evaluate(()=>({viewport:document.documentElement.clientWidth,document:document.documentElement.scrollWidth,root:document.getElementById('view-appstudio').scrollWidth,width:document.getElementById('view-appstudio').clientWidth,flowColumns:getComputedStyle(document.querySelector('.ovyx-as-flow')).gridTemplateColumns,animation:getComputedStyle(document.querySelector('.ovyx-as-hero')).animationDuration}));
 assert.ok(metrics.document<=metrics.viewport+1&&metrics.root<=metrics.width+1,'Mobile App Studio must not overflow horizontally: '+JSON.stringify(metrics));
 assert.equal(metrics.flowColumns.split(' ').length,2,'Mobile step navigation should use a readable two-column layout.');
 assert.ok(parseFloat(metrics.animation)<=0.00001,'Reduced motion must disable animations.');
 assert.deepEqual(errors,[],'The redesign must not introduce browser errors.');
 console.log('OVYX App Studio visual redesign browser checks passed: hierarchy, all features retained, live theme contrast, compact spacing and mobile layout.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
