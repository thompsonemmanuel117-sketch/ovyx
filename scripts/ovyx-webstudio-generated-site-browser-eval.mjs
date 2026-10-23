import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(process.argv[2] || 'artifacts/webstudio-generated-sites');
const OUT = path.resolve(process.argv[3] || 'artifacts/webstudio-evaluation-report/browser');
const VIEWPORTS = [{name:'mobile-390',width:390,height:844},{name:'tablet-768',width:768,height:1024},{name:'desktop-1440',width:1440,height:900}];
const MIME = {'.html':'text/html; charset=utf-8','.htm':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.gif':'image/gif','.woff2':'font/woff2','.json':'application/json; charset=utf-8'};
async function walk(dir,prefix='') {
  const entries=await fs.readdir(dir,{withFileTypes:true}); const files=[];
  for(const entry of entries){if(entry.name.startsWith('.')||entry.name==='node_modules')continue;const rel=prefix?prefix+'/'+entry.name:entry.name;if(entry.isDirectory())files.push(...await walk(path.join(dir,entry.name),rel));else if(entry.isFile())files.push(rel);}
  return files;
}
function serve(root) {
  const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url||'/', 'http://127.0.0.1');let rel=decodeURIComponent(url.pathname).replace(/^\/+/, '');if(!rel||rel.endsWith('/'))rel+='index.html';const file=path.resolve(root,rel);if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end('Forbidden');return;}try{await fs.access(file);}catch{res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'content-type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream','cache-control':'no-store'});res.end(await fs.readFile(file));}catch{res.writeHead(400);res.end('Bad request');}});
  return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve({server,port:server.address().port})));
}
async function main() {
  await fs.mkdir(OUT,{recursive:true}); let entries=[];
  try{entries=await fs.readdir(ROOT,{withFileTypes:true});}catch{}
  const sites=entries.filter(e=>e.isDirectory()&&!e.name.startsWith('.'));
  if(!sites.length){const report={status:'not-run-no-real-artifacts',reason:'No generated-site folders were supplied. No real website was marked as tested.',evaluatedSites:[],generatedAt:new Date().toISOString()};await fs.writeFile(path.join(OUT,'browser-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));return;}
  const browser=await chromium.launch({headless:true});const results=[];
  try{for(const site of sites){const root=path.resolve(ROOT,site.name);const html=(await walk(root)).filter(f=>/\.html?$/i.test(f)).sort();if(!html.length){results.push({site:site.name,status:'needs-attention',reason:'No HTML entry pages found.'});continue;}
    const {server,port}=await serve(root);const output=path.join(OUT,site.name);await fs.mkdir(output,{recursive:true});const checks=[];
    try{for(const relative of html.slice(0,12)){for(const vp of VIEWPORTS){const page=await browser.newPage({viewport:{width:vp.width,height:vp.height},reducedMotion:'reduce'});const errors=[],failedImages=[];page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,250)));page.on('requestfailed',r=>{if(/\.(?:png|jpe?g|webp|avif|gif|svg)(?:[?#]|$)/i.test(r.url()))failedImages.push(r.url().slice(0,250));});let navigationError='';const route='/'+relative.split('/').map(encodeURIComponent).join('/');try{await page.goto('http://127.0.0.1:'+port+route,{waitUntil:'networkidle',timeout:12000});}catch(e){navigationError=String(e.message||e).slice(0,250);try{await page.goto('http://127.0.0.1:'+port+route,{waitUntil:'domcontentloaded',timeout:6000});}catch{}}
      const metrics=await page.evaluate(()=>({title:document.title,lang:document.documentElement.lang||'',viewportWidth:innerWidth,documentWidth:document.documentElement.scrollWidth,horizontalOverflow:document.documentElement.scrollWidth>innerWidth+2||(document.body&&document.body.scrollWidth>innerWidth+2),imageCount:document.images.length,brokenImages:Array.from(document.images).filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.currentSrc||i.src).slice(0,15),interactiveControls:document.querySelectorAll('a[href],button,input,select,textarea,[role="button"],[tabindex]').length,imagesMissingAlt:Array.from(document.images).filter(i=>!i.hasAttribute('alt')).length,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches}));
      const screenshot=relative.replace(/[^a-z0-9_-]+/gi,'_')+'__'+vp.name+'.png';await page.screenshot({path:path.join(output,screenshot),fullPage:true,animations:'disabled',timeout:12000}).catch(()=>{});checks.push({page:relative,viewport:vp.name,metrics,pageErrors:errors,failedImageRequests:failedImages,navigationError,screenshot});await page.close();}}}
    finally{await new Promise(resolve=>server.close(resolve));}
    const failures=checks.filter(c=>c.navigationError||c.metrics?.horizontalOverflow||c.metrics?.brokenImages?.length||c.pageErrors.length||c.failedImageRequests.length);results.push({site:site.name,status:failures.length?'needs-attention':html.length>12?'pass-with-limited-route-sample':'browser-checked-no-obvious-blockers',htmlRoutes:html.length,testedRoutes:Math.min(html.length,12),routeSampleLimited:html.length>12,viewportWidths:VIEWPORTS.map(v=>v.width),failingChecks:failures.length,pages:checks});
  }}finally{await browser.close();}
  const report={schemaVersion:1,generatedAt:new Date().toISOString(),status:results.some(r=>r.status==='needs-attention')?'needs-attention':'browser-evaluated',sitesFound:sites.length,evaluatedSites:results.length,viewportWidths:VIEWPORTS.map(v=>v.width),results,note:'Screenshots and browser checks do not certify subjective premium design or live payment, booking, messaging, or production data integrations.'};
  await fs.writeFile(path.join(OUT,'browser-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,sitesFound:report.sitesFound,evaluatedSites:report.evaluatedSites,report:path.join(OUT,'browser-report.json')},null,2));if(results.some(r=>r.status==='needs-attention'))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error('Generated-site browser evaluation failed:',e);process.exitCode=1;});
