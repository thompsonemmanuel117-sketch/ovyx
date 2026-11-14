import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) {
  throw new Error('OVYX_E2E_BASE_URL must point to the deployed OVYX Pages app.');
}

const expectedActions = [
  'new-chat',
  'copy-chat',
  'export-chat',
  'help',
  'diagnose-project',
  'repair-project',
  'explain-project',
  'refresh-context',
  'recover-project',
  'open-projects',
  'open-workspace',
  'open-webstudio',
  'open-settings',
  'open-assets',
  'open-history',
  'open-sections',
  'open-preview',
];

const browser = await chromium.launch({ headless: true });
const failures = [];
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    const page = await browser.newPage({ viewport: target.viewport, acceptDownloads: true });
    page.setDefaultTimeout(20000);
    const relevantPageErrors = [];
    page.on('pageerror', error => {
      if (/ovyx-native|menuAction|renderChrome|WorkspaceBrainBot/i.test(error.message)) {
        relevantPageErrors.push(error.message);
      }
    });

    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.ok(response && response.status() < 400, `[${target.name}] app returned an HTTP error`);

    await page.waitForFunction(
      () => typeof window.WorkspaceBrainBot?.open === 'function',
      null,
      { timeout: 45000 },
    );

    const assistantScript = page.locator('script[src*="/assets/ovyx-assistant-workspace.js"]');
    assert.ok(await assistantScript.count(), `[${target.name}] assistant workspace script was not injected`);
    const scriptSources = await assistantScript.evaluateAll(nodes => nodes.map(node => node.src));
    assert.ok(
      scriptSources.some(src => /[?&]v=/.test(src)),
      `[${target.name}] assistant workspace script has no cache-busting version`,
    );

    await page.evaluate(() => window.WorkspaceBrainBot.open());
    const panel = page.locator('#kernel-brain-bot-panel');
    await panel.waitFor({ state: 'visible' });

    const trigger = panel.locator('[data-ovyx-native-more]');
    await trigger.waitFor({ state: 'visible' });
    const menu = panel.locator('.ovyx-native-menu');

    assert.equal(await menu.isVisible(), false, `[${target.name}] menu should start closed`);
    await trigger.click();
    assert.equal(await menu.isVisible(), true, `[${target.name}] clicking the three-dots button did not open the menu`);
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');

    const renderedActions = await menu.locator('[data-ovyx-native-action]').evaluateAll(nodes =>
      nodes.map(node => node.getAttribute('data-ovyx-native-action')),
    );
    assert.deepEqual(
      renderedActions,
      expectedActions,
      `[${target.name}] menu actions are missing, duplicated, or in the wrong order`,
    );
    assert.equal(await menu.locator('[role="menuitem"]:visible').count(), expectedActions.length);
    assert.match(await menu.innerText(), /Conversation/i);
    assert.match(await menu.innerText(), /Project intelligence/i);
    assert.match(await menu.innerText(), /Quick access/i);

    // This action is safe without signing in and proves menu clicks reach their handler.
    await menu.locator('[data-ovyx-native-action="help"]').click();
    await page.locator('#bot-chat-history .ovyx-native-message-body').last().waitFor({ state: 'visible' });
    const helpText = await page.locator('#bot-chat-history .ovyx-native-message-body').last().innerText();
    assert.match(helpText, /OVYX AI can inspect the workspace snapshot/i);
    assert.equal(await menu.isVisible(), false, `[${target.name}] menu did not close after selecting an action`);

    // New Chat should clear the previous visible reply rather than only resetting internal state.
    await trigger.click();
    assert.equal(await menu.isVisible(), true);
    await menu.locator('[data-ovyx-native-action="new-chat"]').click();
    const history = page.locator('#bot-chat-history');
    await history.getByText('Welcome to OVYX AI').waitFor({ state: 'visible' });
    assert.equal(
      await history.locator('.ovyx-native-message').count(),
      0,
      `[${target.name}] New Chat left the previous conversation visible`,
    );
    assert.equal(await menu.isVisible(), false);
    assert.deepEqual(relevantPageErrors, [], `[${target.name}] assistant/menu runtime errors: ${relevantPageErrors.join('; ')}`);

    console.log(`PASS ${target.name}: assistant script loaded; three dots opened; all ${expectedActions.length} menu actions were visible; Help and New Chat clicks worked.`);
    await page.close();
  }
} finally {
  await browser.close();
}

console.log('OVYX assistant deployed-browser menu smoke tests passed.');
