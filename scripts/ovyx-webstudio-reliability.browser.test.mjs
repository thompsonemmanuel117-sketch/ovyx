import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local Pages app.');

const browser = await chromium.launch({ headless: true });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    const page = await browser.newPage({ viewport: target.viewport });
    page.setDefaultTimeout(15000);
    const errors = [];
    const feedbackCalls = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.isNavigationRequest() && url.pathname === '/') {
        await route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
          <input id="ws-chat-input" aria-label="Web Studio chat prompt">
          <div id="ws-agent-thread"></div>
          <section id="view-faq" class="hidden"><form id="ovyx-help-support-form">
            <input id="ovyx-help-support-subject"><textarea id="ovyx-help-support-message"></textarea>
          </form></section>
          <script>
            const seedPage={id:'home',name:'Home',slug:'home',sections:[{type:'hero',content:{heading:'Home',subheading:'A polished Home experience generated in OVYX.',cta:'Get Started'}}]};
            const starter='<!doctype html><html><head><title>Old site</title></head><body><main><h1>Old site</h1><p>Existing stable preview source.</p></main></body></html>';
            const active={id:'project_1',name:'Starter',description:'fixture',pages:[seedPage],assets:[],ovyxGraph:{version:2,entry:'src/pages/Home.html',files:{'src/pages/Home.html':{type:'text/html',content:starter}}}};
            window.KernelState={activeView:'home',activeProject:active,projects:[active]};
            window.ProjectStore={save(){},renderHome(){},renderProjects(){}};
            window.__toasts=[];window.showToast=(message,type)=>window.__toasts.push({message,type});
            window.__route='home';window.Router={go(route){window.__route=route;document.getElementById('view-faq')?.classList.toggle('hidden',route!=='faq')}};
            window.firebase={auth:()=>({currentUser:{uid:'user_1',email:'test@example.com',async getIdToken(){return 'test-token'}}})};
            window.__responseMode='noop';window.__buildResponse={};
            window.OVYXAIService={async generate(payload){return window.__responseMode==='noop'?{ok:true,message:'I built your website'}:window.__homeResponse}};
            window.AIOrchestrator={async runSynthesis(mode='build'){return window.OVYXAIService.generate({mode,prompt:'Build it',project:window.KernelState.activeProject,context:{activeView:'home'}})}};
            window.WebStudio={
              brain:'automatic',mode:'build',setMode(mode){this.mode=mode},async submitPrompt(){window.__submittedMode=this.mode;window.__submitCount=(window.__submitCount||0)+1;return true},thread:[{id:'msg_test_123',role:'agent',text:'I finished reviewing the requested website.'}],
              graph:null,
              ensureProjectGraph(){const p=window.KernelState.activeProject;if(!this.graph)this.graph=JSON.parse(JSON.stringify(p.ovyxGraph||{version:2,entry:'src/pages/Home.html',files:{'src/pages/Home.html':{type:'text/html',content:starter}}}));p.ovyxGraph=this.graph;return this.graph},
              snapshotGraph(){this.ensureProjectGraph();return JSON.parse(JSON.stringify(this.graph))},
              entryFile(){this.ensureProjectGraph();return this.graph.entry},
              hasProjectWebsite(){return true},
              renderPreview(){window.__previewRenderCount=(window.__previewRenderCount||0)+1},
              renderThread(){const el=document.getElementById('ws-agent-thread');el.innerHTML=this.thread.map((m,i)=>'<div class="ovyx-ws-msg agent" data-ws-thread-index="'+i+'"><div class="ovyx-ws-msg-content"><div class="ovyx-ws-msg-body">'+m.text+'</div><div class="ovyx-ws-msg-actions" hidden><button type="button" class="ovyx-ws-msg-action">Copy Text</button></div></div></div>').join('')},
              async callAI(payload){return window.__buildResponse},
              pageToHtml(page){return '<!doctype html><html><body><main><h1>'+page.name+'</h1></main></body></html>'},
              applyAIResult(result){if(result.project){window.KernelState.activeProject=result.project;this.graph=null;this.ensureProjectGraph()}this.ensureProjectGraph();const files=result.files||result.fileEdits||result.patch?.files;if(files)Object.entries(files).forEach(([path,value])=>{const text=typeof value==='string'?value:(value?.content??value?.text);if(text!==undefined)this.graph.files[path]={type:/\.html?$/i.test(path)?'text/html':'text/plain',content:String(text)}});if(result.html)this.graph.files[this.entryFile()]={type:'text/html',content:result.html};if(result.code)this.graph.files[this.entryFile()]={type:'text/html',content:result.code};this.syncGraphToProject()},
              syncGraphToProject(){window.KernelState.activeProject.ovyxGraph=this.graph},
              runTests(){this.ensureProjectGraph();return {ok:true,summary:'All local source checks passed.'}},
              getActivePage(){return window.KernelState.activeProject.pages[0]},
              diffFiles(a,b){const A=a?.files||{},B=b?.files||{};return [...new Set([...Object.keys(A),...Object.keys(B)])].filter(k=>String(A[k]?.content||'')!==String(B[k]?.content||''))},
            };
          </script>
          <script defer src="/assets/ovyx-webstudio-reliability.js?v=20261014-1"></script>
          </body></html>`,
        });
        return;
      }
      if (url.pathname === '/api/ai/feedback') {
        const payload = request.postDataJSON();
        feedbackCalls.push({ method: request.method(), authorization: request.headers()['authorization'], payload });
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, vote: payload.vote, message: 'Thank you. Your feedback was saved.' }),
        });
        return;
      }
      await route.continue();
    });

    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    assert.ok(response && response.status() < 400, '[' + target.name + '] app fixture failed to load');
    await page.waitForFunction(() => !!window.__OVYX_WEBSTUDIO_RELIABILITY_V1__);
    await page.waitForSelector('.ovyx-ws-feedback');

    const followUpRouting = await page.evaluate(async () => {
      const input = document.getElementById('ws-chat-input');
      input.value = 'Search my project deeply for the mobile menu';
      await window.WebStudio.submitPrompt();
      const searchMode = window.__submittedMode;
      input.value = 'Change the menu background';
      await window.WebStudio.submitPrompt();
      const editMode = window.__submittedMode;
      window.WebStudio.setMode('ask'); // An explicit user choice must override the automatic mode.
      input.value = 'Change the menu background';
      await window.WebStudio.submitPrompt();
      return { searchMode, editMode, manualAskMode: window.__submittedMode };
    });
    assert.equal(followUpRouting.searchMode, 'ask', '[' + target.name + '] a read-only project search should route to Ask automatically');
    assert.equal(followUpRouting.editMode, 'build', '[' + target.name + '] a targeted edit after an automatic search should return to Build');
    assert.equal(followUpRouting.manualAskMode, 'ask', '[' + target.name + '] a manually selected Ask mode must remain read-only');
    const thumbs = page.locator('.ovyx-ws-feedback [data-ovyx-feedback-vote]');
    assert.equal(await thumbs.count(), 2, '[' + target.name + '] assistant response must show thumbs up and down');

    await page.locator('[data-ovyx-feedback-vote="up"]').click();
    await page.waitForFunction(() => window.__toasts.some(x => /feedback was saved/i.test(x.message)));
    assert.equal(feedbackCalls.length, 1, '[' + target.name + '] thumbs up must write feedback');
    assert.equal(feedbackCalls[0].payload.vote, 'up');
    assert.equal(feedbackCalls[0].authorization, 'Bearer test-token');
    assert.equal(JSON.stringify(feedbackCalls[0].payload).includes('Old site'), false, 'feedback must not upload website source or AI message contents');

    await page.locator('[data-ovyx-feedback-vote="down"]').click();
    await page.waitForFunction(() => window.__route === 'faq' && document.getElementById('ovyx-help-support-subject').value !== '');
    assert.equal(feedbackCalls.length, 2, '[' + target.name + '] thumbs down must also record the vote');
    assert.equal(feedbackCalls[1].payload.vote, 'down');
    assert.match(await page.locator('#ovyx-help-support-subject').inputValue(), /Web Studio AI response/i);
    assert.match(await page.locator('#ovyx-help-support-message').inputValue(), /What went wrong\?/i);
    assert.equal(await page.locator('#view-faq').isVisible(), true, '[' + target.name + '] thumbs down must open the Help/Support area');

    const noOp = await page.evaluate(async () => {
      window.__responseMode = 'noop';
      try {
        await window.OVYXAIService.generate({ mode:'build', prompt:'Build a site', project:window.KernelState.activeProject, context:{activeView:'home'} });
        return { rejected:false, message:'' };
      } catch (error) { return { rejected:true, message:error.message }; }
    });
    assert.equal(noOp.rejected, true, '[' + target.name + '] a plain AI acknowledgement must not count as a built website');
    assert.match(noOp.message, /website draft was not ready for preview/i);
    assert.equal(await page.evaluate(() => window.KernelState.activeProject.ovyxBuildState || ''), '', '[' + target.name + '] no-op AI response must not mark a project verified');

    const validHtml='<!doctype html><html><head><title>Generated site</title></head><body><main><h1>Actually generated website</h1><p>Real output content with more than eighty characters for the build check.</p></main></body></html>';
    const validBuild = await page.evaluate(async html => {
      window.__responseMode='good';
      window.__homeResponse={ok:true,message:'Website generated',files:{'src/pages/Home.html':{type:'text/html',content:html}}};
      const result=await window.OVYXAIService.generate({mode:'build',prompt:'Build a site',project:window.KernelState.activeProject,context:{activeView:'home'}});
      return {verified:window.KernelState.activeProject.ovyxBuildState,html:window.KernelState.activeProject.ovyxGraph.files['src/pages/Home.html'].content,resultOk:result.ok};
    }, validHtml);
    assert.equal(validBuild.verified, 'verified', '[' + target.name + '] only actual HTML output may mark the preview verified');
    assert.match(validBuild.html, /Actually generated website/);

    const noOpStudioCall = await page.evaluate(async () => {
      window.__buildResponse={ok:true,message:'I built it'};
      try { await window.WebStudio.callAI({mode:'build'}, 1); return {rejected:false,message:''}; }
      catch (error) { return {rejected:true,message:error.message}; }
    });
    assert.equal(noOpStudioCall.rejected, true, '[' + target.name + '] in-studio AI acknowledgements without HTML must be rejected');
    assert.match(noOpStudioCall.message, /website draft was not updated.*existing preview remains unchanged/i);

    assert.deepEqual(errors, [], '[' + target.name + '] browser errors: ' + errors.join('; '));
    console.log('PASS Web Studio reliability ' + target.name + ': useful feedback controls, Help hand-off, no-op build rejection and verified HTML gate.');
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('Web Studio reliability desktop/mobile browser tests passed.');
