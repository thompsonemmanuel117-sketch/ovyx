import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const runtime = await readFile(fileURLToPath(new URL('../assets/ovyx-app-studio-workspace.js', import.meta.url)), 'utf8');
const html = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body>\n<section id=\"view-appstudio\" style=\"width:100%;max-width:1100px;margin:auto;display:flex;flex-direction:column;gap:16px\">\n  <section id=\"ovyx-app-studio-experience\"><h1>From website to working app.</h1></section>\n  <section id=\"ovyx-app-studio-url-analyzer-panel\"><h2>Analyze</h2><details id=\"scan-details\"><summary>Scan details</summary><p>Inspection</p></details></section>\n  <section id=\"ovyx-app-studio-link-builder\"><h2>Build</h2><details id=\"source-details\"><summary>Source files</summary><p>index.html</p></details></section>\n  <section id=\"ovyx-app-studio-project-brain\"><h2>Verify</h2><details id=\"brain-details\"><summary>Findings</summary><p>Checks</p></details></section>\n  <section id=\"ovyx-app-studio-release\"><h2>Release</h2><details id=\"release-details\"><summary>Release history</summary><p>None</p></details></section>\n</section>\n<script>window.__OVYX_APP_STUDIO_GENERATED_PROJECT__=null;window.__OVYX_PROJECT_BRAIN_REPORT__=null;window.__OVYX_URL_ANALYZER_LAST_REPORT__=null;</script>\n<script src=\"/assets/ovyx-app-studio-workspace.js\"></script>\n</body></html>";
function send(res,status,body,type='application/json; charset=utf-8'){res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(type.includes('json')?JSON.stringify(body):String(body));}
const server=createServer((req,res)=>{
 if(req.url==='/')return send(res,200,html,'text/html; charset=utf-8');
 if(req.url==='/assets/ovyx-app-studio-workspace.js')return send(res,200,runtime,'text/javascript; charset=utf-8');
 if(req.url==='/favicon.ico'){res.writeHead(204);return res.end();}
 return send(res,404,{ok:false});
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
try{
 const desktop=await browser.newPage({viewport:{width:1280,height:900}});
 await desktop.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:base});
 const errors=[];desktop.on('pageerror',e=>errors.push(e.message));
 await desktop.goto(base,{waitUntil:'load'});
 await desktop.locator('#ovyx-app-studio-workspace-dock').waitFor();
 assert.equal(await desktop.locator('[data-ovyx-as-workspace-target]').count(),4);
 await desktop.locator('[data-ovyx-as-workspace-target="ovyx-app-studio-project-brain"]').click();
 assert.match(await desktop.locator('[data-ovyx-as-workspace-status]').innerText(),/Opened Verify/);
 assert.equal(await desktop.locator('#ovyx-app-studio-project-brain').evaluate(el=>document.activeElement===el),true);
 await desktop.locator('[data-ovyx-as-workspace-action="expand"]').click();
 assert.equal(await desktop.locator('#view-appstudio details[open]').count(),4);
 await desktop.locator('[data-ovyx-as-workspace-action="collapse"]').click();
 assert.equal(await desktop.locator('#view-appstudio details[open]').count(),0);
 assert.match(await desktop.locator('[data-ovyx-as-workspace-status]').innerText(),/project data was not changed/);
 await desktop.locator('[data-ovyx-as-workspace-action="copy"]').click();
 await desktop.waitForFunction(()=>/Project summary copied/.test(document.querySelector('[data-ovyx-as-workspace-status]')?.textContent||''));
 assert.match(await desktop.evaluate(()=>navigator.clipboard.readText()),/OVYX App Studio project summary/);
 await desktop.evaluate(()=>{
  window.__OVYX_APP_STUDIO_GENERATED_PROJECT__={id:'app-123',name:'Coastal App',files:{'index.html':'<html/>','app.js':'void 0'},savedToProjects:true,releaseState:{web:{production:{status:'active'}}}};
  window.__OVYX_PROJECT_BRAIN_REPORT__={status:'passed',summary:{runtimeChecked:true}};
  window.dispatchEvent(new CustomEvent('ovyx:link-app-generated'));
 });
 await desktop.waitForFunction(()=>document.querySelector('[data-ovyx-as-project-state]')?.innerText.includes('Coastal App'));
 const state=await desktop.locator('[data-ovyx-as-project-state]').innerText();
 assert.match(state,/Saved/);assert.match(state,/passed/);assert.match(state,/active/);
 await desktop.evaluate(()=>{const release=document.getElementById('ovyx-app-studio-release');release.remove();window.__lateRelease=release;});
 await desktop.waitForFunction(()=>document.querySelector('[data-ovyx-as-workspace-target="ovyx-app-studio-release"]')?.disabled===true);
 await desktop.evaluate(()=>document.getElementById('view-appstudio').appendChild(window.__lateRelease));
 await desktop.waitForFunction(()=>document.querySelector('[data-ovyx-as-workspace-target="ovyx-app-studio-release"]')?.disabled===false);
 const mobile=await browser.newPage({viewport:{width:390,height:844}});
 await mobile.emulateMedia({reducedMotion:'reduce'});
 await mobile.goto(base,{waitUntil:'load'});
 await mobile.locator('#ovyx-app-studio-workspace-dock').waitFor();
 const metrics=await mobile.evaluate(()=>({viewport:document.documentElement.clientWidth,document:document.documentElement.scrollWidth,root:document.querySelector('#view-appstudio').scrollWidth,width:document.querySelector('#view-appstudio').clientWidth}));
 assert.ok(metrics.document<=metrics.viewport+1&&metrics.root<=metrics.width+1,'Mobile workspace must not overflow horizontally: '+JSON.stringify(metrics));
 assert.deepEqual(errors,[]);
 console.log('OVYX Stage 8 App Studio workspace browser checks passed: real section navigation/focus, expand/collapse actions, live project-state refresh and mobile overflow.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
