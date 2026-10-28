import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || 'http://127.0.0.1:8789').trim();
const browser = await chromium.launch({ headless: true });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1440, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    const page = await browser.newPage({ viewport: target.viewport });
    page.setDefaultTimeout(20000);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.ok(response && response.status() < 400, '[' + target.name + '] OVYX shell failed to load.');
    await page.waitForSelector('#ws-chat-composer #ws-chat-input');
    await page.waitForSelector('#ws-pulse-trigger', { state: 'attached' });
    await page.evaluate(() => {
      document.body.classList.add('ovyx-webstudio-active');
      const view = document.getElementById('view-webstudio');
      if (view) {
        view.classList.remove('hidden');
        view.setAttribute('aria-hidden', 'false');
      }
    });

    const pulse = page.locator('#ws-pulse-trigger');
    const mic = page.locator('#ws-composer-mic');
    const send = page.locator('#ws-chat-send');
    const popover = page.locator('#ws-pulse-popover');
    const input = page.locator('#ws-chat-input');
    assert.equal(await pulse.isVisible(), true, '[' + target.name + '] pulse button should be visible.');
    assert.equal(await mic.isVisible(), true, '[' + target.name + '] microphone should be visible.');
    assert.equal(await send.isVisible(), true, '[' + target.name + '] send arrow should be visible.');
    assert.ok(await page.locator('#ws-mode-menu [data-ws-mode]').count() === 4, '[' + target.name + '] all four modes must remain available.');

    const compactHeight = await input.evaluate(el => el.getBoundingClientRect().height);
    assert.ok(compactHeight <= 56, '[' + target.name + '] prompt should start compact, got ' + compactHeight + 'px.');

    await pulse.click();
    await popover.waitFor({ state: 'visible' });
    assert.equal(await popover.locator('[data-ws-mode="build"]').isVisible(), true, '[' + target.name + '] Build mode must be inside the pulse menu.');
    assert.equal(await popover.locator('[data-ws-mode="plan"]').isVisible(), true, '[' + target.name + '] Plan mode must be inside the pulse menu.');
    assert.equal(await popover.locator('[data-ws-mode="ask"]').isVisible(), true, '[' + target.name + '] Ask mode must be inside the pulse menu.');
    assert.equal(await popover.locator('[data-ws-mode="fix"]').isVisible(), true, '[' + target.name + '] Fix mode must be inside the pulse menu.');
    assert.equal(await popover.locator('#ws-attach-btn').isVisible(), true, '[' + target.name + '] upload control must be inside the pulse menu.');
    assert.equal(await popover.locator('#ws-brain-btn').isVisible(), true, '[' + target.name + '] AI brain selector must be inside the pulse menu.');
    assert.equal(await popover.locator('#ws-context-btn').isVisible(), true, '[' + target.name + '] project context control must be inside the pulse menu.');

    await popover.locator('[data-ws-mode="ask"]').click();
    assert.equal(await page.locator('#ws-mode-trigger-label').textContent(), 'Ask', '[' + target.name + '] selecting Ask must update the real Web Studio mode.');
    await pulse.click();
    await popover.locator('[data-ws-pulse-action="image"]').click();
    assert.match(await input.inputValue(), /^Create an image of\s*$/, '[' + target.name + '] Create image should prepare a normal chat prompt, not open a separate studio.');
    assert.equal(await popover.isVisible(), false, '[' + target.name + '] pulse menu should close after selecting Create image.');

    await input.fill('Build a premium website.\nAdd a responsive hero section.\nKeep the existing project architecture and test every visible interaction.');
    const expandedHeight = await input.evaluate(el => el.getBoundingClientRect().height);
    assert.ok(expandedHeight > compactHeight, '[' + target.name + '] prompt should grow when longer text is entered.');
    assert.ok(expandedHeight <= 210, '[' + target.name + '] prompt should stop growing at its configured maximum.');

    const visibleToolButtons = await page.locator('#ws-chat-composer .ovyx-ws-tools-left > button:visible').evaluateAll(nodes => nodes.map(node => node.id));
    assert.deepEqual(visibleToolButtons, ['ws-pulse-trigger', 'ws-composer-mic'], '[' + target.name + '] only pulse and microphone should remain outside the pulse menu.');
    assert.deepEqual(pageErrors, [], '[' + target.name + '] page errors were raised: ' + pageErrors.join(' | '));
    await page.close();
  }
  console.log('OVYX Web Studio pulse composer browser checks passed on desktop and mobile.');
} finally {
  await browser.close();
}
