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
    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.ok(response && response.status() < 400, '[' + target.name + '] OVYX shell failed to load.');
    await page.waitForSelector('#ws-chat-composer #ws-chat-input', { state: 'attached' });
    await page.waitForSelector('#ws-pulse-trigger', { state: 'attached' });
    await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
    await page.evaluate(() => {
      // Use the real router; forcing CSS classes alone lets the shell route
      // synchronizer hide the view again during a longer browser interaction.
      if (typeof window.switchView === 'function') {
        window.switchView('webstudio', { silent: true });
      } else {
        if (window.KernelState) window.KernelState.activeView = 'webstudio';
        window.__OVYX_BOOT_ROUTE = 'webstudio';
        document.body.classList.add('ovyx-webstudio-active');
        const view = document.getElementById('view-webstudio');
        if (view) {
          view.classList.remove('hidden');
          view.setAttribute('aria-hidden', 'false');
        }
        window.dispatchEvent(new CustomEvent('ovyx:view-changed', { detail: { view: 'webstudio' } }));
      }
      document.body.classList.add('ovyx-webstudio-active');
    });;

    const pulse = page.locator('#ws-pulse-trigger');
    const mic = page.locator('#ws-composer-mic');
    const send = page.locator('#ws-chat-send');
    const popover = page.locator('#ws-pulse-popover');
    const input = page.locator('#ws-chat-input');
    assert.equal(await pulse.isVisible(), true, '[' + target.name + '] pulse button should be visible.');
    assert.equal(await mic.isVisible(), true, '[' + target.name + '] microphone should be visible.');
    assert.equal(await send.isVisible(), true, '[' + target.name + '] send arrow should be visible.');
    assert.match(await pulse.locator('i').getAttribute('class') || '', /fa-plus/, '[' + target.name + '] Pulse should use a separate plus icon like ChatGPT.');
    assert.ok(await page.locator('#ws-mode-menu [data-ws-mode]').count() === 4, '[' + target.name + '] all four modes must remain available.');

    const compactHeight = await input.evaluate(el => el.getBoundingClientRect().height);
    assert.ok(compactHeight <= 56, '[' + target.name + '] prompt should start compact, got ' + compactHeight + 'px.');

    await input.fill('Hi OVYX');
    const shortPromptHeight = await input.evaluate(el => el.getBoundingClientRect().height);
    assert.ok(shortPromptHeight <= 56,
      '[' + target.name + '] a short typed prompt must remain compact; legacy input handlers must not force a tall minimum, got ' + shortPromptHeight + 'px.');

    await pulse.click();
    await popover.waitFor({ state: 'visible' });
    const popoverBox = await popover.boundingBox();
    assert.ok(popoverBox && popoverBox.width <= 250, '[' + target.name + '] Pulse menu must be narrow (250px max), got ' + (popoverBox && popoverBox.width) + 'px.');
    assert.ok(popoverBox && popoverBox.height <= (target.name === 'mobile' ? 341 : 361), '[' + target.name + '] Pulse menu must stay compact, got ' + (popoverBox && popoverBox.height) + 'px.');
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
    assert.ok(expandedHeight > shortPromptHeight, '[' + target.name + '] prompt should grow when longer text is entered.');
    assert.ok(expandedHeight <= 190, '[' + target.name + '] prompt should stop growing at its configured maximum.');

    const visibleToolButtons = await page.locator('#ws-chat-composer .ovyx-ws-tools-left > button:visible').evaluateAll(nodes => nodes.map(node => node.id));
    assert.deepEqual(visibleToolButtons, ['ws-pulse-trigger', 'ws-composer-mic'], '[' + target.name + '] only pulse and microphone should remain outside the pulse menu.');

    // Route the real chat action to the existing image endpoint with a tiny
    // fixture image; the test validates UI wiring without consuming AI quota.
    await page.route('**/api/ai/image-generation', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'cache-control': 'no-store' },
        body: JSON.stringify({
          ok: true,
          image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/eLkAAAAASUVORK5CYII='
        })
      });
    });
    await page.evaluate(() => {
      window.firebase = {
        auth() {
          return { currentUser: { getIdToken: async () => 'pulse-browser-test-token' } };
        }
      };
    });
    await input.fill('Create a beautiful cinematic hero image for a fintech homepage.');
    await send.click();
    await page.waitForSelector('#ws-agent-thread .ws-generated-image-card img', { state: 'visible' });
    const generatedImageSrc = await page.locator('#ws-agent-thread .ws-generated-image-card img').getAttribute('src');
    assert.ok(generatedImageSrc && generatedImageSrc.startsWith('data:image/png;base64,'),
      '[' + target.name + '] image requests must render inside the existing chat.');

    await page.evaluate(async () => {
      const W = window.WebStudio;
      await W.setAttachments([new File(['keep this existing brief'], 'site-brief.txt', { type: 'text/plain' })]);
    });
    assert.match(await page.locator('#ws-attachment-strip').innerText(), /site-brief\.txt/,
      '[' + target.name + '] fixture attachment must be staged before using the generated image.');

    await page.locator('#ws-agent-thread [data-ovyx-use-generated-image]').click();
    await page.waitForSelector('#ws-attachment-strip:not([hidden]) .ovyx-ws-attachment-chip', { state: 'visible' });
    const stagedAttachmentText = await page.locator('#ws-attachment-strip').innerText();
    assert.match(stagedAttachmentText, /site-brief\.txt/,
      '[' + target.name + '] using a generated image must preserve existing file attachments.');
    assert.match(stagedAttachmentText, /ovyx-generated-image\.png/,
      '[' + target.name + '] generated image must be attached as a normal website prompt attachment.');
    assert.match(await input.inputValue(), /^Use the attached generated image/,
      '[' + target.name + '] using the image must prepare a normal Web Studio build prompt.');
    assert.equal(await page.locator('#ws-mode-trigger-label').textContent(), 'Build',
      '[' + target.name + '] using the image must return the composer to Build mode.');
    await page.close();
  }
  console.log('OVYX Web Studio pulse composer browser checks passed on desktop and mobile.');
} finally {
  await browser.close();
}
