// Regression trigger: changes to this browser suite should rerun its owning GitHub Actions workflow.
// Keep Settings and Assistant bootstrap regressions aligned on the same tested commit.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { installOwnerBrowserApiFixtures, startBrowserStartupProfiler } from './ovyx-owner-browser-api-fixtures.mjs';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local or deployed OVYX Pages app.');

const expectedActions = [
  'new-chat', 'copy-chat', 'export-chat', 'help',
  'diagnose-project', 'repair-project', 'explain-project', 'refresh-context',
  'undo-last-ai-edit', 'review-ai-edits', 'recover-project',
  'open-projects', 'open-workspace', 'open-webstudio', 'open-settings',
  'open-assets', 'open-history', 'open-sections', 'open-preview',
];

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    const page = await browser.newPage({ viewport: target.viewport, acceptDownloads: true });
    page.setDefaultTimeout(20000);
    await installOwnerBrowserApiFixtures(page, {
      initialUser: { uid: 'ovyx-assistant-browser-user', email: 'assistant@example.test', token: 'ovyx-assistant-browser-token' }
    });
    const stopStartupProfiler = await startBrowserStartupProfiler(page, target.name + ' Assistant');
    const errors = [];
    const bootstrapErrors = [];
    page.on('crash', () => console.error('[' + target.name + '] Chromium page crashed during Assistant bootstrap.'));
    page.on('close', () => console.error('[' + target.name + '] Chromium page closed during Assistant bootstrap.'));
    browser.on('disconnected', () => console.error('[' + target.name + '] Chromium browser disconnected during Assistant test.'));
    page.on('pageerror', error => {
      bootstrapErrors.push(String(error?.stack || error?.message || error));
      if (/ovyx-native|menuAction|workspaceTool|recoverLatestWorkspaceEdit|reviewWorkspaceEditHistory/i.test(error.message)) errors.push(error.message);
    });
    page.on('console', message => {
      if (message.type() === 'error') bootstrapErrors.push('console: ' + message.text());
    });

    // Gate on the Assistant runtime below rather than unrelated inline scripts
    // reaching DOMContentLoaded before the feature can be exercised.
    console.log(`[${target.name}] Assistant stage: navigating to OVYX shell.`);
    const response = await page.goto(baseURL, { waitUntil: 'commit', timeout: 60000 });
    assert.ok(response && response.status() < 400, `[${target.name}] app returned an HTTP error`);
    console.log(`[${target.name}] Assistant stage: shell response received; waiting for legacy runtime.`);
    // The legacy assistant creates its panel when open() is called. Waiting
    // for the panel before invoking open() is a circular readiness condition.
    try {
      await page.waitForFunction(() => typeof window.WorkspaceBrainBot?.open === 'function', null, { timeout: 60000 });
    } catch (error) {
      const diagnostic = await Promise.race([
        page.evaluate(() => ({
          readyState: document.readyState,
          bot: typeof window.WorkspaceBrainBot,
          open: typeof window.WorkspaceBrainBot?.open,
          panel: !!document.getElementById('kernel-brain-bot-panel'),
          panelHidden: document.getElementById('kernel-brain-bot-panel')?.classList.contains('hidden') ?? null,
          bodyReady: !!document.body,
          assistantAssetRequested: performance.getEntriesByType('resource').some(entry => entry.name.includes('/assets/ovyx-assistant-workspace.js')),
          scripts: performance.getEntriesByType('resource').map(entry => entry.name).filter(src => /\.js(?:\?|$)/.test(src)).slice(-35),
        })),
        new Promise(resolve => setTimeout(() => resolve({ diagnostic: 'Browser page did not answer the Assistant bootstrap diagnostic within 5 seconds.' }), 5000)),
      ]).catch(e => ({ diagnostic: 'Browser page unavailable: ' + String(e?.message || e) }));
      console.error('[' + target.name + '] Legacy Assistant bootstrap diagnostic: ' + JSON.stringify({ ...diagnostic, pageErrors: bootstrapErrors.slice(-30) }));
      throw error;
    }
    await stopStartupProfiler();
    await page.evaluate(() => {
      const user = window.__setOVYXBrowserAuthUser?.({
        uid: 'ovyx-assistant-browser-user',
        email: 'assistant@example.test',
        token: 'ovyx-assistant-browser-token',
      });
      if (!user || !window.firebase?.auth?.()?.currentUser) {
        throw new Error('The isolated Firebase browser fixture did not restore its signed-in test user after shell boot.');
      }
    });

    // The shell's asset loader may remove transient script elements after execution.
    // Verify the fetched asset through the browser resource timing buffer instead
    // of requiring its temporary <script> node to remain in the DOM.
    await page.waitForFunction(() => {
      const resources = performance.getEntriesByType('resource').map(entry => entry.name);
      return resources.some(src => /\/assets\/ovyx-assistant-workspace\.js(?:\?|$)/.test(src));
    }, null, { timeout: 15000 });
    const assistantAssetSources = await page.evaluate(() =>
      performance.getEntriesByType('resource')
        .map(entry => entry.name)
        .filter(src => /\/assets\/ovyx-assistant-workspace\.js(?:\?|$)/.test(src))
    );
    assert.ok(assistantAssetSources.length, `[${target.name}] assistant workspace asset was not fetched`);
    assert.ok(assistantAssetSources.some(src => /[?&]v=20261118-4(?:&|$)/.test(src)),
      `[${target.name}] the updated assistant runtime cache version was not loaded: ${assistantAssetSources.join(', ')}`);
    // Resource timing records a fetch before the asset's boot hook necessarily
    // finishes. Wait for the native wrapper before invoking the public open API.
    try {
      await page.waitForFunction(() => window.WorkspaceBrainBot?.__ovyxNativeOpen === true, null, { timeout: 120000 });
    } catch (error) {
      const diagnostic = await page.evaluate(() => ({
        bot: typeof window.WorkspaceBrainBot,
        open: typeof window.WorkspaceBrainBot?.open,
        nativeOpen: window.WorkspaceBrainBot?.__ovyxNativeOpen === true,
        nativeSend: window.WorkspaceBrainBot?.__ovyxNativeSend === true,
        aiService: typeof window.OVYXAIService,
        generate: typeof window.OVYXAIService?.generate,
        nativeRoute: window.OVYXAIService?.__ovyxNativeWorkspaceRoute === true,
        runtimeLoaded: performance.getEntriesByType('resource').some(entry => entry.name.includes('/assets/ovyx-assistant-workspace.js')),
        pageErrors: errors,
      })).catch(() => ({ diagnostic: 'page unavailable' }));
      console.error('[' + target.name + '] Assistant native-routing diagnostic: ' + JSON.stringify(diagnostic));
      throw error;
    }

    const panel = page.locator('#kernel-brain-bot-panel');
    // The legacy assistant mounts its panel lazily from open(). Invoke the
    // public API first, then wait for the actual panel and verify it becomes visible.
    await page.evaluate(() => window.WorkspaceBrainBot.open());
    await panel.waitFor({ state: 'attached', timeout: 45000 });
    const panelState = await panel.evaluate(el => {
      const rect = el.getBoundingClientRect();
      const computed = getComputedStyle(el);
      const ancestors = [];
      for (let node = el; node && node !== document.documentElement && ancestors.length < 6; node = node.parentElement) {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        ancestors.push({
          tag: node.tagName,
          id: node.id || '',
          className: typeof node.className === 'string' ? node.className : '',
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          width: Math.round(box.width),
          height: Math.round(box.height),
        });
      }
      return {
        hidden: el.hidden,
        ariaHidden: el.getAttribute('aria-hidden'),
        className: el.className,
        inlineStyle: el.getAttribute('style') || '',
        computed: {
          display: computed.display,
          visibility: computed.visibility,
          opacity: computed.opacity,
          position: computed.position,
          width: computed.width,
          height: computed.height,
          pointerEvents: computed.pointerEvents,
          transform: computed.transform,
        },
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
        ancestors,
      };
    });
    console.log('[' + target.name + '] assistant panel state after open: ' + JSON.stringify(panelState));
    await panel.waitFor({ state: 'visible', timeout: 15000 });

    // The real Home dock has inline !important styles and multiple shell
    // controllers. Verify the actual production element is hidden when the
    // assistant opens, and that a later controller cannot force it visible.
    if (target.name === 'mobile') {
      await page.waitForFunction(() => {
        const dock = document.getElementById('ovyx-v52-bottom-bar');
        const assistant = document.getElementById('kernel-brain-bot-panel');
        return dock && assistant && getComputedStyle(assistant).display !== 'none' &&
          getComputedStyle(assistant).visibility !== 'hidden' &&
          getComputedStyle(dock).display === 'none';
      }, null, { timeout: 8000 });
      await page.evaluate(() => {
        const dock = document.getElementById('ovyx-v52-bottom-bar');
        dock?.style.setProperty('display', 'grid', 'important');
      });
      await page.waitForFunction(() => {
        const dock = document.getElementById('ovyx-v52-bottom-bar');
        return dock && getComputedStyle(dock).display === 'none' &&
          dock.style.getPropertyValue('display') === 'none' &&
          dock.style.getPropertyPriority('display') === 'important';
      }, null, { timeout: 5000 });
    }

    // Reproduce a dashboard bottom bar that would otherwise overlay the chat
    // on narrow screens, and verify the assistant isolates typing from global
    // dashboard keyboard handlers.
    await page.evaluate(() => {
      // No nav-like ID/class or inline positioning: real app CSS can position
      // a generic shell without exposing its layout role in its attributes.
      const dockStyles = document.createElement('style');
      dockStyles.id = 'test-opaque-dock-styles';
      dockStyles.textContent = '.opaque-7a { position:fixed!important;left:0;right:0;bottom:0;width:100%;height:72px;z-index:2147483647;background:#ff00ff; } .opaque-8b { position:fixed!important;left:0;right:0;bottom:0;width:100%;height:72px;z-index:2147483647;background:#00ffff; } .opaque-9c { position:fixed!important;left:0;right:0;bottom:0;width:100%;height:72px;z-index:2147483647;background:#ffff00; } .opaque-static { position:static!important;display:block;height:1px;width:100%; }';
      document.head.appendChild(dockStyles);
      const nav = document.createElement('div');
      nav.id = 'test-floating-shell';
      nav.className = 'opaque-7a';
      document.body.appendChild(nav);

      // Regression for the production failure: the element starts as a normal
      // flow node and becomes a bottom-fixed dock only when composer state
      // changes. Attribute-only layout changes must trigger the shield.
      const typingDock = document.createElement('div');
      typingDock.id = 'test-typing-dock-shell';
      typingDock.className = 'opaque-static';
      document.body.appendChild(typingDock);

      if (window.innerWidth <= 640) {
        // Emulate Android's shrunken visual viewport while the layout viewport
        // remains tall when the on-screen keyboard is visible.
        const descriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport');
        window.__ovyxTestVisualViewportDescriptor = descriptor || null;
        Object.defineProperty(window, 'visualViewport', {
          configurable: true,
          enumerable: true,
          writable: true,
          value: { height: 500, offsetTop: 0 }
        });
        const keyboardDock = document.createElement('div');
        keyboardDock.id = 'test-keyboard-floating-shell';
        keyboardDock.className = 'opaque-8b';
        keyboardDock.getBoundingClientRect = () => ({
          x: 0, y: 428, top: 428, left: 0, right: window.innerWidth,
          bottom: 500, width: window.innerWidth, height: 72,
          toJSON() { return { x: 0, y: 428, top: 428, left: 0, right: window.innerWidth, bottom: 500, width: window.innerWidth, height: 72 }; }
        });
        document.body.appendChild(keyboardDock);
      }
      window.__ovyxAssistantTypingKeyBubbles = 0;
      document.addEventListener('keydown', event => {
        if (event.target?.id === 'bot-chat-input') window.__ovyxAssistantTypingKeyBubbles += 1;
      });
    });
    const composer = panel.locator('#bot-chat-input');
    await composer.focus();
    await page.waitForFunction(() => {
      const nav = document.getElementById('test-floating-shell');
      return nav?.classList.contains('ovyx-native-underlying-bottom-nav-suppressed') &&
        getComputedStyle(nav).display === 'none' && getComputedStyle(nav).visibility === 'hidden' &&
        (!document.getElementById('test-keyboard-floating-shell') || (
          document.getElementById('test-keyboard-floating-shell').classList.contains('ovyx-native-underlying-bottom-nav-suppressed') &&
          getComputedStyle(document.getElementById('test-keyboard-floating-shell')).display === 'none' &&
          getComputedStyle(document.getElementById('test-keyboard-floating-shell')).visibility === 'hidden'
        ));
    }, null, { timeout: 5000 });
    await composer.press('z');
    assert.equal(await page.evaluate(() => window.__ovyxAssistantTypingKeyBubbles), 0,
      `[${target.name}] assistant typing must not bubble into dashboard keyboard shortcuts`);

    await page.evaluate(() => {
      document.getElementById('test-typing-dock-shell')?.classList.replace('opaque-static', 'opaque-9c');
    });
    await page.waitForFunction(() => {
      const dock = document.getElementById('test-typing-dock-shell');
      return dock?.classList.contains('ovyx-native-underlying-bottom-nav-suppressed') &&
        getComputedStyle(dock).display === 'none' && getComputedStyle(dock).visibility === 'hidden';
    }, null, { timeout: 5000 });
    await composer.fill('');
    await composer.evaluate(node => node.blur());

    // Some production layouts show the assistant panel without the native
    // workspace class. Its visible state must still keep the dock suppressed.
    await page.evaluate(() => {
      const activePanel = document.getElementById('kernel-brain-bot-panel');
      activePanel?.classList.remove('ovyx-native-workspace');
      document.getElementById('bot-chat-input')?.blur();
    });
    await page.waitForFunction(() => {
      const nav = document.getElementById('test-floating-shell');
      const activePanel = document.getElementById('kernel-brain-bot-panel');
      return activePanel && getComputedStyle(activePanel).display !== 'none' &&
        getComputedStyle(activePanel).visibility !== 'hidden' &&
        nav?.classList.contains('ovyx-native-underlying-bottom-nav-suppressed') &&
        getComputedStyle(nav).display === 'none';
    }, null, { timeout: 5000 });
    if (target.name === 'mobile') {
      await page.waitForFunction(() => {
        const nav = document.getElementById('test-floating-shell');
        return nav?.classList.contains('ovyx-native-underlying-bottom-nav-suppressed') &&
          getComputedStyle(nav).display === 'none' && getComputedStyle(nav).visibility === 'hidden' &&
          (!document.getElementById('test-keyboard-floating-shell') || (
            document.getElementById('test-keyboard-floating-shell').classList.contains('ovyx-native-underlying-bottom-nav-suppressed') &&
            getComputedStyle(document.getElementById('test-keyboard-floating-shell')).display === 'none' &&
            getComputedStyle(document.getElementById('test-keyboard-floating-shell')).visibility === 'hidden'
          ));
      }, null, { timeout: 5000 });
      assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('test-floating-shell')).display), 'none',
        '[mobile] dashboard navigation must stay suppressed until the full-screen assistant closes');
      assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('test-keyboard-floating-shell')).display), 'none',
        '[mobile] dock at the shrunken visual viewport bottom must stay hidden when the keyboard is open');
    } else {
      await page.waitForFunction(() => {
        const nav = document.getElementById('test-floating-shell');
        return nav?.classList.contains('ovyx-native-underlying-bottom-nav-suppressed') &&
          getComputedStyle(nav).display === 'none' && getComputedStyle(nav).visibility === 'hidden' &&
          (!document.getElementById('test-keyboard-floating-shell') || (
            document.getElementById('test-keyboard-floating-shell').classList.contains('ovyx-native-underlying-bottom-nav-suppressed') &&
            getComputedStyle(document.getElementById('test-keyboard-floating-shell')).display === 'none' &&
            getComputedStyle(document.getElementById('test-keyboard-floating-shell')).visibility === 'hidden'
          ));
      }, null, { timeout: 5000 });
      assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('test-floating-shell')).display), 'none',
        '[desktop] dashboard bottom dock must stay hidden for the full assistant session, not just while typing');
    }
    await page.evaluate(() => {
      document.getElementById('test-floating-shell')?.remove();
      document.getElementById('test-keyboard-floating-shell')?.remove();
      // Keep the style sheet alive until class/style mutation and file-upload checks finish.
      const descriptor = window.__ovyxTestVisualViewportDescriptor;
      if (descriptor) Object.defineProperty(window, 'visualViewport', descriptor);
      else delete window.visualViewport;
      delete window.__ovyxTestVisualViewportDescriptor;
    });

    const attachButton = panel.locator('[data-ovyx-native-attach]');
    const attachmentInput = panel.locator('#ovyx-native-attachment-input');
    assert.equal(await attachButton.isVisible(), true, '[' + target.name + '] native assistant should expose a real attach-files control.');
    assert.notEqual(await attachmentInput.getAttribute('multiple'), null, '[' + target.name + '] file picker should accept multiple files.');
    assert.equal(await attachmentInput.getAttribute('accept'), null, '[' + target.name + '] file picker must not be restricted to one media type.');

    // Exercise a real file selection, then make another generic node dock at
    // the bottom as upload UI state changes. Both mutation paths must be caught.
    await page.evaluate(() => {
      const dock = document.createElement('div');
      dock.id = 'test-upload-dock-shell';
      dock.className = 'opaque-static';
      document.body.appendChild(dock);
    });
    await attachmentInput.setInputFiles({
      name: 'ovyx-dock-shield-check.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('OVYX assistant dock regression check.'),
    });
    await panel.locator('.ovyx-native-attachment-name').filter({ hasText: 'ovyx-dock-shield-check.txt' }).waitFor({ state: 'visible' });
    await page.evaluate(() => {
      document.getElementById('test-upload-dock-shell')?.classList.replace('opaque-static', 'opaque-9c');
    });
    await page.waitForFunction(() => {
      const typingDock = document.getElementById('test-typing-dock-shell');
      const uploadDock = document.getElementById('test-upload-dock-shell');
      return [typingDock, uploadDock].every(dock => dock?.classList.contains('ovyx-native-underlying-bottom-nav-suppressed') &&
        getComputedStyle(dock).display === 'none' && getComputedStyle(dock).visibility === 'hidden');
    }, null, { timeout: 5000 });
    const trigger = panel.locator('[data-ovyx-native-more]');
    const menu = panel.locator('.ovyx-native-menu');
    await trigger.click();
    assert.equal(await menu.isVisible(), true, `[${target.name}] three-dots menu did not open`);
    assert.deepEqual(
      await menu.locator('[data-ovyx-native-action]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-ovyx-native-action'))),
      expectedActions,
      `[${target.name}] assistant workspace menu actions are missing, duplicated or in the wrong order`,
    );

    await menu.locator('[data-ovyx-native-action="review-ai-edits"]').click();
    assert.equal(await menu.isVisible(), false, `[${target.name}] menu should close after selecting edit history`);
    const historyReply = page.locator('#bot-chat-history .ovyx-native-message-body').last();
    await historyReply.waitFor({ state: 'visible' });
    assert.match(await historyReply.innerText(), /recovery|project|sign in|history/i, `[${target.name}] edit-history action did not return a useful status`);
    assert.match(await panel.locator('#bot-context-node-type').innerText(), /More details needed|Action could not be completed|Workspace reviewed|Workspace details ready/i);

    await trigger.click();
    await menu.locator('[data-ovyx-native-action="undo-last-ai-edit"]').click();
    const undoReply = page.locator('#bot-chat-history .ovyx-native-message-body').last();
    await undoReply.waitFor({ state: 'visible' });
    assert.match(await undoReply.innerText(), /undo|recovery|project|sign in/i, `[${target.name}] undo action did not explain its outcome`);

    await trigger.click();
    await menu.locator('[data-ovyx-native-action="help"]').click();
    const helpReply = page.locator('#bot-chat-history .ovyx-native-message-body').last();
    await helpReply.waitFor({ state: 'visible' });
    assert.match(await helpReply.innerText(), /OVYX AI can inspect the workspace snapshot/i);
    assert.ok(await panel.locator('.ovyx-native-response-avatar').count(), `[${target.name}] premium assistant response avatar is missing`);
    const helpMessage = page.locator('#bot-chat-history .ovyx-native-message.is-assistant').last();
    assert.deepEqual(
      await helpMessage.locator('[data-ovyx-native-response-action]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-ovyx-native-response-action'))),
      ['copy', 'helpful', 'not-helpful', 'retry'],
      `[${target.name}] every native assistant response needs Copy/Helpful/Not helpful/Retry actions`,
    );
    // Keep the feedback persistence boundary deterministic in this browser
    // regression. The support handoff is the behavior under test; the API
    // contract and persistence failure paths are covered by their own suites.
    // The shell may retain a prior editable Support draft. Clear only the
    // standalone form fields so this test verifies that the feedback action
    // populates a fresh draft without overwriting user-entered content.
    await page.evaluate(() => {
      const subject = document.querySelector('#view-support #ovyx-help-support-subject');
      const message = document.querySelector('#view-support #ovyx-help-support-message');
      if (subject) subject.value = '';
      if (message) message.value = '';
    });
    await page.route('**/api/ai/feedback', async route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, saved: true }),
    }));
    // Persist the intended destination before the asynchronous feedback
    // handoff. The late shell route-restoration controller must not send the
    // mobile test back Home while the Support draft is being populated.
    await page.evaluate(() => {
      let session = {};
      try { session = JSON.parse(localStorage.getItem('ovyx.runtime.session.v4') || '{}'); } catch (_) {}
      localStorage.setItem('ovyx.runtime.route.v18', 'support');
      localStorage.setItem('ovyx.settings.last-view.v1', 'support');
      localStorage.setItem('ovyx.runtime.session.v4', JSON.stringify({ ...session, route: 'support' }));
    });
    await helpMessage.locator('[data-ovyx-native-response-action="not-helpful"]').click();
    await page.locator('#view-support').waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('#view-support #ovyx-help-support-form').waitFor({ state: 'visible', timeout: 20000 });
    // Route activation and form relocation can finish before the asynchronous
    // feedback handoff populates the editable draft, especially on mobile.
    // Wait for the actual user-visible draft rather than racing its assignment.
    try {
      await page.waitForFunction(() => {
            const subject = document.querySelector('#view-support #ovyx-help-support-subject');
            const message = document.querySelector('#view-support #ovyx-help-support-message');
            return /Assistant response was not helpful/i.test(subject?.value || '') &&
              /What went wrong\?/i.test(message?.value || '');
          }, null, { timeout: 45000 });
    } catch (error) {
      const handoff = await page.evaluate(() => {
        const form = document.querySelector('#view-support #ovyx-help-support-form');
        return {
          activeView: window.KernelState?.activeView || null,
          supportVisible: !!document.querySelector('#view-support:not(.hidden)'),
          formExists: !!form,
          formReady: form?.getAttribute('data-ovyx-support-form-ready') || null,
          subject: document.querySelector('#view-support #ovyx-help-support-subject')?.value || null,
          message: document.querySelector('#view-support #ovyx-help-support-message')?.value || null,
          ensureHook: typeof window.OVYXEnsureSupportForm,
          mountHook: typeof window.OVYXMountHelpSupportForm,
          assistantRuntime: typeof window.WorkspaceBrainBot,
        };
      }).catch(cause => ({ diagnosticError: String(cause?.message || cause) }));
      console.error(`[${target.name}] Assistant support handoff diagnostic: ${JSON.stringify({ handoff, pageErrors: bootstrapErrors.slice(-30) })}`);
      throw error;
    }
    assert.equal(await page.evaluate(() => window.KernelState?.activeView), 'support',
      `[${target.name}] assistant feedback must route to the dedicated Support page`);
    assert.match(await page.locator('#view-support #ovyx-help-support-subject').inputValue(), /Assistant response was not helpful/i,
      `[${target.name}] thumbs-down should prepare an editable Contact Support subject`);
    assert.match(await page.locator('#view-support #ovyx-help-support-message').inputValue(), /What went wrong\?/i,
      `[${target.name}] thumbs-down should prepare an editable Contact Support draft`);

    await trigger.click();
    await menu.locator('[data-ovyx-native-action="new-chat"]').click();
    await page.locator('#bot-chat-history').getByText('Welcome to OVYX AI').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#bot-chat-history .ovyx-native-message').count(), 0, `[${target.name}] New Chat did not clear the visible conversation`);

    // Exercise the real browser-side agent loop with authenticated endpoint
    // responses mocked at the network boundary. The server persistence contract
    // is tested separately against mocked Firestore in the integration suite.
    const originalSource = "export function toggleMobileMenu(button, menu) { menu.hidden = !menu.hidden; button.setAttribute('aria-expanded', String(!menu.hidden)); }\n";
    const repairedSource = "export function toggleMobileMenu(button, menu) { menu.hidden = !menu.hidden; button.setAttribute('aria-expanded', String(!menu.hidden)); menu.classList.toggle('is-open', !menu.hidden); }\n";
    const workspaceCalls = [];
    const aiPayloads = [];
    const snapshotProject = {
      id: 'project_123',
      name: 'Assistant browser-loop test project',
      description: 'A fixture for the native assistant tool loop.',
      status: 'draft',
      revision: 'revision-1',
      pageCount: 1,
      fileCount: 1,
      files: [{ path: 'src/menu.js', size: originalSource.length, content: originalSource, contentComplete: true }],
      pages: [{ id: 'home', name: 'Home', slug: '/', sectionsCount: 2 }],
    };

    await page.route('**/api/ai/workspace-tools', async route => {
      const request = route.request();
      const payload = request.postDataJSON();
      workspaceCalls.push(payload);
      let responseBody;
      if (payload.operation === 'snapshot') {
        responseBody = {
          ok: true,
          operation: 'snapshot',
          projects: [{ id: 'project_123', name: snapshotProject.name, status: 'draft', pageCount: 1, fileCount: 1 }],
          activeProject: snapshotProject,
          source: 'firestore-owned-project-document',
        };
      } else if (payload.operation === 'diagnose') {
        responseBody = {
          ok: true,
          operation: 'diagnose',
          project: { id: 'project_123', name: snapshotProject.name, status: 'draft', revision: 'revision-1', pageCount: 1, fileCount: 1 },
          diagnostics: { projectId: 'project_123', projectName: snapshotProject.name, checkedPages: 1, checkedFiles: 1, issueCount: 0, issues: [], note: 'Mocked static diagnostics only.' },
          source: 'firestore-owned-project-document',
        };
      } else if (payload.operation === 'search') {
        responseBody = {
          ok: true,
          operation: 'search',
          projectId: 'project_123',
          projectName: snapshotProject.name,
          query: 'toggleMobileMenu',
          queries: Array.isArray(payload.queries) ? payload.queries : [],
          count: 4,
          totalMatches: 4,
          filesSearched: 176,
          matchedFileCount: 1,
          inventoryTruncated: false,
          resultsTruncated: false,
          byQuery: [
            {
              query: 'toggleMobileMenu',
              count: 1,
              matchedFileCount: 1,
              resultsTruncated: false,
              matches: [{ query: 'toggleMobileMenu', path: 'src/menu.js', position: 14, matchType: 'content', snippet: originalSource.slice(0, 80) }],
            },
            {
              query: 'aria-expanded',
              count: 1,
              matchedFileCount: 1,
              resultsTruncated: false,
              matches: [{ query: 'aria-expanded', path: 'src/menu.js', position: 82, matchType: 'content', snippet: originalSource.slice(55, 140) }],
            },
            {
              query: 'hidden',
              count: 2,
              matchedFileCount: 1,
              resultsTruncated: false,
              matches: [
                { query: 'hidden', path: 'src/menu.js', position: 68, matchType: 'content', snippet: originalSource.slice(40, 110) },
                { query: 'hidden', path: 'src/menu.js', position: 79, matchType: 'content', snippet: originalSource.slice(65, 150) },
              ],
            },
          ],
          matches: [
            { query: 'toggleMobileMenu', path: 'src/menu.js', position: 14, matchType: 'content', snippet: originalSource.slice(0, 80) },
            { query: 'aria-expanded', path: 'src/menu.js', position: 82, matchType: 'content', snippet: originalSource.slice(55, 140) },
            { query: 'hidden', path: 'src/menu.js', position: 68, matchType: 'content', snippet: originalSource.slice(40, 110) },
            { query: 'hidden', path: 'src/menu.js', position: 79, matchType: 'content', snippet: originalSource.slice(65, 150) },
          ],
          revision: 'revision-1',
        };
      } else if (payload.operation === 'read_file') {
        responseBody = {
          ok: true,
          operation: 'read_file',
          projectId: 'project_123',
          projectName: snapshotProject.name,
          revision: 'revision-1',
          source: 'firestore-owned-project-file',
          file: { path: 'src/menu.js', size: originalSource.length, content: originalSource, contentComplete: true, truncated: false, secretValuesRedacted: false, note: 'Complete mock source.' },
        };
      } else if (payload.operation === 'prepare_patch') {
        responseBody = {
          ok: true,
          operation: 'prepare_patch',
          projectId: 'project_123',
          projectName: snapshotProject.name,
          filePath: 'src/menu.js',
          bucket: 'ovyxGraph.files',
          revision: 'revision-1',
          changed: true,
          linesAdded: 1,
          linesRemoved: 0,
          preview: '- old menu handler\n+ menu handler preserves accessible state and exposes the open class',
          approvalRequired: true,
          note: 'Preview mode: no app files have been changed.',
        };
      } else if (payload.operation === 'apply_patch') {
        responseBody = {
          ok: true,
          operation: 'apply_patch',
          projectId: 'project_123',
          projectName: snapshotProject.name,
          filePath: 'src/menu.js',
          bucket: 'ovyxGraph.files',
          changed: true,
          verified: true,
          revisionId: 'test-revision-1',
          previousRevision: 'revision-1',
          revision: 'revision-2',
          diagnostics: { issueCount: 0, issues: [] },
          project: { id: 'project_123', name: snapshotProject.name, revision: 'revision-2', pageCount: 1, fileCount: 1, files: [{ path: 'src/menu.js', size: repairedSource.length }] },
          message: 'The saved project source was updated and read back successfully.',
        };
      } else {
        responseBody = { ok: false, code: 'UNEXPECTED_TEST_OPERATION', error: 'Unexpected workspace operation in browser-loop test.' };
      }
      await route.fulfill({ status: responseBody.ok ? 200 : 400, contentType: 'application/json', body: JSON.stringify(responseBody) });
    });

    await page.route('**/api/ai/ovyx', async route => {
      const payload = route.request().postDataJSON();
      aiPayloads.push(payload);
      const callNumber = aiPayloads.length;
      let responseBody;
      if (callNumber === 1) {
        responseBody = {
          ok: true,
          text: 'I will search related menu symbols and accessibility state across the saved project before selecting source to inspect.',
          actions: [{
            type: 'workspace_search',
            projectId: 'project_123',
            queries: ['toggleMobileMenu', 'aria-expanded', 'hidden'],
          }],
          provider: 'ovyx-native',
        };
      } else if (callNumber === 2) {
        responseBody = {
          ok: true,
          text: 'The search found the menu visibility handler and its ARIA state in src/menu.js. I will read the exact saved file before recommending a repair.',
          actions: [{ type: 'workspace_read_file', projectId: 'project_123', filePath: 'src/menu.js' }],
          provider: 'ovyx-native',
        };
      } else if (callNumber === 3) {
        responseBody = {
          ok: true,
          text: 'The saved handler toggles the hidden state but does not expose an open class for the mobile-menu styling. I have prepared a minimal repair.',
          actions: [{
            type: 'workspace_patch',
            projectId: 'project_123',
            filePath: 'src/menu.js',
            content: repairedSource,
            reason: 'Keep the menu visibility and ARIA state aligned while exposing the open class used by mobile styling.',
          }],
          provider: 'ovyx-native',
        };
      } else {
        responseBody = { ok: true, text: 'The authenticated workspace evidence is available.', actions: [], provider: 'ovyx-native' };
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(responseBody) });
    });

    await page.evaluate(() => {
      const state = window.KernelState || (window.KernelState = {});
      const project = {
        id: 'project_123',
        name: 'Assistant browser-loop test project',
        status: 'draft',
        ovyxGraph: { files: { 'src/menu.js': { type: 'text/javascript', content: "export function toggleMobileMenu(button, menu) { menu.hidden = !menu.hidden; button.setAttribute('aria-expanded', String(!menu.hidden)); }\n" } } },
      };
      state.activeProject = project;
      state.projects = [project];
      // Simulate a slow optional scan; the assistant must still use the local
      // snapshot and continue to the authenticated saved-project tools.
      window.OVYXWorkspaceCopilot = {
        async scan() { throw new Error('simulated context scan failure'); },
        diagnose() { return null; },
      };
      const fakeUser = { uid: 'owner-uid', email: 'owner@example.test', async getIdToken() { return 'mock-browser-loop-token'; } };
      const firebase = window.firebase || {};
      try {
        firebase.auth = () => ({ currentUser: fakeUser });
        window.firebase = firebase;
      } catch (_) {
        Object.defineProperty(window, 'firebase', { configurable: true, value: { auth: () => ({ currentUser: fakeUser }) } });
      }
    });

    page.once('dialog', async dialog => {
      assert.match(dialog.message(), /src\/menu\.js/i, `[${target.name}] approval dialog must identify the exact source file`);
      assert.match(dialog.message(), /Apply this change/i, `[${target.name}] source writes must require explicit approval`);
      await dialog.accept();
    });
    await page.locator('#bot-chat-input').fill('Search my project deeply for the mobile menu, study related source, and fix it');
    await attachmentInput.setInputFiles([
      {
        name: 'assistant-reference.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('ATTACHMENT_CONTEXT_SENTINEL\nPlease keep the file handoff truthful and preserve relevant project details.\napi_key=ATTACHMENT_SECRET_SHOULD_NOT_REACH_MODEL'),
      },
      {
        name: 'assistant-reference.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4\\nbinary-file-fixture\\n%%EOF'),
      },
    ]);
    const attachmentStrip = panel.locator('.ovyx-native-attachments');
    await attachmentStrip.waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const strip = document.querySelector('#kernel-brain-bot-panel .ovyx-native-attachments');
      return strip && strip.querySelectorAll('.ovyx-native-attachment').length === 2 &&
        strip.textContent.includes('Text ready') && strip.textContent.toLowerCase().includes('metadata only');
    }, null, { timeout: 10000 });
    await page.locator('[data-ovyx-native-send]').click();
    await page.getByText(/The saved change was verified/i).waitFor({ state: 'visible', timeout: 20000 });
    const savedCopy = await page.getByText(/The saved change was verified/i).innerText();
    assert.doesNotMatch(savedCopy, /server read-back verification/i, '[' + target.name + '] user-facing save feedback must avoid implementation-level wording');

    const activity = panel.locator('.ovyx-native-activity');
    // data-stage belongs to the activity card itself, not a nested child.
    await activity.waitFor({ state: 'attached', timeout: 5000 });
    await page.locator('.ovyx-native-activity[data-completed="true"]').waitFor({ state: 'visible', timeout: 5000 });
    const activityText = await activity.evaluate(node => String(node.textContent || ''));
    assert.ok(activityText.toLowerCase().includes('searching saved project source for'), '[' + target.name + '] the activity card must visibly show that a project search is running');
    assert.ok(activityText.includes('toggleMobileMenu') && activityText.includes('aria-expanded'), '[' + target.name + '] the activity card must name the actual search terms');
    assert.match(activityText, /Search complete: 4 match\(es\).*checked 176 source file\(s\)/i, '[' + target.name + '] activity must report actual search counts and searched-file coverage');
    assert.ok(activityText.toLowerCase().includes('reading src/menu.js') || activityText.toLowerCase().includes('reading src\\menu.js'), '[' + target.name + '] the assistant activity card must show the inspected file path');
    assert.ok(activityText.toLowerCase().includes('read src/menu.js completely') || activityText.toLowerCase().includes('read src\\menu.js completely'), '[' + target.name + '] the activity trace must describe the actual source-read outcome');
    assert.match(activityText, /Response ready/i, '[' + target.name + '] the activity card must show a finished state rather than a stuck spinner');

    assert.deepEqual(
      workspaceCalls.map(call => call.operation),
      ['snapshot', 'diagnose', 'search', 'read_file', 'prepare_patch', 'apply_patch'],
      `[${target.name}] the assistant must execute the owned-project read and approved-write workflow in order`,
    );
    assert.equal(workspaceCalls.at(-1).confirm, true, `[${target.name}] apply_patch must carry explicit approval`);
    assert.equal(workspaceCalls.at(-1).expectedUpdateTime, 'revision-1', `[${target.name}] write must be tied to the preview revision`);
    assert.equal(aiPayloads.length, 3, `[${target.name}] the native model should reason again after search findings and source contents are returned`);
    const attachedReferenceContext = aiPayloads[0]?.context?.userAttachments || [];
    assert.equal(attachedReferenceContext.length, 2, '[' + target.name + '] submitted AI request must carry both selected file references.');
    assert.equal(attachedReferenceContext[0]?.name, 'assistant-reference.md', '[' + target.name + '] extracted text should keep its original filename.');
    assert.match(attachedReferenceContext[0]?.readableText || '', /ATTACHMENT_CONTEXT_SENTINEL/, '[' + target.name + '] readable text files must reach native AI context.');
    assert.match(attachedReferenceContext[0]?.readableText || '', /api_key=\[REDACTED\]/, '[' + target.name + '] credential-like attachment values must be masked before reaching the model.');
    assert.doesNotMatch(attachedReferenceContext[0]?.readableText || '', /ATTACHMENT_SECRET_SHOULD_NOT_REACH_MODEL/, '[' + target.name + '] raw credential-like attachment values must not reach the model.');
    assert.equal(attachedReferenceContext[1]?.name, 'assistant-reference.pdf', '[' + target.name + '] binary file metadata should keep its filename.');
    assert.equal(attachedReferenceContext[1]?.readableText, null, '[' + target.name + '] assistant must not invent extracted PDF text.');
    assert.match(attachedReferenceContext[1]?.status || '', /metadata only/i, '[' + target.name + '] unsupported binary contents must be marked transparently.');
    assert.deepEqual(workspaceCalls.find(call => call.operation === 'search')?.queries,
      ['toggleMobileMenu', 'aria-expanded', 'hidden'],
      `[${target.name}] the assistant should request multiple related literal search terms in one tool call`);
    const searchRoundResults = aiPayloads[1]?.context?.workspaceToolResults || [];
    const searchEvidence = searchRoundResults.find(item => item.type === 'workspace_search' && item.ok === true);
    assert.ok(searchEvidence, `[${target.name}] the actual search response must be fed back into the next model round`);
    assert.equal(searchEvidence.result?.filesSearched, 176, `[${target.name}] AI context must preserve searched-file coverage`);
    assert.equal(searchEvidence.result?.totalMatches, 4, `[${target.name}] AI context must preserve the aggregate search result count`);
    assert.ok(searchEvidence.result?.matches?.some(match => match.path === 'src/menu.js' && match.matchType === 'content'),
      `[${target.name}] AI context must include evidence-backed source matches, not only summary counts`);
    const toolResults = aiPayloads[2]?.context?.workspaceToolResults || [];
    assert.ok(toolResults.some(item => item.type === 'workspace_search' && item.ok === true),
      `[${target.name}] prior search findings must remain available after reading the exact file`);
    assert.ok(toolResults.some(item => item.type === 'workspace_read_file' && item.ok === true && item.result?.file?.content === originalSource),
      `[${target.name}] actual saved source must be fed back to the model before it proposes a patch`);
    assert.match(aiPayloads[0]?.context?.contextWarning || '', /optional live workspace scan/i,
      `[${target.name}] failed context scans must preserve a clear fallback warning`);
    const finalStatus = await panel.locator('#bot-context-node-type').innerText();
    assert.match(finalStatus, /Changes saved and verified/i, `[${target.name}] status must distinguish a verified saved write`);
    const updatedLocalSource = await page.evaluate(() => window.KernelState.activeProject.ovyxGraph.files['src/menu.js'].content);
    assert.equal(updatedLocalSource, repairedSource, `[${target.name}] verified source must be reflected back into the active local workspace`);
    assert.deepEqual(errors, [], `[${target.name}] assistant runtime errors: ${errors.join('; ')}`);

    if (target.name === 'mobile') {
      // Closing the assistant must restore the Home dock after its temporary
      // inline styles have been released.
      await page.evaluate(() => window.WorkspaceBrainBot.close());
      await page.waitForFunction(() => {
        const dock = document.getElementById('ovyx-v52-bottom-bar');
        const assistant = document.getElementById('kernel-brain-bot-panel');
        const viewport = document.getElementById('view-router-viewport');
        if (!dock || !assistant || !viewport || getComputedStyle(assistant).display !== 'none') return false;
        const route = String(window.KernelState?.activeView || '').replace(/^view-/, '').toLowerCase();
        const visibleSections = Array.from(viewport.children).filter(section =>
          section.tagName === 'SECTION' && /^view-[a-z0-9-]+$/i.test(section.id || '') &&
          !section.hidden && getComputedStyle(section).display !== 'none' &&
          getComputedStyle(section).visibility !== 'hidden' && section.getClientRects().length > 0
        );
        const isDashboard = route === 'home' && visibleSections.length === 1 &&
          visibleSections[0].id === 'view-home';
        window.OVYXDashboardNavigationAuthority?.sync();
        return getComputedStyle(dock).display === (isDashboard ? 'grid' : 'none');
      }, null, { timeout: 8000 });
    }

    if (target.name === 'mobile') {
      // The dock belongs to Home only. Exercise the legacy direct-mount path,
      // then keep it stable while the route and accessibility metadata disagree.
      for (const route of ['projects', 'webstudio', 'settings', 'home', 'projects', 'home']) {
        await page.evaluate(nextRoute => window.switchView(nextRoute), route);
        await page.waitForFunction(expected => {
          const dock = document.getElementById('ovyx-v52-bottom-bar');
          const active = String(window.KernelState?.activeView || '').replace(/^view-/, '').toLowerCase();
          const expectedDisplay = expected === 'home' ? 'grid' : 'none';
          return dock && active === expected && getComputedStyle(dock).display === expectedDisplay;
        }, route, { timeout: 8000 });
        await page.waitForTimeout(120);
        const display = await page.locator('#ovyx-v52-bottom-bar').evaluate(node => getComputedStyle(node).display);
        assert.equal(display, route === 'home' ? 'grid' : 'none',
          `[mobile] dashboard dock changed visibility unexpectedly after navigating to ${route}`);
      }

      await page.evaluate(() => {
        const home = document.getElementById('view-home');
        if (home) home.setAttribute('aria-hidden', 'true');
      });
      await page.waitForTimeout(160);
      assert.equal(await page.locator('#ovyx-v52-bottom-bar').evaluate(node => getComputedStyle(node).display), 'grid',
        '[mobile] stale aria-hidden=true must not hide the actually visible Home dashboard dock');

      await page.evaluate(() => {
        window.switchView('projects');
        const home = document.getElementById('view-home');
        if (home) home.setAttribute('aria-hidden', 'false');
      });
      await page.waitForFunction(() => getComputedStyle(document.getElementById('ovyx-v52-bottom-bar')).display === 'none',
        null, { timeout: 8000 });
      await page.waitForTimeout(160);
      assert.equal(await page.locator('#ovyx-v52-bottom-bar').evaluate(node => getComputedStyle(node).display), 'none',
        '[mobile] stale aria-hidden=false on a hidden Home section must not reveal the dock outside Home');

      await page.evaluate(() => window.switchView('home'));
      await page.waitForFunction(() => getComputedStyle(document.getElementById('ovyx-v52-bottom-bar')).display === 'grid',
        null, { timeout: 8000 });
    }

    // Help Centre and standalone Contact Support must share one native AI
    // experience while preserving the existing multipart support-ticket flow.
    await page.evaluate(() => window.Router.go('faq'));
    await page.locator('#ovyx-help-centre-intro').waitFor({ state: 'visible', timeout: 20000 });
    const helpPageState = await page.evaluate(() => {
      const faq = document.getElementById('view-faq');
      const search = faq?.querySelector('.ovyx-help-top');
      const popular = faq?.querySelector('.ovyx-help-popular')?.parentElement;
      const staticFaq = faq?.querySelector('#ovyx-help-faq-list')?.closest('.ovyx-help-section');
      const quickHelp = faq?.querySelector('#help-shortcuts')?.closest('aside');
      return {
        searchHidden: !!search?.hidden,
        popularHidden: !!popular?.hidden,
        faqHidden: !!staticFaq?.hidden,
        quickHelpVisible: !!quickHelp && !quickHelp.hidden,
      };
    });
    assert.equal(helpPageState.searchHidden, true, '[' + target.name + '] the old FAQ search must not compete with OVYX AI.');
    assert.equal(helpPageState.popularHidden, true, '[' + target.name + '] static FAQ category cards must be secondary/hidden.');
    assert.equal(helpPageState.faqHidden, true, '[' + target.name + '] static FAQ answers must not create a second answer destination.');
    assert.equal(helpPageState.quickHelpVisible, true, '[' + target.name + '] non-answer quick actions should remain available.');
    const contactSupportButton = page.locator('#ovyx-help-centre-intro').getByRole('button', { name: 'Contact OVYX Support' });
    await contactSupportButton.waitFor({ state: 'visible', timeout: 20000 });
    // The assistant feedback draft scrolls the support page smoothly. Dispatch
    // the actual button click after the Help Centre is visible rather than
    // requiring Playwright's pointer-stability heuristic during that motion.
    await contactSupportButton.evaluate(button => button.click());
    await page.locator('#view-support #ovyx-help-support-form').waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForFunction(() => {
      const forms = Array.from(document.querySelectorAll('#ovyx-help-support-form'));
      return forms.length === 1 && document.querySelector('#view-support #ovyx-help-support-form') === forms[0] &&
        !document.querySelector('#view-faq #ovyx-help-support-form');
    }, null, { timeout: 10000 });
    const supportPageState = await page.evaluate(() => ({
      active: window.KernelState?.activeView,
      supportVisible: !document.getElementById('view-support')?.classList.contains('hidden'),
      formInSupport: !!document.querySelector('#view-support #ovyx-help-support-form'),
      formStillInHelp: !!document.querySelector('#view-faq #ovyx-help-support-form'),
      formCount: document.querySelectorAll('#ovyx-help-support-form').length,
      assistantAvailable: typeof window.WorkspaceBrainBot?.open === 'function',
    }));
    assert.equal(supportPageState.active, 'support', '[' + target.name + '] Contact Support must use its own route.');
    assert.equal(supportPageState.supportVisible, true, '[' + target.name + '] standalone support page must be visible.');
    assert.equal(supportPageState.formInSupport, true, '[' + target.name + '] existing support form must be moved into the standalone page.');
    assert.equal(supportPageState.formStillInHelp, false, '[' + target.name + '] support form must not remain embedded in the Help Centre.');
    assert.equal(supportPageState.formCount, 1, '[' + target.name + '] Help Centre lifecycle must not leave duplicate support forms.');
    assert.equal(supportPageState.assistantAvailable, true, '[' + target.name + '] Help Centre must reuse the existing OVYX AI.');
    // The legacy shell may re-run its mount hook after the original form has
    // moved to Support. That must remain globally idempotent and not create a
    // second form that races the Assistant feedback handoff.
    await page.evaluate(() => window.OVYXMountHelpSupportForm?.(document.getElementById('view-faq')));
    assert.equal(await page.locator('#ovyx-help-support-form').count(), 1,
      '[' + target.name + '] rerunning the legacy mount hook must not duplicate the moved Support form.');
    assert.equal(await page.locator('#view-support #ovyx-help-support-subject').count(), 1,
      '[' + target.name + '] the moved Support form must retain its editable subject field.');
    assert.equal(await page.locator('#view-support #ovyx-help-support-message').count(), 1,
      '[' + target.name + '] the moved Support form must retain its editable message field.');

    // The visible Help / FAQ navigation entry must bypass the Help Centre
    // and open only the standalone Contact OVYX Support form.
    await page.evaluate(() => window.Router.go('home'));
    await page.waitForFunction(() => window.KernelState?.activeView === 'home', null, { timeout: 10000 });
    await page.evaluate(() => {
      const helpButton = Array.from(document.querySelectorAll('button'))
        .find(button => /Help(?:\\s*\\/\\s*FAQ)?/i.test(button.textContent || '') &&
          (String(button.getAttribute('onclick') || '').includes("Router.go('faq')") ||
            button.getAttribute('data-v52-account') === 'help'));
      if (!helpButton) throw new Error('The existing Help / FAQ navigation button was not found.');
      helpButton.click();
    });
    await page.waitForFunction(() => window.KernelState?.activeView === 'support', null, { timeout: 15000 });
    await page.locator('#view-support #ovyx-help-support-form').waitFor({ state: 'visible', timeout: 15000 });
    const helpEntryState = await page.evaluate(() => ({
      active: window.KernelState?.activeView,
      formVisible: !!document.querySelector('#view-support #ovyx-help-support-form'),
      helpPageVisible: !!document.querySelector('#view-faq:not(.hidden)'),
      extraHeader: !!document.querySelector('#view-support .ovyx-support-page-head'),
      extraNote: !!document.querySelector('#view-support .ovyx-support-page-note'),
      backAction: !!document.querySelector('#view-support [data-ovyx-support-back]'),
      aiAction: !!document.querySelector('#view-support [data-ovyx-support-ai]'),
      formCount: document.querySelectorAll('#ovyx-help-support-form').length,
    }));
    assert.equal(helpEntryState.active, 'support', '[' + target.name + '] Help navigation must open the standalone Support route.');
    assert.equal(helpEntryState.formVisible, true, '[' + target.name + '] Help navigation must show the full Contact Support form.');
    assert.equal(helpEntryState.helpPageVisible, false, '[' + target.name + '] Help Centre must not remain visible behind the form.');
    assert.equal(helpEntryState.extraHeader, false, '[' + target.name + '] Support route must not show an extra page header.');
    assert.equal(helpEntryState.extraNote, false, '[' + target.name + '] Support route must not show extra help copy or panels.');
    assert.equal(helpEntryState.backAction, false, '[' + target.name + '] Support route must not show a Back to Help action.');
    assert.equal(helpEntryState.aiAction, false, '[' + target.name + '] Support route must not show a separate AI action.');
    assert.equal(helpEntryState.formCount, 1, '[' + target.name + '] Help navigation must preserve exactly one canonical support form.');

    let supportRequest = null;
    await page.route('**/api/support', async route => {
      supportRequest = route.request();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          ticket: { ticketId: 'OVYX-BROWSER123', status: 'open', notificationStatus: 'sent', attachmentCount: 1 },
        }),
      });
    });
    await page.locator('#view-support #ovyx-help-support-subject').fill('Support browser regression');
    await page.locator('#view-support #ovyx-help-support-message').fill('Please review this test report and its attached evidence.');
    // The account fixture is intentionally switched to owner@example.test during the assistant workflow.
    // Submit using that authenticated address; production correctly rejects a mismatched email.
    await page.locator('#view-support #ovyx-help-support-email').fill('owner@example.test');
    await page.locator('#view-support #ovyx-help-support-attachments').setInputFiles({
      name: 'support-evidence.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('OVYX support attachment fixture'),
    });
    // The shell's scrollable viewport can still be settling after the
    // assistant draft focus/route transition; dispatch the real submit-button
    // click without relying on Playwright's scroll-into-view pointer heuristic.
    await page.locator('#view-support #ovyx-help-support-submit').evaluate(button => button.click());
    try {
      await page.waitForFunction(() => /OVYX-BROWSER123/.test(document.getElementById('ovyx-help-support-status')?.textContent || ''), null, { timeout: 15000 });
    } catch (error) {
      const diagnostic = await page.evaluate(() => {
        const form = document.getElementById('ovyx-help-support-form');
        const user = window.firebase?.auth?.()?.currentUser || null;
        const subject = document.getElementById('ovyx-help-support-subject');
        const message = document.getElementById('ovyx-help-support-message');
        const email = document.getElementById('ovyx-help-support-email');
        const submit = document.getElementById('ovyx-help-support-submit');
        return {
          activeRoute: window.KernelState?.activeView,
          formTag: form?.tagName || null,
          formConnected: !!form?.isConnected,
          formParent: form?.parentElement?.id || form?.parentElement?.className || null,
          supportBound: form?.dataset?.ovyxSupportEmailBound || null,
          legacyBound: !!form && form.dataset?.ovyxSupportLegacyBound,
          formReady: form?.dataset?.ovyxSupportFormReady || null,
          status: document.getElementById('ovyx-help-support-status')?.textContent || '',
          subjectLength: subject?.value?.length || 0,
          messageLength: message?.value?.length || 0,
          emailValue: email?.value || '',
          userEmail: user?.email || '',
          hasGetIdToken: typeof user?.getIdToken === 'function',
          submitDisabled: !!submit?.disabled,
          attachmentCount: document.getElementById('ovyx-help-support-attachments')?.files?.length || 0,
        };
      }).catch(pageError => ({ diagnosticError: String(pageError?.message || pageError) }));
      console.error('[' + target.name + '] support submission diagnostic: ' + JSON.stringify({
        ...diagnostic,
        requestObserved: !!supportRequest,
        pageErrors: bootstrapErrors.slice(-20),
      }));
      throw error;
    }
    assert.ok(supportRequest, '[' + target.name + '] support form must call the existing support API.');
    const supportHeaders = await supportRequest.allHeaders();
    assert.match(supportHeaders.authorization || '', /^Bearer /, '[' + target.name + '] support request must carry the Firebase identity token.');
    assert.match(supportHeaders['content-type'] || '', /^multipart\/form-data;/, '[' + target.name + '] support request must preserve multipart attachment upload.');
    const supportBody = supportRequest.postDataBuffer()?.toString('latin1') || '';
    assert.ok(supportBody.includes('support-evidence.txt'), '[' + target.name + '] selected attachment must reach the existing support endpoint.');
    assert.match(await page.locator('#ovyx-help-support-status').innerText(), /emailed to OVYX Support/i,
      '[' + target.name + '] UI may confirm email delivery only when the server confirms notificationStatus=sent.');
    // The status is updated before the submit handler's finally block releases
    // the button. Wait for that real completion boundary before starting the
    // second delivery scenario; clicking a still-disabled button is a no-op.
    await page.waitForFunction(() => {
      const button = document.querySelector('#view-support #ovyx-help-support-submit');
      return button && !button.disabled && button.getAttribute('aria-busy') !== 'true';
    }, null, { timeout: 10000 });

    await page.unroute('**/api/support');
    await page.route('**/api/support', async route => route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        ticket: { ticketId: 'OVYX-BROWSERFAIL', status: 'open', notificationStatus: 'failed', attachmentCount: 0 },
      }),
    }));
    await page.locator('#view-support #ovyx-help-support-subject').fill('Email delivery failure check');
    await page.locator('#view-support #ovyx-help-support-message').fill('This test verifies honest email delivery failure messaging.');
    // The shell's scrollable viewport can still be settling after the
    // assistant draft focus/route transition; dispatch the real submit-button
    // click without relying on Playwright's scroll-into-view pointer heuristic.
    await page.locator('#view-support #ovyx-help-support-submit').evaluate(button => button.click());
    await page.waitForFunction(() => /OVYX-BROWSERFAIL/.test(document.getElementById('ovyx-help-support-status')?.textContent || ''), null, { timeout: 15000 });
    assert.match(await page.locator('#ovyx-help-support-status').innerText(), /email delivery was not confirmed/i,
      '[' + target.name + '] a saved ticket with failed email delivery must not be reported as emailed.');
    await page.waitForFunction(() => window.OVYXSupportCenter?.__ovyxStandalonePageRoute === true, null, { timeout: 10000 });
    await page.evaluate(() => {
      const legacy = document.createElement('button');
      legacy.type = 'button';
      legacy.id = 'legacy-support-entry-fixture';
      legacy.setAttribute('data-support-open', '1');
      document.body.appendChild(legacy);
      legacy.click();
    });
    await page.waitForFunction(() => window.KernelState?.activeView === 'support', null, { timeout: 10000 });
    assert.equal(await page.locator('#ovyx-v655-support-backdrop').evaluate(node => node.classList.contains('open')).catch(() => false), false,
      '[' + target.name + '] legacy Contact Support triggers must route to the page instead of opening a support modal.');
    await page.locator('#legacy-support-entry-fixture').evaluate(node => node.remove());
    await page.evaluate(() => window.Router.go('faq'));
    await page.waitForFunction(() => window.KernelState?.activeView === 'faq', null, { timeout: 10000 });
    await page.evaluate(() => {
      const legacyWhatsApp = document.createElement('button');
      legacyWhatsApp.type = 'button';
      legacyWhatsApp.id = 'legacy-whatsapp-support-fixture';
      legacyWhatsApp.setAttribute('data-v34-support-wa', '1');
      document.body.appendChild(legacyWhatsApp);
      legacyWhatsApp.click();
    });
    await page.waitForFunction(() => window.KernelState?.activeView === 'support', null, { timeout: 10000 });
    await page.locator('#legacy-whatsapp-support-fixture').evaluate(node => node.remove());
    await page.evaluate(() => window.Router.go('faq'));
    await page.waitForFunction(() => window.KernelState?.activeView === 'faq', null, { timeout: 10000 });

    console.log(`PASS ${target.name}: real dock isolation, menu actions, read-only tool loop, local-context fallback, explicit approval and verified source update.`);
    await page.evaluate(() => {
      document.getElementById('test-typing-dock-shell')?.remove();
      document.getElementById('test-upload-dock-shell')?.remove();
      document.getElementById('test-opaque-dock-styles')?.remove();
    });
    await page.close();
  }
} finally {
  let closeTimer;
  try {
    await Promise.race([
      browser.close(),
      new Promise((_, reject) => { closeTimer = setTimeout(() => reject(new Error('Chromium shutdown exceeded 8 seconds.')), 8000); }),
    ]);
  } catch (error) {
    console.error('[assistant-browser] ' + String(error?.message || error));
    process.exitCode = 1;
    process.exit(1);
  } finally {
    if (closeTimer) clearTimeout(closeTimer);
  }
}
console.log('OVYX assistant workspace browser interaction tests passed.');
