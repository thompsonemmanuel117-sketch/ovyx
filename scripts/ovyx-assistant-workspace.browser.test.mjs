import assert from 'node:assert/strict';
import { chromium } from 'playwright';

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
    assert.ok(scriptSources.some(src => /[?&]v=20261012-5(?:&|$)/.test(src)), `[${target.name}] the updated assistant runtime cache version was not loaded`);

    await page.evaluate(() => window.WorkspaceBrainBot.open());
    const panel = page.locator('#kernel-brain-bot-panel');
    await panel.waitFor({ state: 'visible' });
    assert.ok(await panel.locator('.ovyx-native-response-avatar').count(), `[${target.name}] premium assistant response avatar is missing`);

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
    await menu.locator('[data-ovyx-native-action="help"]').click();
    const helpReply = page.locator('#bot-chat-history .ovyx-native-message-body').last();
    await helpReply.waitFor({ state: 'visible' });
    assert.match(await helpReply.innerText(), /OVYX AI can inspect the workspace snapshot/i);

    await trigger.click();
    await menu.locator('[data-ovyx-native-action="new-chat"]').click();
    await page.locator('#bot-chat-history').getByText('Welcome to OVYX AI').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#bot-chat-history .ovyx-native-message').count(), 0, `[${target.name}] New Chat did not clear the visible conversation`);
    assert.deepEqual(errors, [], `[${target.name}] assistant runtime errors: ${errors.join('; ')}`);

    console.log(`PASS ${target.name}: menu interactions, recovery-history action, context status, animated avatar and New Chat.`);
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('OVYX assistant workspace browser interaction tests passed.');
