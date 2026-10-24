import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const appShell=fs.readFileSync(path.join(root,'index.html'),'utf8');
function extractBetween(source,startText,endText,label){
  const start=source.indexOf(startText);
  const end=source.indexOf(endText,start+startText.length);
  assert.ok(start>=0&&end>start,'Could not extract '+label+' from the production app shell.');
  return source.slice(start,end);
}

// Dispatch an actual touchStart/touchMove/touchEnd sequence through Chromium's
// touch input path. synthesizeScrollGesture emitted pointermove but no touchmove
// in headless CI, so it could not reliably prove the production touch-scroll path.
async function dispatchFingerSwipe(session,page,{x,startY,endY}){
  const distance=endY-startY;
  const steps=Math.max(12,Math.min(24,Math.ceil(Math.abs(distance)/18)));
  const point=(y)=>({x:Math.round(x),y:Math.round(y),id:1,force:1});
  await session.send('Input.dispatchTouchEvent',{
    type:'touchStart',
    touchPoints:[point(startY)]
  });
  try{
    for(let step=1;step<=steps;step++){
      const y=startY+(distance*step/steps);
      await session.send('Input.dispatchTouchEvent',{
        type:'touchMove',
        touchPoints:[point(y)]
      });
      // Yield to Chromium's input/scroll pipeline between moves instead of
      // injecting every point in one compositor task.
      await page.waitForTimeout(12);
    }
  }finally{
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
}
const editorMethods=extractBetween(appShell,'async loadMonacoForCode(){','saveCodeFile(file){','production Code Workspace editor methods');
const syncProjectMethod=extractBetween(appShell,'syncGraphToProject(clearDirty=true){','pageToHtml(page){','production project/source synchronizer');
const updateCodeMethod=extractBetween(appShell,'updateCodeFromEditor(file,content){','codeLanguage(file){','production editor change handler');
const previewMethods=extractBetween(appShell,'buildPreviewDocument(page){','runtimeUrl(){','production Desktop preview renderer');
const mobileScrollStyleMatch=appShell.match(/<style id="ovyx-mobile-scroll-contract-v3">([\s\S]*?)<\/style>/i);
const mobileScrollRecoveryMatch=appShell.match(/<script id="ovyx-mobile-scroll-recovery-v1">([\s\S]*?)<\/script>/i);
assert.ok(mobileScrollStyleMatch,'The global mobile scroll contract must be present.');
assert.match(mobileScrollStyleMatch[1],/overflow-y:auto!important/i,'The routed viewport must accept vertical scrolling.');
assert.match(mobileScrollStyleMatch[1],/touch-action:pan-y pinch-zoom!important/i,'The routed viewport must permit native touch scrolling.');
assert.doesNotMatch(mobileScrollStyleMatch[1],/body\.ovyx-v88-dock-home\s+#app-container/,'Mobile scrolling must not be limited to the Home dock state.');
assert.ok(mobileScrollRecoveryMatch,'The mobile stale-scroll-lock recovery must be present.');
assert.doesNotThrow(()=>new Function(mobileScrollRecoveryMatch[1]),'The mobile scroll recovery runtime must parse as JavaScript.');
assert.match(editorMethods,/selectedProjectPage=true/,'Opening an HTML file must select the linked project page.');
assert.match(editorMethods,/this\.graph\.entry=safe/,'HTML file selection must set the source used by Desktop preview.');

const cssMatch=appShell.match(/<style id="ovyx-code-workspace-interaction-preview-parity">([\s\S]*?)<\/style>/i);
assert.ok(cssMatch,'The production Code Workspace interaction styles must be present.');
const recoveryMatch=appShell.match(/<script id="ovyx-code-dashboard-route-recovery-v1">([\s\S]*?)<\/script>/i);
assert.ok(recoveryMatch,'The production dashboard route-recovery runtime must be present.');
const hitTestingMatch=appShell.match(/<style id="ovyx-code-workspace-hit-testing-v2">([\s\S]*?)<\/style>/i);
const editorRecoveryMatch=appShell.match(/<script id="ovyx-code-workspace-editor-recovery-v2">([\s\S]*?)<\/script>/i);
const dockSurfaceMatch=appShell.match(/<style id="ovyx-mobile-dock-opaque-background-v2">([\s\S]*?)<\/style>/i);
assert.ok(dockSurfaceMatch,'The production mobile Home dock must define an explicit surface behind its navigation labels.');
assert.match(dockSurfaceMatch[1],/background:\s*#070809!important/i,'The mobile Home dock must use the intended opaque dark surface.');
assert.doesNotMatch(dockSurfaceMatch[1],/background(?:-color)?\s*:\s*transparent/i,'The mobile Home dock must not allow dashboard cards to bleed through its navigation labels.');
assert.ok(hitTestingMatch,'The production Code Workspace hit-testing repair must be present.');
assert.ok(editorRecoveryMatch,'The production editor initialization recovery must be present.');
assert.match(hitTestingMatch[1],/#view-webstudio:not\(\.hidden\)\[data-ws-code-open="1"\]/i,
  'The hit-testing repair must follow the visible editor surface, not a separately toggled body class.');
assert.doesNotMatch(hitTestingMatch[1],/body\.ovyx-webstudio-active/i,
  'The repair must still apply when the Web Studio body state class is missing.');
assert.match(hitTestingMatch[1],/z-index:\s*2147483002/i,'The editor surface must sit above positioned workspace layers.');
assert.doesNotThrow(()=>new Function(editorRecoveryMatch[1]),'The production editor recovery runtime must parse as JavaScript.');

assert.doesNotThrow(()=>new Function('return ({'+editorMethods+' saveCodeFile(file){return true;}});'),
  'The extracted production code-editor methods must parse as JavaScript.');
assert.doesNotThrow(()=>new Function(recoveryMatch[1]),
  'The extracted production dashboard route-recovery runtime must parse as JavaScript.');

const browser=await chromium.launch({headless:true});
try{
  // Desktop regression: hold the Monaco loader request open. Production code must
  // time out into a genuinely editable, full-size textarea instead of a dead pane.
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#050607;color:#f8fafc}
    #view-webstudio{position:fixed;inset:0;display:block}.ovyx-ws-code-root{height:100%;display:flex;flex-direction:column}
    .ovyx-code-panel-main{display:flex;flex:1 1 auto;min-width:0;min-height:0;flex-direction:column}
    #ws-code-workspace-host{height:100%;min-width:0;min-height:0}#ovyx-monaco-host{flex:1;min-height:0}
    #ovyx-fallback-editor{display:none;flex:1;min-height:0;background:#050607;color:#e7e7e7;padding:16px;border:0;outline:0;font:13px/1.6 monospace}
  </style></head><body class="ovyx-webstudio-active">
    <section id="view-webstudio" data-ws-code-open="1"><div id="ws-code-workspace-host"><div class="ovyx-ws-code-root">
      <div style="height:48px;flex:0 0 48px">OVYX CODE</div><div class="ovyx-code-panel-main">
      <div id="ovyx-code-toolbar">Save · Find · Replace</div><div id="ovyx-code-tabs"></div>
      <div id="ovyx-monaco-host"></div><textarea id="ovyx-fallback-editor" spellcheck="false"></textarea>
      </div><div id="ovyx-code-tree"></div><span id="ovyx-code-language"></span><span id="ovyx-code-file-state"></span>
    </div></div></section>
    <iframe id="ws-canvas-iframe" style="display:none"></iframe><div id="ws-preview-empty" class="hidden"></div><div id="ws-preview-url"></div>
  </body></html>`);
  await page.addStyleTag({content:cssMatch[1]});
  await page.addScriptTag({content:`
    window.__OVYX_EARLY_VIEWPORT__='desktop';
    window.fixtureEditor={
      graph:{version:1,entry:'src/pages/Home.html',files:{
        'src/pages/Home.html':{type:'text/html',content:'<!doctype html><html><head><title>Home</title></head><body>Home baseline</body></html>'},
        'src/pages/Pricing.html':{type:'text/html',content:'<!doctype html><html><head><title>Pricing</title></head><body>Pricing baseline</body></html>'}
      }},
      graphKeyPrefix:'ovyx.ws.graph.v2.',activePageIndex:0,previewUpdateTimer:null,
      monacoReady:false,monaco:null,monacoModels:new Map(),openCodeTabs:[],activeCodeFile:'',
      entryFile(){return this.graph.entry},
      getActivePage(){return window.KernelState?.activeProject?.pages?.[this.activePageIndex]||window.KernelState?.activeProject?.pages?.[0]||null},
      ensureProjectGraph(){return this.graph},
      escapeHtml(value){return String(value).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))},
      escapeAttr(value){return this.escapeHtml(value)},
      escapeHtmlForStyle(value){return String(value??'')},
      escapeScript(value){return String(value??'')},
      escapeScriptAttr(value){return String(value??'')},
      pageToHtml(page){return '<!doctype html><html><head><title>'+String(page?.name||'OVYX')+'</title></head><body></body></html>'},
      codeLanguage(){return 'html'},
      renderCodeTree(){},
      ${syncProjectMethod}
      ${editorMethods}
      saveCodeFile(file){return true;},
      ${updateCodeMethod}
      ${previewMethods}
      runtimeUrl(){return 'fixture://preview'},
    };
  `});
  await page.route('**/cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.55.1/min/vs/loader.min.js',async()=>new Promise(()=>{}));
  const started=Date.now();
  const outcome=await page.evaluate(async()=>await window.fixtureEditor.loadMonacoForCode());
  assert.equal(outcome,false,'A stalled Monaco load must resolve to the editable fallback instead of waiting forever.');
  assert.ok(Date.now()-started<6500,'The fallback should become available within a bounded timeout.');
  // setContent() creates an opaque origin in Chromium. Supply a scoped in-memory
  // storage shim so the real production editor methods can be exercised there.
  await page.evaluate(()=>{
    const memoryStorage=()=>{const values=new Map();return {get length(){return values.size},key(index){return Array.from(values.keys())[index]??null},getItem(key){const k=String(key);return values.has(k)?values.get(k):null},setItem(key,value){values.set(String(key),String(value))},removeItem(key){values.delete(String(key))},clear(){values.clear()}}};
    for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{configurable:true,value:memoryStorage()});
  });
  await page.evaluate(()=>{
    const home=window.fixtureEditor.graph.files['src/pages/Home.html'].content;
    const pricing=window.fixtureEditor.graph.files['src/pages/Pricing.html'].content;
    window.KernelState={activeView:'workspace',activeProject:{
      id:'desktop-preview-sync-fixture',name:'Desktop Preview Sync Fixture',
      pages:[
        {name:'Home',__ovyxFile:'src/pages/Home.html',html:'<!doctype html><html><body>STALE Home projection</body></html>',source:'<!doctype html><html><body>STALE Home projection</body></html>',renderedHtml:'<!doctype html><html><body>STALE Home projection</body></html>'},
        {name:'Pricing',__ovyxFile:'src/pages/Pricing.html',html:'<!doctype html><html><body>STALE Pricing projection</body></html>',source:'<!doctype html><html><body>STALE Pricing projection</body></html>',renderedHtml:'<!doctype html><html><body>STALE Pricing projection</body></html>'}
      ],
      ovyxGraph:window.fixtureEditor.graph
    }};
  });
  await page.evaluate(()=>window.fixtureEditor.openCodeFile('src/pages/Home.html'));
  const editor=page.locator('#ovyx-fallback-editor');
  await editor.waitFor({state:'visible'});
  const bounds=await editor.boundingBox();
  assert.ok(bounds&&bounds.width>900&&bounds.height>500,'The fallback editor must occupy the full available desktop editing area.');
  await page.mouse.click(bounds.x+bounds.width*.65,bounds.y+bounds.height*.5);
  await page.keyboard.type('<main>Desktop editing works</main>');
  const saved=await page.evaluate(()=>window.fixtureEditor.graph.files['src/pages/Home.html'].content);
  assert.match(saved,/Desktop editing works/,'Typing in the middle of the editor must update the active project source.');
  await page.waitForTimeout(450);
  await page.evaluate(()=>{
    window.fixtureEditor.openCodeFile('src/pages/Pricing.html');
  });
  await page.waitForFunction(()=>document.getElementById('ws-canvas-iframe')?.contentDocument?.body?.textContent?.includes('Pricing baseline'),null,{timeout:6000});
  const pageSelection=await page.evaluate(()=>({
    entry:window.fixtureEditor.graph.entry,
    activePageIndex:window.fixtureEditor.activePageIndex,
    activePageName:window.KernelState.activeProject.pages[window.fixtureEditor.activePageIndex]?.name,
    projectPageHtml:window.KernelState.activeProject.pages[1]?.html||'',
    previewText:document.getElementById('ws-canvas-iframe')?.contentDocument?.body?.textContent||''
  }));
  assert.equal(pageSelection.entry,'src/pages/Pricing.html','Opening another HTML source must move Desktop preview to that page.');
  assert.equal(pageSelection.activePageIndex,1,'The selected Code Workspace HTML file must select the matching project page.');
  assert.equal(pageSelection.activePageName,'Pricing','Project page selection must follow the HTML file selected in Code Workspace.');
  assert.match(pageSelection.projectPageHtml,/Pricing baseline/,'Opening a source file must refresh the stored project page from the shared graph immediately.');
  assert.doesNotMatch(pageSelection.projectPageHtml,/STALE Pricing projection/,'Desktop preview must not keep a stale page copy when Code Workspace changes files.');
  const pricingSource='<!doctype html><html><head><title>Pricing Updated</title></head><body><h1>Desktop preview shares code</h1></body></html>';
  await page.evaluate(source=>window.fixtureEditor.updateCodeFromEditor('src/pages/Pricing.html',source),pricingSource);
  await page.waitForFunction(()=>document.getElementById('ws-canvas-iframe')?.contentDocument?.body?.textContent?.includes('Desktop preview shares code'),null,{timeout:6000});
  const linkedState=await page.evaluate(()=>({
    graph:window.fixtureEditor.graph.files['src/pages/Pricing.html'].content,
    entry:window.fixtureEditor.graph.entry,
    projectGraph:window.KernelState.activeProject.ovyxGraph?.files?.['src/pages/Pricing.html']?.content,
    projectPage:window.KernelState.activeProject.pages[1]?.html,
    preview:document.getElementById('ws-canvas-iframe')?.contentDocument?.body?.textContent||''
  }));
  assert.match(linkedState.graph,/Desktop preview shares code/,'The selected source file must retain the edited HTML.');
  assert.match(linkedState.projectGraph,/Desktop preview shares code/,'The active project graph must receive the edited source.');
  assert.match(linkedState.projectPage,/Desktop preview shares code/,'The matching project page must receive the edited source.');
  assert.match(linkedState.preview,/Desktop preview shares code/,'The actual Desktop preview document must render the edited source.');
  assert.deepEqual(pageErrors,[],'The fallback editor and live preview sync must not throw browser runtime errors.');
  await page.close();

  // Production overlay hit-testing regression: use the real editor-layer CSS and
  // put a competing positioned layer over the workspace. The editor must win hit
  // testing and remain editable even if Monaco initialization throws.
  const surfacePage=await browser.newPage({viewport:{width:1280,height:800}});
  const surfaceErrors=[];
  surfacePage.on('pageerror',error=>surfaceErrors.push(error.message));
  await surfacePage.setContent('<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#050607;color:#f8fafc}body.ovyx-webstudio-active{overflow:hidden}#view-webstudio{position:relative;width:100%;height:100%;isolation:isolate}#ws-workspace{position:relative;isolation:isolate;width:100%;height:100%;overflow:hidden}.ovyx-ws-code-workspace{position:absolute;inset:0;z-index:40;display:none;grid-template-rows:28px minmax(0,1fr);overflow:hidden;background:#050607}.ovyx-ws-code-workspace[hidden]{display:none!important}.ovyx-ws-code-workspace-head{height:28px}.ovyx-ws-code-root{display:flex;flex-direction:column;height:100%}.ovyx-code-panel-main{position:relative;display:flex;flex-direction:column;flex:1;min-width:0;min-height:0}.ovyx-code-tree{width:160px}.fake-competing-layer{position:absolute;inset:0;z-index:2147483001;background:rgba(255,0,0,.01)}#ovyx-monaco-host{flex:1;min-height:0}#ovyx-fallback-editor{display:none;flex:1;min-height:0;background:#050607;color:#e7e7e7;padding:16px;border:0;outline:0;font:13px/1.6 monospace;resize:none}</style></head><body><section id="view-webstudio" data-ws-code-open="1"><main id="ws-workspace" class="ovyx-ws-workspace"><div id="ws-chat-pane" aria-hidden="true"></div><div id="ws-inline-preview" aria-hidden="true"></div><button id="ws-desktop-split-toggle" class="ovyx-ws-split-toggle" style="position:absolute;inset:0;z-index:2000">split</button><section id="ws-code-workspace" class="ovyx-ws-code-workspace"><div class="ovyx-ws-code-workspace-head">OVYX CODE</div><div id="ws-code-workspace-host"><div class="ovyx-ws-code-root"><aside class="ovyx-code-tree">files</aside><main class="ovyx-code-panel-main"><div id="ovyx-monaco-host"></div><textarea id="ovyx-fallback-editor" spellcheck="false"></textarea></main></div></div></section><div class="fake-competing-layer" id="high-layer"></div></main></section></body></html>');
  assert.equal(await surfacePage.evaluate(()=>document.body.classList.contains('ovyx-webstudio-active')),false,
    'The overlay regression must reproduce an editor surface whose body active-state class is absent.');
  await surfacePage.addStyleTag({content:cssMatch[1]});
  await surfacePage.addStyleTag({content:hitTestingMatch[1]});
  await surfacePage.evaluate(()=>{
    window.KernelState={activeView:'webstudio'};
    window.WebStudio={
      activeCodeFile:'src/pages/Home.html',
      graph:{files:{'src/pages/Home.html':{content:'baseline',dirty:false}}},
      ensureProjectGraph(){return this.graph},
      entryFile(){return 'src/pages/Home.html'},
      updateCodeFromEditor(file,content){this.graph.files[file].content=String(content);this.graph.files[file].dirty=true},
      openCodeFile(){throw new Error('simulated Monaco editor creation failure')},
      async mountFocusedCodeWorkspace(){throw new Error('simulated editor mount failure')}
    };
    document.getElementById('ws-code-workspace').hidden=false;
    document.getElementById('ws-code-workspace').setAttribute('aria-hidden','false');
  });
  await surfacePage.addScriptTag({content:editorRecoveryMatch[1]});
  await surfacePage.evaluate(()=>window.WebStudio.openCodeFile('src/pages/Home.html'));
  const surfaceEditor=surfacePage.locator('#ovyx-fallback-editor');
  await surfaceEditor.waitFor({state:'visible'});
  const surfaceBounds=await surfaceEditor.boundingBox();
  assert.ok(surfaceBounds&&surfaceBounds.width>900&&surfaceBounds.height>500,
    'The real overlay layout must give the editable surface the full workspace area.');
  const hitTest=await surfacePage.evaluate(({x,y})=>{
    const node=document.elementFromPoint(x,y);
    return {id:node?.id||'',inside:!!node?.closest?.('#ovyx-fallback-editor')};
  },{x:surfaceBounds.x+surfaceBounds.width*.7,y:surfaceBounds.y+surfaceBounds.height*.6});
  assert.equal(hitTest.inside,true,
    'The editor must receive pointer hits across its full area, above a competing workspace layer.');
  await surfacePage.mouse.click(surfaceBounds.x+surfaceBounds.width*.7,surfaceBounds.y+surfaceBounds.height*.6);
  await surfacePage.keyboard.type('Edit survives overlay');
  assert.match(await surfacePage.evaluate(()=>window.WebStudio.graph.files['src/pages/Home.html'].content),
    /Edit survives overlay/,'Typing after an editor initialization failure must still update project source.');
  assert.deepEqual(surfaceErrors,[],'Editor recovery must not create uncaught browser errors.');
  await surfacePage.close();

  // Dashboard regression: mimic the mobile drawer and scroll lock being left open
  // after selecting Home. The real route-recovery code must release the hit blocker.
  const homePage=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const homeErrors=[];
  homePage.on('pageerror',error=>homeErrors.push(error.message));
  await homePage.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%}body{overflow:hidden}
    #view-router-viewport{position:relative;width:100vw;height:100vh}#view-home{height:100%;padding:40px}
    #mobile-drawer{position:fixed;inset:0;width:100vw;height:100vh;background:#111;z-index:2147483001}
    #mobile-drawer-backdrop{position:fixed;inset:0;background:#0008;z-index:2147483000}
    #dashboard-action{position:relative;z-index:1;width:180px;height:60px}
    .hidden{display:none!important}
  </style></head><body class="ovyx-drawer-open">
    <div id="view-router-viewport"><section id="view-home" class="hidden" aria-hidden="true" inert style="pointer-events:none"><button id="dashboard-action" onclick="window.dashboardClicks=(window.dashboardClicks||0)+1">Dashboard action</button></section><section id="view-projects" aria-hidden="false"></section><section id="view-webstudio" class="hidden" aria-hidden="true"><section id="ws-code-workspace" hidden aria-hidden="true"></section><div id="ws-mobile-preview" hidden aria-hidden="true"></div><div id="ws-preview-menu" hidden></div><div id="ws-mode-menu" hidden></div></section></div>
    <aside id="mobile-drawer" class="open" aria-hidden="false"></aside><div id="mobile-drawer-backdrop" aria-hidden="false"></div>
  </body></html>`);
  await homePage.evaluate(()=>{
    window.KernelState={activeView:'projects'};
    window.MobileDrawer={close(){}};
    window.OVYXMobileShellAuthority={close(){},sync(){}};
    window.Router={go(view){
      window.KernelState.activeView=String(view||'home');
      /* Simulate a navigation wrapper that updates the route but leaves the old view DOM state behind. */
      window.dispatchEvent(new CustomEvent('ovyx:view-changed',{detail:{view:window.KernelState.activeView}}));
      return true;
    }};
    document.documentElement.style.overflow='hidden';
    document.body.style.overflow='hidden';
  });
  await homePage.addScriptTag({content:recoveryMatch[1]});
  await homePage.evaluate(()=>window.Router.go('home'));
  await homePage.waitForFunction(()=>document.getElementById('view-home')?.classList.contains('hidden')===false
    &&document.getElementById('view-home')?.getAttribute('aria-hidden')==='false'
    &&document.getElementById('view-home')?.inert===false
    &&getComputedStyle(document.getElementById('view-home')).pointerEvents!=='none'
    &&document.getElementById('view-projects')?.classList.contains('hidden')===true
    &&document.getElementById('view-projects')?.getAttribute('aria-hidden')==='true'
    &&document.getElementById('mobile-drawer')?.getAttribute('aria-hidden')==='true'
    &&document.getElementById('mobile-drawer-backdrop')?.hidden===true
    &&getComputedStyle(document.getElementById('mobile-drawer-backdrop')).pointerEvents==='none'
    &&document.documentElement.style.overflow===''&&document.body.style.overflow==='');
  await homePage.locator('#dashboard-action').click();
  assert.equal(await homePage.evaluate(()=>window.dashboardClicks),1,
    'Dashboard controls must receive clicks after navigating Home from a previously open drawer.');
  assert.deepEqual(homeErrors,[],'Returning to Home must not throw browser runtime errors.');
  await homePage.close();

  // Real production-shell regression: the fixed mobile dock must remain opaque
  // while the Home dashboard scrolls behind it, so card text cannot bleed into
  // the Home / Build / New / Code / More navigation labels.
  const dockPage=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  try{
    const response=await dockPage.goto('http://127.0.0.1:8789/',{waitUntil:'domcontentloaded',timeout:30000});
    assert.ok(response&&response.ok(),'The real OVYX app shell must load for the mobile dock regression.');
    await dockPage.waitForFunction(()=>!!document.querySelector('.v59-dashboard-shell')&&!!document.getElementById('ovyx-v52-bottom-bar'),
      null,{timeout:30000});
    /* The shell may paint before the full-page boot curtain is removed. Do not
       mistake the intentionally topmost startup layer for a scroll blocker. */
    await dockPage.waitForFunction(()=>!document.getElementById('ovyx-first-paint-curtain')
      &&!document.documentElement.hasAttribute('data-ovyx-stabilizing'),
      null,{timeout:5000});
    await dockPage.evaluate(()=>window.OVYXMobileDockAuthority?.sync?.());
    await dockPage.waitForFunction(()=>document.body.classList.contains('ovyx-v88-dock-home')
      &&getComputedStyle(document.getElementById('ovyx-v52-bottom-bar')).display!=='none',
      null,{timeout:30000});
    const dockState=await dockPage.evaluate(()=>{
      const dock=document.getElementById('ovyx-v52-bottom-bar');
      const style=getComputedStyle(dock);
      const shell=document.querySelector('.v59-dashboard-shell');
      return {display:style.display,backgroundColor:style.backgroundColor,backgroundImage:style.backgroundImage,
        height:parseFloat(style.height),dashboardBottomPadding:parseFloat(getComputedStyle(shell).paddingBottom)};
    });
    assert.equal(dockState.display,'grid','The mobile Home dock must remain visible on the Home dashboard.');
    assert.equal(dockState.backgroundColor,'rgb(7, 8, 9)',
      'The visible mobile dock must use its opaque dark background instead of letting the dashboard show through.');
    assert.equal(dockState.backgroundImage,'none','The dock surface must not reintroduce a transparent background layer.');
    assert.equal(dockState.height,64,'The dock surface fix must preserve the existing mobile navigation height.');
    assert.ok(dockState.dashboardBottomPadding>=100,
      'The Home dashboard must preserve enough scroll runway for content to clear the fixed dock.');

    // The visible dock must not trap the final dashboard card underneath it.
    const dockScrollState=await dockPage.evaluate(async()=>{
      const viewport=document.getElementById('view-router-viewport');
      const home=document.getElementById('view-home');
      const dock=document.getElementById('ovyx-v52-bottom-bar');
      const cards=Array.from(home?.querySelectorAll('.v59-tool-card')||[]);
      viewport.scrollTop=viewport.scrollHeight;
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const last=cards[cards.length-1];
      const rect=last?.getBoundingClientRect();
      const dockRect=dock?.getBoundingClientRect();
      return {
        viewportScrollHeight:viewport.scrollHeight,
        viewportClientHeight:viewport.clientHeight,
        viewportScrollTop:viewport.scrollTop,
        lastCardCount:cards.length,
        lastCardBottom:rect?.bottom??null,
        dockTop:dockRect?.top??null,
        shellOverflow:getComputedStyle(home).overflow
      };
    });
    assert.ok(dockScrollState.lastCardCount>0,'The production Home dashboard must render its tool cards.');
    assert.ok(dockScrollState.viewportScrollHeight>dockScrollState.viewportClientHeight,
      'The Home viewport must be vertically scrollable on mobile.');
    assert.ok(dockScrollState.viewportScrollTop>0,
      'The Home viewport must reach its lower content instead of being held at the initial scroll position.');
    assert.ok(dockScrollState.lastCardBottom!==null&&dockScrollState.dockTop!==null
      &&dockScrollState.lastCardBottom<=dockScrollState.dockTop-8,
      'At the end of mobile Home scrolling, the final tool card must sit fully above the fixed dock.');
    assert.equal(dockScrollState.shellOverflow,'visible',
      'The mobile Home section must not clip its own scrollable content.');

    // A scrollTop assignment above only proves programmatic scrolling. Reproduce
    // the user's finger gesture against the real mobile Home surface as well.
    await dockPage.evaluate(()=>{document.getElementById('view-router-viewport').scrollTop=0;});
    const gestureGeometry=await dockPage.evaluate(()=>{
      const viewport=document.getElementById('view-router-viewport');
      const dock=document.getElementById('ovyx-v52-bottom-bar');
      const vr=viewport.getBoundingClientRect(),dr=dock.getBoundingClientRect();
      /* Start in the narrow empty gutter, not inside the prompt textarea or a
         scrollable control that is allowed to consume its own touch gesture. */
      const x=Math.floor(vr.left+Math.min(6,vr.width*0.02));
      const startY=Math.floor(Math.min(vr.bottom-110,dr.top-90));
      return {
        x,viewportTop:vr.top,viewportBottom:vr.bottom,viewportLeft:vr.left,viewportWidth:vr.width,
        dockTop:dr.top,startY,endY:Math.floor(Math.max(vr.top+90,startY-300)),
        hit:(document.elementFromPoint(x,startY)?.outerHTML||'').slice(0,220),
        viewportTouch:getComputedStyle(viewport).touchAction,
        viewportOverflow:getComputedStyle(viewport).overflowY
      };
    });
    assert.ok(gestureGeometry.endY<gestureGeometry.startY,
      'The mobile viewport must expose enough unblocked space to perform an upward scroll gesture.');
    await dockPage.evaluate(()=>{
      const probe=[];
      window.__ovyxTouchProbe=probe;
      const record=e=>{
        if(probe.length<120)probe.push({type:e.type,target:(e.target?.id||e.target?.className||e.target?.tagName||'').toString().slice(0,100),
          cancelable:e.cancelable,defaultPrevented:e.defaultPrevented,trust:e.isTrusted});
      };
      ['touchstart','touchmove','touchend','pointerdown','pointermove','pointerup','scroll'].forEach(type=>{
        document.addEventListener(type,record,{capture:true,passive:true});
        document.addEventListener(type,record,{capture:false,passive:true});
      });
    });
    const touchSession=await dockPage.context().newCDPSession(dockPage);
    try{
      await dispatchFingerSwipe(touchSession,dockPage,{
        x:gestureGeometry.x,startY:gestureGeometry.startY,endY:gestureGeometry.endY
      });
      await dockPage.waitForFunction(()=>document.getElementById('view-router-viewport')?.scrollTop>0,
        null,{timeout:3500}).catch(async error=>{
          const diag=await dockPage.evaluate(({x,y})=>{
            const viewport=document.getElementById('view-router-viewport'),hit=document.elementFromPoint(x,y);
            const describe=el=>{
              if(!el)return null;
              const cs=getComputedStyle(el),r=el.getBoundingClientRect();
              return {tag:el.tagName,id:el.id,cls:String(el.className||'').toString().slice(0,100),
                touchAction:cs.touchAction,pointerEvents:cs.pointerEvents,overflowY:cs.overflowY,
                position:cs.position,zIndex:cs.zIndex,box:[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)]};
            };
            const ancestors=[];for(let n=hit;n&&ancestors.length<8;n=n.parentElement)ancestors.push(describe(n));
            return {hit:describe(hit),ancestors,scroll:{top:viewport?.scrollTop,height:viewport?.scrollHeight,client:viewport?.clientHeight},
              bodyOverflow:getComputedStyle(document.body).overflow,rootOverflow:getComputedStyle(document.documentElement).overflow,
              touchEvents:window.__ovyxTouchProbe||[]};
          },{x:gestureGeometry.x,y:gestureGeometry.startY});
          throw new Error('Chromium synthesized mobile Home touch gesture did not scroll the routed viewport. '+JSON.stringify({gestureGeometry,diag,waitError:error.message}));
        });
    }finally{await touchSession.detach();}
    const gestureScroll=await dockPage.evaluate(()=>({
      scrollTop:document.getElementById('view-router-viewport').scrollTop,
      scrollHeight:document.getElementById('view-router-viewport').scrollHeight,
      clientHeight:document.getElementById('view-router-viewport').clientHeight
    }));
    assert.ok(gestureScroll.scrollTop>0,
      'An upward finger swipe on mobile Home must scroll the dashboard down; programmatic scrollTop alone is not sufficient.');

    // The scroll contract must also work after leaving Home; this catches route
    // layouts and stale document locks that the Home-only regression missed.
    await dockPage.evaluate(()=>{
      const projects=document.getElementById('view-projects');
      if(!projects)throw new Error('The production Projects route is missing.');
      window.Router?.go?.('projects');
      const longContent=document.createElement('div');
      longContent.id='ovyx-scroll-contract-projects-fixture';
      longContent.style.cssText='height:1500px;width:100%;pointer-events:none;background:linear-gradient(#050607,#101010)';
      projects.appendChild(longContent);
    });
    await dockPage.waitForFunction(()=>{
      const viewport=document.getElementById('view-router-viewport');
      const projects=document.getElementById('view-projects');
      return viewport&&projects&&!projects.classList.contains('hidden')&&projects.getAttribute('aria-hidden')==='false'
        &&viewport.scrollHeight>viewport.clientHeight;
    },null,{timeout:8000});
    await dockPage.evaluate(()=>{document.getElementById('view-router-viewport').scrollTop=0;});
    const projectGesture=await dockPage.evaluate(()=>{
      const viewport=document.getElementById('view-router-viewport');
      const rect=viewport.getBoundingClientRect();
      return {x:Math.floor(rect.left+Math.min(6,rect.width*.02)),y:Math.floor(Math.min(rect.bottom-120,rect.top+rect.height*.72))};
    });
    const projectTouch=await dockPage.context().newCDPSession(dockPage);
    try{
      await dispatchFingerSwipe(projectTouch,dockPage,{
        x:projectGesture.x,startY:projectGesture.y,endY:Math.max(gestureGeometry.viewportTop+90,projectGesture.y-300)
      });
      await dockPage.waitForFunction(()=>document.getElementById('view-router-viewport')?.scrollTop>0,
        null,{timeout:3500}).catch(async error=>{
          const diag=await dockPage.evaluate(({x,y})=>{
            const viewport=document.getElementById('view-router-viewport'),hit=document.elementFromPoint(x,y);
            const describe=el=>{
              if(!el)return null;
              const cs=getComputedStyle(el),r=el.getBoundingClientRect();
              return {tag:el.tagName,id:el.id,cls:String(el.className||'').toString().slice(0,100),
                touchAction:cs.touchAction,pointerEvents:cs.pointerEvents,overflowY:cs.overflowY,
                box:[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)]};
            };
            return {hit:describe(hit),route:window.KernelState?.activeView||'',
              scrollTop:viewport?.scrollTop,scrollHeight:viewport?.scrollHeight,clientHeight:viewport?.clientHeight,
              overflowY:getComputedStyle(viewport).overflowY,touchAction:getComputedStyle(viewport).touchAction};
          },{x:projectGesture.x,y:projectGesture.y});
          throw new Error('Chromium synthesized mobile Projects touch gesture did not scroll the routed viewport. '+JSON.stringify({projectGesture,diag,waitError:error.message}));
        });
    }finally{await projectTouch.detach();}
    const allRoutesScroll=await dockPage.evaluate(()=>({
      route:window.KernelState?.activeView||'',
      top:document.getElementById('view-router-viewport')?.scrollTop||0,
      overflow:getComputedStyle(document.getElementById('view-router-viewport')).overflowY,
      sectionOverflow:getComputedStyle(document.getElementById('view-projects')).overflow
    }));
    assert.ok(allRoutesScroll.top>0,'A non-Home route must respond to a real touch scroll gesture.');
    assert.equal(allRoutesScroll.overflow,'auto','The routed canvas must remain the vertical scroll owner on normal screens.');
    assert.equal(allRoutesScroll.sectionOverflow,'visible','A normal routed view must not clip its content.');
  }finally{await dockPage.close();}
  console.log('OVYX Code Workspace recovery and real mobile Home dock surface browser tests passed.');
}finally{await browser.close();}
