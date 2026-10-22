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
const editorMethods=extractBetween(appShell,'async loadMonacoForCode(){','saveCodeFile(file){','production Code Workspace editor methods');
const cssMatch=appShell.match(/<style id="ovyx-code-workspace-interaction-preview-parity">([\s\S]*?)<\/style>/i);
assert.ok(cssMatch,'The production Code Workspace interaction styles must be present.');
const recoveryMatch=appShell.match(/<script id="ovyx-code-dashboard-route-recovery-v1">([\s\S]*?)<\/script>/i);
assert.ok(recoveryMatch,'The production dashboard route-recovery runtime must be present.');
const hitTestingMatch=appShell.match(/<style id="ovyx-code-workspace-hit-testing-v2">([\s\S]*?)<\/style>/i);
const editorRecoveryMatch=appShell.match(/<script id="ovyx-code-workspace-editor-recovery-v2">([\s\S]*?)<\/script>/i);
assert.ok(hitTestingMatch,'The production Code Workspace hit-testing repair must be present.');
assert.ok(editorRecoveryMatch,'The production editor initialization recovery must be present.');
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
  </body></html>`);
  await page.addStyleTag({content:cssMatch[1]});
  await page.addScriptTag({content:`
    window.__OVYX_EARLY_VIEWPORT__='desktop';
    window.fixtureEditor={
      graph:{version:1,entry:'src/pages/Home.html',files:{'src/pages/Home.html':{type:'text/html',content:'<!doctype html><html><body>baseline</body></html>'}}},
      monacoReady:false,monaco:null,monacoModels:new Map(),openCodeTabs:[],activeCodeFile:'',
      entryFile(){return this.graph.entry},
      ensureProjectGraph(){return this.graph},
      escapeHtml(value){return String(value).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))},
      escapeAttr(value){return this.escapeHtml(value)},
      codeLanguage(){return 'html'},
      renderCodeTree(){},
      updateCodeFromEditor(file,content){this.graph.files[file].content=String(content)},
      ${editorMethods}
      saveCodeFile(file){return true;}
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
  await page.evaluate(()=>window.fixtureEditor.openCodeFile('src/pages/Home.html'));
  const editor=page.locator('#ovyx-fallback-editor');
  await editor.waitFor({state:'visible'});
  const bounds=await editor.boundingBox();
  assert.ok(bounds&&bounds.width>900&&bounds.height>500,'The fallback editor must occupy the full available desktop editing area.');
  await page.mouse.click(bounds.x+bounds.width*.65,bounds.y+bounds.height*.5);
  await page.keyboard.type('<main>Desktop editing works</main>');
  const saved=await page.evaluate(()=>window.fixtureEditor.graph.files['src/pages/Home.html'].content);
  assert.match(saved,/Desktop editing works/,'Typing in the middle of the editor must update the active project source.');
  assert.deepEqual(pageErrors,[],'The fallback editor must not throw browser runtime errors.');
  await page.close();

  // Production overlay hit-testing regression: use the real editor-layer CSS and
  // put a competing positioned layer over the workspace. The editor must win hit
  // testing and remain editable even if Monaco initialization throws.
  const surfacePage=await browser.newPage({viewport:{width:1280,height:800}});
  const surfaceErrors=[];
  surfacePage.on('pageerror',error=>surfaceErrors.push(error.message));
  await surfacePage.setContent('<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#050607;color:#f8fafc}body.ovyx-webstudio-active{overflow:hidden}#view-webstudio{position:relative;width:100%;height:100%;isolation:isolate}#ws-workspace{position:relative;isolation:isolate;width:100%;height:100%;overflow:hidden}.ovyx-ws-code-workspace{position:absolute;inset:0;z-index:40;display:none;grid-template-rows:28px minmax(0,1fr);overflow:hidden;background:#050607}.ovyx-ws-code-workspace[hidden]{display:none!important}.ovyx-ws-code-workspace-head{height:28px}.ovyx-ws-code-root{display:flex;flex-direction:column;height:100%}.ovyx-code-panel-main{position:relative;display:flex;flex-direction:column;flex:1;min-width:0;min-height:0}.ovyx-code-tree{width:160px}.fake-competing-layer{position:absolute;inset:0;z-index:2147483001;background:rgba(255,0,0,.01)}#ovyx-monaco-host{flex:1;min-height:0}#ovyx-fallback-editor{display:none;flex:1;min-height:0;background:#050607;color:#e7e7e7;padding:16px;border:0;outline:0;font:13px/1.6 monospace;resize:none}</style></head><body class="ovyx-webstudio-active"><section id="view-webstudio" data-ws-code-open="1"><main id="ws-workspace" class="ovyx-ws-workspace"><div id="ws-chat-pane" aria-hidden="true"></div><div id="ws-inline-preview" aria-hidden="true"></div><button id="ws-desktop-split-toggle" class="ovyx-ws-split-toggle" style="position:absolute;inset:0;z-index:2000">split</button><section id="ws-code-workspace" class="ovyx-ws-code-workspace"><div class="ovyx-ws-code-workspace-head">OVYX CODE</div><div id="ws-code-workspace-host"><div class="ovyx-ws-code-root"><aside class="ovyx-code-tree">files</aside><main class="ovyx-code-panel-main"><div id="ovyx-monaco-host"></div><textarea id="ovyx-fallback-editor" spellcheck="false"></textarea></main></div></div></section><div class="fake-competing-layer" id="high-layer"></div></main></section></body></html>');
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
    <div id="view-router-viewport"><section id="view-home" aria-hidden="false"><button id="dashboard-action" onclick="window.dashboardClicks=(window.dashboardClicks||0)+1">Dashboard action</button></section><section id="view-projects" class="hidden" aria-hidden="true"></section><section id="view-webstudio" class="hidden" aria-hidden="true"><section id="ws-code-workspace" hidden aria-hidden="true"></section><div id="ws-mobile-preview" hidden aria-hidden="true"></div><div id="ws-preview-menu" hidden></div><div id="ws-mode-menu" hidden></div></section></div>
    <aside id="mobile-drawer" class="open" aria-hidden="false"></aside><div id="mobile-drawer-backdrop" aria-hidden="false"></div>
  </body></html>`);
  await homePage.evaluate(()=>{
    window.KernelState={activeView:'projects'};
    window.MobileDrawer={close(){}};
    window.OVYXMobileShellAuthority={close(){},sync(){}};
    window.Router={go(view){
      window.KernelState.activeView=String(view||'home');
      document.querySelectorAll('#view-router-viewport>section').forEach(section=>{
        const on=section.id==='view-'+window.KernelState.activeView;
        section.classList.toggle('hidden',!on);section.setAttribute('aria-hidden',String(!on));
      });
      window.dispatchEvent(new CustomEvent('ovyx:view-changed',{detail:{view:window.KernelState.activeView}}));
      return true;
    }};
    document.documentElement.style.overflow='hidden';
    document.body.style.overflow='hidden';
  });
  await homePage.addScriptTag({content:recoveryMatch[1]});
  await homePage.evaluate(()=>window.Router.go('home'));
  await homePage.waitForFunction(()=>document.getElementById('mobile-drawer')?.getAttribute('aria-hidden')==='true'
    &&document.getElementById('mobile-drawer-backdrop')?.hidden===true
    &&getComputedStyle(document.getElementById('mobile-drawer-backdrop')).pointerEvents==='none'
    &&document.documentElement.style.overflow===''&&document.body.style.overflow==='');
  await homePage.locator('#dashboard-action').click();
  assert.equal(await homePage.evaluate(()=>window.dashboardClicks),1,
    'Dashboard controls must receive clicks after navigating Home from a previously open drawer.');
  assert.deepEqual(homeErrors,[],'Returning to Home must not throw browser runtime errors.');
  await homePage.close();
  console.log('OVYX Code Workspace timeout fallback and dashboard route recovery browser tests passed.');
}finally{await browser.close();}
