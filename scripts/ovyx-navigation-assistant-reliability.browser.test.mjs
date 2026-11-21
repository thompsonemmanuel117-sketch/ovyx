import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { installOwnerBrowserApiFixtures } from './ovyx-owner-browser-api-fixtures.mjs';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local OVYX Pages app.');

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(20000);
  await installOwnerBrowserApiFixtures(page, {
    initialUser: { uid: 'ovyx-navigation-reliability-user', email: 'navigation@example.test', token: 'ovyx-navigation-token' }
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  const response = await page.goto(baseURL, { waitUntil: 'commit', timeout: 60000 });
  assert.ok(response && response.status() < 400, 'OVYX shell must load.');
  await page.waitForFunction(() =>
    typeof window.Router?.go === 'function' &&
    typeof window.MobileDrawer?.open === 'function' &&
    window.WorkspaceBrainBot?.__ovyxNativeOpen === true &&
    window.WorkspaceBrainBot?.__OVYX_AI_ASSISTANT_PAGE_WRAPPED === true,
    null,
    { timeout: 60000 }
  );

  async function returnHome() {
    await page.evaluate(() => window.Router.go('home'));
    await page.waitForFunction(() => window.KernelState?.activeView === 'home', null, { timeout: 15000 });
  }

  async function clickAccountEntry(kind) {
    await page.evaluate(() => window.MobileDrawer.open());
    // The legacy drawer can remain mounted in a transformed off-canvas layer;
    // wait for the actual account entries rather than assuming a particular
    // visibility/display implementation for its shell container.
    await page.waitForTimeout(150);

    const found = await page.evaluate(kind => {
      const aliases = {
        plans: ['plans', 'plan', 'pricing', 'billing'],
        assistant: ['ai-assistant', 'assistant', 'ai'],
        settings: ['settings', 'account-settings'],
        help: ['help', 'faq', 'support']
      }[kind];
      const normalize = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const candidates = Array.from(document.querySelectorAll(
        '[data-v52-account],[data-mobile-nav],[data-nav],[data-sidebar-nav],[data-route],[data-ovyx-route],#desktop-ai-assistant,' +
        '#mobile-drawer button,#mobile-drawer a,#app-sidebar button,#app-sidebar a'
      ));
      const item = candidates.find(node => {
        if (node.disabled || node.getAttribute('aria-disabled') === 'true') return false;
        const values = ['data-v52-account','data-mobile-nav','data-nav','data-sidebar-nav','data-route']
          .map(name => normalize(node.getAttribute(name)));
        const label = normalize(node.getAttribute('aria-label') || node.textContent);
        if (aliases.some(alias => values.includes(alias))) return true;
        if (kind === 'plans') return /^(?:ovyx\s+)?plans?(?:\s+and\s+billing)?$/.test(label);
        if (kind === 'assistant') return /^(?:ovyx\s+)?(?:ai\s+)?assistant$/.test(label);
        if (kind === 'settings') return /^(?:account\s+)?settings$/.test(label);
        return /^(?:help(?:\s*\/\s*faq)?|faq|support)$/.test(label);
      });
      if (!item) return {
        found: false,
        drawerItems: candidates.map(node => ({
          label: normalize(node.textContent),
          account: node.getAttribute('data-v52-account'),
          mobile: node.getAttribute('data-mobile-nav'),
          nav: node.getAttribute('data-nav')
        }))
      };
      item.click();
      return { found: true, label: normalize(item.textContent), tag: item.tagName };
    }, kind);
    assert.equal(found.found, true, 'The actual mobile navigation must expose the ' + kind + ' entry: ' + JSON.stringify(found.drawerItems || []));
  }

  for (const [kind, route] of [
    ['plans', 'pricing'],
    ['settings', 'settings'],
    ['assistant', 'ai-assistant'],
    ['help', 'support']
  ]) {
    await returnHome();
    await clickAccountEntry(kind);
    await page.waitForFunction(expected => window.KernelState?.activeView === expected, route, { timeout: 20000 });
    if (kind === 'assistant') {
      await page.locator('#view-ai-assistant #kernel-brain-bot-panel').waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('#view-ai-assistant .ovyx-ai-assistant-close').click();
      await page.waitForFunction(() => window.KernelState?.activeView === 'home', null, { timeout: 15000 });
    }
    if (kind === 'help') {
      await page.locator('#view-support #ovyx-help-support-form').waitFor({ state: 'visible', timeout: 20000 });
    }
    console.log('PASS mobile ' + kind + ': the real sidebar entry opens ' + route + '.');
  }

  assert.deepEqual(errors, [], 'Navigation browser errors: ' + errors.join('; '));
  await page.close();
} finally {
  await browser.close();
}
console.log('OVYX mobile account navigation browser tests passed.');