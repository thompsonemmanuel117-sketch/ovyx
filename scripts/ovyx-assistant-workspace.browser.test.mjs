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
    assert.ok(scriptSources.some(src => /[?&]v=20261014-2(?:&|$)/.test(src)), `[${target.name}] the updated assistant runtime cache version was not loaded`);

    await page.evaluate(() => window.WorkspaceBrainBot.open());
    const panel = page.locator('#kernel-brain-bot-panel');
    await panel.waitFor({ state: 'visible' });
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
    assert.match(await panel.locator('#bot-context-node-type').innerText(), /DETAILS NEEDED|ACTION FAILED|PROJECT INSPECTED|LOCAL CONTEXT READY/i);

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
          note: 'This is a preview only. No project file was changed.',
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
          text: 'I will inspect the saved menu module before proposing a repair.',
          actions: [{ type: 'workspace_read_file', projectId: 'project_123', filePath: 'src/menu.js' }],
          provider: 'ovyx-native',
        };
      } else if (callNumber === 2) {
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
    await page.locator('#bot-chat-input').fill('Fix my mobile menu');
    await page.locator('[data-ovyx-native-send]').click();
    await page.getByText(/Server read-back verification passed/i).waitFor({ state: 'visible', timeout: 20000 });

    assert.deepEqual(
      workspaceCalls.map(call => call.operation),
      ['snapshot', 'diagnose', 'read_file', 'prepare_patch', 'apply_patch'],
      `[${target.name}] the assistant must execute the owned-project read and approved-write workflow in order`,
    );
    assert.equal(workspaceCalls.at(-1).confirm, true, `[${target.name}] apply_patch must carry explicit approval`);
    assert.equal(workspaceCalls.at(-1).expectedUpdateTime, 'revision-1', `[${target.name}] write must be tied to the preview revision`);
    assert.equal(aiPayloads.length, 2, `[${target.name}] the native model should reason again after receiving tool results`);
    const toolResults = aiPayloads[1]?.context?.workspaceToolResults || [];
    assert.ok(toolResults.some(item => item.type === 'workspace_read_file' && item.ok === true && item.result?.file?.content === originalSource),
      `[${target.name}] actual saved source must be fed back to the model before it proposes a patch`);
    assert.match(aiPayloads[0]?.context?.contextWarning || '', /optional live workspace scan/i,
      `[${target.name}] failed context scans must preserve a clear fallback warning`);
    const finalStatus = await panel.locator('#bot-context-node-type').innerText();
    assert.match(finalStatus, /APPLIED · VERIFIED/i, `[${target.name}] status must distinguish a verified saved write`);
    const updatedLocalSource = await page.evaluate(() => window.KernelState.activeProject.ovyxGraph.files['src/menu.js'].content);
    assert.equal(updatedLocalSource, repairedSource, `[${target.name}] verified source must be reflected back into the active local workspace`);
    assert.deepEqual(errors, [], `[${target.name}] assistant runtime errors: ${errors.join('; ')}`);

    console.log(`PASS ${target.name}: menu actions, read-only tool loop, local-context fallback, explicit approval and verified source update.`);
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('OVYX assistant workspace browser interaction tests passed.');
