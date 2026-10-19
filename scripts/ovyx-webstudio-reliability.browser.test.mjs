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
    const researchCalls = [];
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
          <section id="view-webstudio"></section>
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
            window.__responseMode='noop';window.__buildResponse={};window.OVYXWebStudioQuality={async run(){return {checks:[]}},getReport(){return {checks:[]}}};
            window.OVYXAIService={async generate(payload){return window.__responseMode==='noop'?{ok:true,message:'I built your website'}:window.__homeResponse}};
            window.AIOrchestrator={async runSynthesis(mode='build'){return window.OVYXAIService.generate({mode,prompt:'Build it',project:window.KernelState.activeProject,context:{activeView:'home'}})}};
            window.WebStudio={
              brain:'automatic',mode:'build',setMode(mode){this.mode=mode},async submitPrompt(){const input=document.getElementById('ws-chat-input');window.__submittedMode=this.mode;window.__lastSubmittedPrompt=input&&input.value||'';window.__submitCount=(window.__submitCount||0)+1;if(window.__simulateApplySuccess){this.ensureProjectGraph();const file=this.graph.files['src/pages/Home.html'];const content=typeof file==='string'?file:(file&&file.content)||'';this.graph.files['src/pages/Home.html']={type:'text/html',content:content.replace('</main>','<nav aria-label="Primary navigation"><a href="/">Home</a></nav></main>')};this.syncGraphToProject();window.__simulateApplySuccess=false;}if(input)input.value='';return true},thread:[{id:'msg_test_123',role:'agent',text:'I finished reviewing the requested website.'}],
              graph:null,
              ensureProjectGraph(){const p=window.KernelState.activeProject;if(!this.graph)this.graph=JSON.parse(JSON.stringify(p.ovyxGraph||{version:2,entry:'src/pages/Home.html',files:{'src/pages/Home.html':{type:'text/html',content:starter}}}));p.ovyxGraph=this.graph;return this.graph},
              snapshotGraph(){this.ensureProjectGraph();return JSON.parse(JSON.stringify(this.graph))},
              entryFile(){this.ensureProjectGraph();return this.graph.entry},
              hasProjectWebsite(){return true},
              renderPreview(){window.__previewRenderCount=(window.__previewRenderCount||0)+1},
              renderThread(){const el=document.getElementById('ws-agent-thread');el.innerHTML=this.thread.map((m,i)=>'<div class="ovyx-ws-msg agent" data-ws-thread-index="'+i+'"><div class="ovyx-ws-msg-content"><div class="ovyx-ws-msg-body">'+m.text+'</div><div class="ovyx-ws-msg-actions" hidden><button type="button" class="ovyx-ws-msg-action">Copy Text</button></div></div></div>').join('')},
              async callAI(payload){window.__lastCallAIPayload=payload;return window.__buildResponse},
              pageToHtml(page){return '<!doctype html><html><body><main><h1>'+page.name+'</h1></main></body></html>'},
              applyAIResult(result){if(result.project){window.KernelState.activeProject=result.project;this.graph=null;this.ensureProjectGraph()}this.ensureProjectGraph();const files=result.files||result.fileEdits||result.patch?.files;if(files)Object.entries(files).forEach(([path,value])=>{const text=typeof value==='string'?value:(value?.content??value?.text);if(text!==undefined)this.graph.files[path]={type:/\.html?$/i.test(path)?'text/html':'text/plain',content:String(text)}});if(result.html)this.graph.files[this.entryFile()]={type:'text/html',content:result.html};if(result.code)this.graph.files[this.entryFile()]={type:'text/html',content:result.code};this.syncGraphToProject()},
              syncGraphToProject(){window.KernelState.activeProject.ovyxGraph=this.graph},
              runTests(){this.ensureProjectGraph();return {ok:true,summary:'All local source checks passed.'}},
              getActivePage(){return window.KernelState.activeProject.pages[0]},
              diffFiles(a,b){const A=a?.files||{},B=b?.files||{};return [...new Set([...Object.keys(A),...Object.keys(B)])].filter(k=>String(A[k]?.content||'')!==String(B[k]?.content||''))},
            };
          </script>
          <script defer src="/assets/ovyx-webstudio-reliability.js?v=20261019-2"></script>
          <script defer src="/assets/ovyx-webstudio-research.js?v=20261019-1"></script>
          <script defer src="/assets/ovyx-webstudio-apply-suggestions.js?v=20261019-1"></script>
          </body></html>`,
        });
        return;
      }
      if (url.pathname === '/api/ai/web-search') {
        const payload = request.postDataJSON();
        researchCalls.push({ method: request.method(), authorization: request.headers()['authorization'], payload });
        const source = {
          title: 'MDN: Navigation landmarks',
          url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/nav',
          domain: 'developer.mozilla.org',
          favicon: 'https://www.google.com/s2/favicons?domain=developer.mozilla.org&sz=48',
          snippet: 'Use navigation landmarks to identify groups of important links.',
          description: 'The nav element represents a section of a page whose purpose is to provide navigation links.',
          content: 'Use navigation landmarks to identify important navigation sections. Label multiple navigation landmarks clearly. Make interactive menus usable on keyboard, touch and desktop.',
          readStatus: 'page_read',
          engine: 'Fixture Search'
        };
        const research = {
          status: 'complete',
          query: payload.prompt,
          queries: [payload.prompt, payload.prompt + ' official documentation'],
          searchedAt: '2026-10-19T18:00:00.000Z',
          resultCount: 4,
          sourcesRead: 1,
          sources: [source],
          results: [source]
        };
        const events = [
          ['connected', { ts: Date.now() }],
          ['progress', { phase: 'search', status: 'running', title: 'Searching the web', detail: 'Search 1 of 2: ' + payload.prompt }],
          ['source', { source }],
          ['progress', { phase: 'read', status: 'running', title: 'Reading a source page', detail: 'Opening source 1 of 1: ' + source.title, source }],
          ['complete', { ok: true, research }],
          ['done', { ts: Date.now() }]
        ].map(([event, data]) => 'event: ' + event + String.fromCharCode(10) + 'data: ' + JSON.stringify(data) + String.fromCharCode(10, 10)).join('');
        await route.fulfill({
          status: 200,
          headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' },
          body: events
        });
        return;
      }
      if (url.hostname === 'www.google.com' && url.pathname === '/s2/favicons') {
        await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#d8b26a"/></svg>' });
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
      input.value = 'What should I change on the website?';
      await window.WebStudio.submitPrompt();
      const adviceMode = window.__submittedMode;
      window.WebStudio.setMode('build'); // Reset to a deliberate Build choice for the source-search loop.
      input.value = 'Search my project deeply for the mobile menu';
      await window.WebStudio.submitPrompt();
      const searchMode = window.__submittedMode;
      input.value = 'Change the menu background';
      await window.WebStudio.submitPrompt();
      const editMode = window.__submittedMode;
      window.WebStudio.setMode('ask'); // An explicit user choice must override the automatic mode.
      input.value = 'Change the menu background';
      await window.WebStudio.submitPrompt();
      const manualAskMode = window.__submittedMode;
      window.WebStudio.setMode('build');
      input.value = 'Did you already fix the mobile menu?';
      await window.WebStudio.submitPrompt();
      const statusCheckMode = window.__submittedMode;
      window.WebStudio.setMode('build');
      input.value = 'Check if the menu is done, and fix it if not';
      await window.WebStudio.submitPrompt();
      const conditionalRepairMode = window.__submittedMode;
      window.WebStudio.setMode('fix');
      input.value = 'Search the project for the mobile menu handler';
      await window.WebStudio.submitPrompt();
      const fixModeSearch = window.__submittedMode;
      window.WebStudio.setMode('build');
      input.value = 'Inspect the menu, but do not change anything';
      await window.WebStudio.submitPrompt();
      const explicitReadOnlyMode = window.__submittedMode;
      return { adviceMode, searchMode, editMode, manualAskMode, statusCheckMode, conditionalRepairMode, fixModeSearch, explicitReadOnlyMode };
    });
    assert.equal(followUpRouting.adviceMode, 'ask', '[' + target.name + '] advice-only website questions should stay read-only');
    assert.equal(followUpRouting.searchMode, 'ask', '[' + target.name + '] a read-only project search should route to Ask automatically');
    assert.equal(followUpRouting.editMode, 'build', '[' + target.name + '] a targeted edit after an automatic search should return to Build');
    assert.equal(followUpRouting.manualAskMode, 'ask', '[' + target.name + '] a manually selected Ask mode must remain read-only');
    assert.equal(followUpRouting.statusCheckMode, 'ask', '[' + target.name + '] asking whether a prior edit is already done must inspect read-only');
    assert.equal(followUpRouting.conditionalRepairMode, 'build', '[' + target.name + '] a request to fix the issue if it is not done must stay in edit mode');
    assert.equal(followUpRouting.fixModeSearch, 'ask', '[' + target.name + '] searches in Fix mode should route to Ask instead of attempting repairs');
    assert.equal(followUpRouting.explicitReadOnlyMode, 'ask', '[' + target.name + '] an explicit no-changes instruction must remain read-only');

    const activeGraphContext = await page.evaluate(async () => {
      const studio = window.WebStudio;
      studio.ensureProjectGraph();
      studio.graph.files['styles/site.css'] = { type: 'text/css', content: '.site { color: navy; }' };
      window.__buildResponse = { ok: true, scopedWebStudioEdit: true, files: { 'styles/site.css': { type: 'text/css', content: '.site { color: teal; }' } } };
      await studio.callAI({ mode: 'build', prompt: 'Change the colors' }, 3);
      return {
        activeView: window.__lastCallAIPayload.context.activeView,
        hasEntryFile: !!window.__lastCallAIPayload.context.files['src/pages/Home.html'],
        hasCssFile: !!window.__lastCallAIPayload.context.files['styles/site.css'],
        activeProjectId: window.__lastCallAIPayload.context.project && window.__lastCallAIPayload.context.project.id,
      };
    });
    assert.equal(activeGraphContext.activeView, 'webstudio', '[' + target.name + '] Web Studio API context must identify the active view');
    assert.equal(activeGraphContext.hasEntryFile, true, '[' + target.name + '] source inspection must receive the active graph HTML');
    assert.equal(activeGraphContext.hasCssFile, true, '[' + target.name + '] source inspection must receive CSS source files too');

    const readOnlyResearchMode = await page.evaluate(async () => {
      window.WebStudio.setMode('build');
      const input = document.getElementById('ws-chat-input');
      input.value = 'Research how ChatGPT handles responsive navigation and suggest what changes I should make on my website';
      await window.WebStudio.submitPrompt();
      return { mode: window.WebStudio.mode, autoReadOnly: window.WebStudio.__ovyxAutoReadOnlyMode === true };
    });
    assert.equal(readOnlyResearchMode.mode, 'ask', '[' + target.name + '] research plus suggestions must stay read-only even when Build was selected');
    assert.equal(readOnlyResearchMode.autoReadOnly, true, '[' + target.name + '] research-only routing should allow a later targeted edit to switch back to Build');

    const explicitResearchApplyMode = await page.evaluate(async () => {
      window.WebStudio.setMode('build');
      const input = document.getElementById('ws-chat-input');
      input.value = 'Research how ChatGPT handles responsive navigation and then add a keyboard-friendly menu to my website';
      await window.WebStudio.submitPrompt();
      return { mode: window.WebStudio.mode, autoReadOnly: window.WebStudio.__ovyxAutoReadOnlyMode === true };
    });
    assert.equal(explicitResearchApplyMode.mode, 'build', '[' + target.name + '] a clear request to research and apply a change must remain in Build');
    assert.equal(explicitResearchApplyMode.autoReadOnly, false);

    const webResearchRun = await page.evaluate(async () => {
      window.WebStudio.setMode('ask');
      window.__buildResponse = {
        ok: true,
        text: 'Here are two source-backed improvements for your navigation.\n\n<!-- OVYX_APPLY_SUGGESTIONS: ' + JSON.stringify({
          suggestions: [
            {
              title: 'Label the navigation landmark',
              summary: 'A clear label helps assistive technology users distinguish navigation regions.',
              prompt: 'Add an accessible label to the primary navigation landmark in the existing website. Inspect the current markup and make the smallest safe change.',
              sourceUrls: ['https://developer.mozilla.org/en-US/docs/Web/HTML/Element/nav'],
            },
            {
              title: 'Improve keyboard navigation',
              summary: 'Keyboard users should be able to reach and understand every navigation action.',
              prompt: 'Review the existing primary navigation and make its interactive links and menu controls keyboard accessible, preserving the current design and routes.',
              sourceUrls: ['https://developer.mozilla.org/en-US/docs/Web/HTML/Element/nav'],
            },
            {
              title: 'Unsafe unrelated link',
              summary: 'This must not appear.',
              prompt: 'Change something.',
              sourceUrls: ['http://127.0.0.1/private'],
            },
          ],
        }) + ' -->',
      };
      const result = await window.WebStudio.callAI({
        mode: 'ask',
        prompt: 'Search the web for how ChatGPT handles responsive navigation and suggest what changes I should make to my website',
        context: { activeView: 'webstudio' },
      }, 7);
      window.__lastSanitizedResearchAnswer = result;
      const activity = document.querySelector('.ovyx-ws-live-activity');
      return {
        responseReturned: !!result,
        answerText: result && result.text,
        activeView: window.__lastCallAIPayload && window.__lastCallAIPayload.context.activeView,
        researchStatus: window.__lastCallAIPayload && window.__lastCallAIPayload.context.webResearch && window.__lastCallAIPayload.context.webResearch.status,
        researchedSource: window.__lastCallAIPayload && window.__lastCallAIPayload.context.webResearch && window.__lastCallAIPayload.context.webResearch.sources[0] && window.__lastCallAIPayload.context.webResearch.sources[0].url,
        activityText: activity && activity.textContent,
        activityState: activity && activity.getAttribute('data-state'),
        hasSourceLink: !!(activity && activity.querySelector('.ovyx-ws-live-source[href="https://developer.mozilla.org/en-US/docs/Web/HTML/Element/nav"]')),
        hasAnimatedLogo: !!(activity && activity.querySelector('.ovyx-ws-live-orbit')),
      };
    });
    assert.equal(webResearchRun.responseReturned, true, '[' + target.name + '] research should continue into the Web Studio AI answer');
    assert.equal(webResearchRun.activeView, 'webstudio', '[' + target.name + '] research context must stay within Web Studio');
    assert.equal(webResearchRun.researchStatus, 'complete', '[' + target.name + '] the sourced research must be passed into the model request');
    assert.equal(webResearchRun.researchedSource, 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/nav');
    assert.match(webResearchRun.activityText, /Web research complete/, '[' + target.name + '] activity must settle only after source research finishes');
    assert.equal(webResearchRun.activityState, 'success');
    assert.equal(webResearchRun.hasSourceLink, true, '[' + target.name + '] the progress card should show the actual source link');
    assert.equal(webResearchRun.hasAnimatedLogo, true, '[' + target.name + '] the progress card should show OVYX animation');
    assert.equal(researchCalls.length, 1, '[' + target.name + '] an explicit web request must invoke the real server route');
    assert.equal(researchCalls[0].authorization, 'Bearer test-token');
    assert.match(researchCalls[0].payload.prompt, /ChatGPT handles responsive navigation/);
 
    const applySuggestionUi = await page.evaluate(async () => {
      const resultText = window.__lastSanitizedResearchAnswer && window.__lastSanitizedResearchAnswer.text;
      const pending = window.WebStudio.__ovyxPendingApplySuggestions;
      const thread = window.WebStudio.thread;
      thread.push({ id: 'msg_research_suggestions_123', role: 'agent', text: resultText });
      window.WebStudio.renderThread();
      const bar = document.querySelector('.ovyx-ws-apply-suggestions');
      const buttons = Array.from(document.querySelectorAll('[data-ovyx-apply-suggestion]'));
      return {
        markerRemoved: !String(resultText || '').includes('OVYX_APPLY_SUGGESTIONS'),
        pendingCount: pending && pending.suggestions && pending.suggestions.length,
        buttonCount: buttons.length,
        sourceLink: bar && bar.querySelector('a[href="https://developer.mozilla.org/en-US/docs/Web/HTML/Element/nav"]') && bar.querySelector('a').href,
        visibleUnsafeUrl: !!(bar && bar.querySelector('a[href^="http://127.0.0.1"]')),
        hasAccessibleLabel: !!(buttons[0] && buttons[0].getAttribute('aria-label')),
      };
    });
    assert.equal(applySuggestionUi.markerRemoved, true, '[' + target.name + '] structured control metadata must never be shown to the user');
    assert.equal(applySuggestionUi.pendingCount, 2, '[' + target.name + '] only recommendations tied to opened sources should be accepted');
    assert.equal(applySuggestionUi.buttonCount, 2, '[' + target.name + '] each valid source-backed recommendation should have its own Apply button');
    assert.equal(applySuggestionUi.sourceLink, 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/nav');
    assert.equal(applySuggestionUi.visibleUnsafeUrl, false, '[' + target.name + '] untrusted or private links must never become action sources');
    assert.equal(applySuggestionUi.hasAccessibleLabel, true, '[' + target.name + '] apply controls need accessible labels');

    const applySuggestionResult = await page.evaluate(async () => {
      window.__simulateApplySuccess = true;
      const input = document.getElementById('ws-chat-input');
      input.value = 'My unsent draft should survive';
      const button = document.querySelector('[data-ovyx-apply-suggestion]');
      button.click();
      const pending = window.WebStudio.__ovyxApplySuggestionPromise;
      if (pending) await pending;
      const activity = document.querySelector('.ovyx-ws-live-activity');
      return {
        submittedMode: window.__submittedMode,
        submittedPrompt: window.__lastSubmittedPrompt,
        restoredDraft: input.value,
        activeView: window.__lastCallAIPayload && window.__lastCallAIPayload.context.activeView,
        changedSource: String(window.KernelState.activeProject.ovyxGraph.files['src/pages/Home.html'].content).includes('aria-label="Primary navigation"'),
        finalActivity: activity && activity.querySelector('.ovyx-ws-live-title') && activity.querySelector('.ovyx-ws-live-title').textContent,
        buttonText: button.textContent,
        buttonDisabled: button.disabled,
      };
    });
    assert.equal(applySuggestionResult.submittedMode, 'build', '[' + target.name + '] Apply must route through Web Studio Build mode');
    assert.match(applySuggestionResult.submittedPrompt, /Label the navigation landmark/);
    assert.match(applySuggestionResult.submittedPrompt, /developer.mozilla.org/);
    assert.match(applySuggestionResult.submittedPrompt, /Add an accessible label/);
    assert.equal(applySuggestionResult.restoredDraft, 'My unsent draft should survive', '[' + target.name + '] applying a suggestion must preserve the user\'s unsent draft');
    assert.equal(applySuggestionResult.activeView, 'webstudio');
    assert.equal(applySuggestionResult.changedSource, true, '[' + target.name + '] the mocked Build action should update the existing graph file');
    assert.match(applySuggestionResult.finalActivity, /Website update verified/);
    assert.match(applySuggestionResult.buttonText, /Applied & verified/);
    assert.equal(applySuggestionResult.buttonDisabled, true, '[' + target.name + '] a verified recommendation must not accidentally be applied twice');


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

    const scopedCssEdit = await page.evaluate(async () => {
      window.__buildResponse = {
        ok: true,
        scopedWebStudioEdit: true,
        files: { 'assets/mobile-menu.css': { type: 'text/css', content: '.mobile-menu { display: grid; gap: 1rem; }' } },
      };
      try {
        const result = await window.WebStudio.callAI({ mode: 'build', prompt: 'Change the mobile menu layout' }, 2);
        return { accepted: true, scopedWebStudioEdit: result.scopedWebStudioEdit };
      } catch (error) { return { accepted: false, message: error.message }; }
    });
    assert.equal(scopedCssEdit.accepted, true, '[' + target.name + '] scoped CSS-only edits must not be rejected by the HTML-preview build guard');
    assert.equal(scopedCssEdit.scopedWebStudioEdit, true);

    const scopedJsEdit = await page.evaluate(async () => {
      window.__buildResponse = {
        ok: true,
        scopedWebStudioEdit: true,
        files: { 'assets/mobile-menu.js': { type: 'text/javascript', content: 'function toggleMobileMenu(){ return true; }' } },
      };
      try {
        const result = await window.WebStudio.callAI({ mode: 'build', prompt: 'Fix the mobile menu interaction' }, 3);
        return { accepted: true, scopedWebStudioEdit: result.scopedWebStudioEdit };
      } catch (error) { return { accepted: false, message: error.message }; }
    });
    assert.equal(scopedJsEdit.accepted, true, '[' + target.name + '] scoped JavaScript-only edits must pass when the source actually changed');
    assert.equal(scopedJsEdit.scopedWebStudioEdit, true);

    const scopedNoOp = await page.evaluate(async () => {
      window.__buildResponse = { ok: true, scopedWebStudioEdit: true, files: {} };
      try {
        await window.WebStudio.callAI({ mode: 'build', prompt: 'Change the colors' }, 4);
        return { rejected: false, message: '' };
      } catch (error) { return { rejected: true, message: error.message }; }
    });
    assert.equal(scopedNoOp.rejected, true, '[' + target.name + '] a scoped-edit flag must not permit a no-op response');
    assert.match(scopedNoOp.message, /website draft was not updated.*existing preview remains unchanged/i);

    const newBuildCssOnly = await page.evaluate(async () => {
      window.__buildResponse = {
        ok: true,
        files: { 'assets/site.css': { type: 'text/css', content: 'body { color: purple; }' } },
      };
      try {
        await window.WebStudio.callAI({ mode: 'build', prompt: 'Build a new website' }, 5);
        return { rejected: false, message: '' };
      } catch (error) { return { rejected: true, message: error.message }; }
    });
    assert.equal(newBuildCssOnly.rejected, true, '[' + target.name + '] a new-site build still requires a real HTML artifact');
    assert.match(newBuildCssOnly.message, /website draft was not updated.*existing preview remains unchanged/i);

    assert.deepEqual(errors, [], '[' + target.name + '] browser errors: ' + errors.join('; '));
    console.log('PASS Web Studio reliability ' + target.name + ': useful feedback controls, Help hand-off, no-op build rejection and verified HTML gate.');
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('Web Studio reliability desktop/mobile browser tests passed.');
