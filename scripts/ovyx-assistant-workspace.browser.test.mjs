import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { installOwnerBrowserApiFixtures } from './ovyx-owner-browser-api-fixtures.mjs';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local or deployed OVYX Pages app.');

const expectedActions = [
  'new-chat', 'copy-chat', 'export-chat', 'help',
  'diagnose-project', 'repair-project', 'explain-project', 'refresh-context',
  'undo-last-ai-edit', 'review-ai-edits', 'recover-project',
  'open-projects', 'open-workspace', 'open-webstudio', 'open-settings',
  'open-assets', 'open-history', 'open-sections', 'open-preview',
];

const browser = await chromium.launch({ headless: true });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    const page = await browser.newPage({ viewport: target.viewport, acceptDownloads: true });
    page.setDefaultTimeout(20000);
    await installOwnerBrowserApiFixtures(page);
    const errors = [];
    page.on('pageerror', error => {
      if (/ovyx-native|menuAction|workspaceTool|recoverLatestWorkspaceEdit|reviewWorkspaceEditHistory/i.test(error.message)) errors.push(error.message);
    });

    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.ok(response && response.status() < 400, `[${target.name}] app returned an HTTP error`);
    await page.waitForFunction(() => typeof window.WorkspaceBrainBot?.open === 'function', null, { timeout: 45000 });

    const assistantScript = page.locator('script[src*="/assets/ovyx-assistant-workspace.js"]');
    assert.ok(await assistantScript.count(), `[${target.name}] assistant workspace script was not injected`);
    const scriptSources = await assistantScript.evaluateAll(nodes => nodes.map(node => node.src));
    assert.ok(scriptSources.some(src => /[?&]v=20261029-5(?:&|$)/.test(src)), `[${target.name}] the updated assistant runtime cache version was not loaded`);

    await page.evaluate(() => window.WorkspaceBrainBot.open());
    const panel = page.locator('#kernel-brain-bot-panel');
    await panel.waitFor({ state: 'visible' });

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
      `[\${target.name}] assistant typing must not bubble into dashboard keyboard shortcuts`);

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
    await helpMessage.locator('[data-ovyx-native-response-action="not-helpful"]').click();
    await page.locator('#view-faq').waitFor({ state: 'visible' });
    await page.locator('#ovyx-help-support-form').waitFor({ state: 'attached' });
    assert.match(await page.locator('#ovyx-help-support-subject').inputValue(), /Assistant response was not helpful/i,
      `[${target.name}] thumbs-down should prepare an editable Contact Support subject`);
    assert.match(await page.locator('#ovyx-help-support-message').inputValue(), /What went wrong\?/i,
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

    console.log(`PASS ${target.name}: menu actions, read-only tool loop, local-context fallback, explicit approval and verified source update.`);
    await page.evaluate(() => {
      document.getElementById('test-typing-dock-shell')?.remove();
      document.getElementById('test-upload-dock-shell')?.remove();
      document.getElementById('test-opaque-dock-styles')?.remove();
    });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('OVYX assistant workspace browser interaction tests passed.');
