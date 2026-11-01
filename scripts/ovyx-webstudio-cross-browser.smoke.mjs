import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';

const browsers = [chromium, firefox, webkit];
const widths = [320,360,375,390,430,540,640,768,820,1024,1280,1440,1920];
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OVYX generated-site cross-browser fixture</title><style>
*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,sans-serif}header,main{width:min(100% - 32px,72rem);margin:auto}header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0}nav{display:flex;gap:12px;flex-wrap:wrap}main{padding:24px 0}.layout{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.panel{min-width:0;padding:20px;border:1px solid #aaa;border-radius:12px}img{display:block;max-width:100%;height:auto}button,a,input{font:inherit}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #2563eb;outline-offset:3px}@media(max-width:700px){.layout{grid-template-columns:1fr}header{align-items:flex-start;flex-direction:column}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
</style></head><body><header><strong>OVYX fixture</strong><nav aria-label="Primary"><a href="#main">Main</a><a href="#details">Details</a></nav></header><main id="main"><h1>Responsive experience</h1><div class="layout"><section class="panel"><h2>Primary</h2><button id="toggle" type="button" aria-expanded="false">Show details</button><p id="details" hidden>Details are available.</p></section><section class="panel"><h2>Secondary</h2><label for="email">Email</label><input id="email" type="email"></section><section class="panel"><h2>Media</h2><img alt="Decorative test asset" width="640" height="360" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360'%3E%3Crect width='640' height='360' fill='%23ddd'/%3E%3C/svg%3E"></section></div></main><script>document.getElementById('toggle').addEventListener('click',()=>{const p=document.getElementById('details');p.hidden=!p.hidden;document.getElementById('toggle').setAttribute('aria-expanded',String(!p.hidden))})</script></body></html>`;
const failures=[];
for(const engine of browsers){
 let browser;
 try{
  browser=await engine.launch({headless:true});
  const page=await browser.newPage();
  page.on('pageerror',error=>failures.push(engine.name()+' page error: '+error.message));
  await page.setContent(html,{waitUntil:'load'});
  for(const width of widths){
   await page.setViewportSize({width,height:900});
   const result=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,main:!!document.querySelector('main'),heading:!!document.querySelector('h1')}));
   assert.ok(result.main&&result.heading,engine.name()+' missing semantic page structure');
   assert.ok(result.scroll<=result.client+1,engine.name()+' horizontal overflow at '+width+'px: '+result.scroll+' > '+result.client);
  }
  await page.getByRole('button',{name:'Show details'}).click();
  await page.getByText('Details are available.').waitFor({state:'visible'});
  assert.equal(await page.getByRole('button',{name:'Show details'}).getAttribute('aria-expanded'),'true');
  await page.keyboard.press('Tab');
  const focus=await page.evaluate(()=>!!document.activeElement);
  assert.equal(focus,true);
  console.log(engine.name()+' passed '+widths.length+' viewport smoke checks and interaction/keyboard probes.');
 }catch(error){failures.push(engine.name()+': '+error.message);}
 finally{if(browser)await browser.close();}
}
assert.deepEqual(failures,[],'Cross-browser generated-site smoke failures');
console.log('OVYX generated-site Chromium, Firefox and WebKit smoke tests passed.');
