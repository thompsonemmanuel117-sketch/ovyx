import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local OVYX Pages app.');

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(String(error?.stack || error?.message || error)));
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => Array.from(document.styleSheets).some(sheet =>
    String(sheet.href || '').includes('ovyx-mobile-shell-quality.css')));
  await page.waitForFunction(() => !!document.getElementById('ovyx-v52-bottom-bar') && !!document.getElementById('view-home'));

  const result = await page.evaluate(() => {
    document.documentElement.dataset.ovyxMode = 'light';
    document.body.classList.add('ovyx-v88-dock-home');
    const dock = document.getElementById('ovyx-v52-bottom-bar');
    const home = dock.querySelector('[data-v52-bottom="home"]');
    const create = dock.querySelector('.v52-bottom-create');
    home.classList.add('is-active');
    dock.style.setProperty('display', 'grid', 'important');
    dock.style.setProperty('visibility', 'visible', 'important');
    dock.style.setProperty('opacity', '1', 'important');
    const rect = dock.getBoundingClientRect();
    const createRect = create.getBoundingClientRect();
    const active = getComputedStyle(home);
    const dockStyle = getComputedStyle(dock);
    const shell = document.querySelector('#view-home .v59-dashboard-shell');
    return {
      viewportWidth: document.documentElement.clientWidth,
      dockLeft: rect.left,
      dockRight: document.documentElement.clientWidth - rect.right,
      dockHeight: rect.height,
      dockBackground: dockStyle.backgroundColor,
      createHeight: createRect.height,
      createMarginTop: getComputedStyle(create).marginTop,
      activeColor: active.color,
      homeBottomPadding: shell ? getComputedStyle(shell).paddingBottom : '',
      homeTag: home.tagName,
      homeClass: home.className,
      homeStyle: home.getAttribute('style') || '',
      homeInlineColor: home.style.getPropertyValue('color'),
      homeInlineColorPriority: home.style.getPropertyPriority('color'),
      rootClass: document.documentElement.className,
      rootMode: document.documentElement.dataset.ovyxMode || '',
      bodyClass: document.body.className,
      qualityStylesheet: Array.from(document.styleSheets).map(sheet => sheet.href || 'inline').filter(href => href.includes('ovyx-mobile-shell-quality.css')),
      lightSelectorMatches: document.documentElement.matches('html:is(.ovyx-light,[data-ovyx-mode="light"])'),
      activeSelectorMatches: home.matches('#ovyx-v52-bottom-bar [data-v52-bottom="home"].is-active'),
      accentVariable: getComputedStyle(home).getPropertyValue('--accent').trim(),
      lightAccentVariable: getComputedStyle(home).getPropertyValue('--ovyx-light-accent-strong').trim(),
      matchingRules: (() => { const found = []; let order = 0; const walk = (rules, source) => Array.from(rules || []).forEach(rule => { order += 1; if (rule.cssRules) { walk(rule.cssRules, source); return; } if (!rule.selectorText || !rule.style || !rule.style.getPropertyValue('color')) return; try { if (home.matches(rule.selectorText)) found.push({ order, source, selector: rule.selectorText, color: rule.style.getPropertyValue('color'), important: rule.style.getPropertyPriority('color') }); } catch (_) {} }); Array.from(document.styleSheets).forEach(sheet => { try { walk(sheet.cssRules, sheet.href || 'inline'); } catch (_) {} }); return found.slice(-30); })()
    };
  });

  console.log('OVYX mobile dock diagnostic: ' + JSON.stringify(result));
  assert.ok(result.dockLeft >= 8 && result.dockRight >= 8,
    'Mobile dock must float inside the viewport instead of stretching edge-to-edge.');
  assert.ok(result.dockHeight >= 62 && result.dockHeight <= 66,
    'Mobile dock must remain a compact 64px control surface.');
  assert.ok(result.createHeight >= 52 && result.createHeight <= 56,
    'New action must align inside the dock without floating above it.');
  assert.equal(result.createMarginTop, '0px',
    'New action must not use the legacy negative lift.');
  assert.equal(result.activeColor, 'rgb(112, 70, 0)',
    'Light-mode active navigation text must use the contrast-safe accent.');
  assert.ok(Number.parseFloat(result.homeBottomPadding) >= 100,
    'Dashboard content must reserve at least 100px of scroll clearance for the fixed dock.');

  const authDockState = await page.evaluate(() => {
    const dock = document.getElementById('ovyx-v52-bottom-bar');
    const auth = document.getElementById('view-master-auth');
    document.body.classList.add('ovyx-auth-open');
    document.documentElement.classList.add('ovyx-auth-open');
    auth?.classList.remove('hidden');
    auth?.setAttribute('aria-hidden', 'false');
    window.OVYXDashboardNavigationAuthority?.sync();
    return {
      dockDisplay: getComputedStyle(dock).display,
      dockVisibility: getComputedStyle(dock).visibility,
      viewportPadding: getComputedStyle(document.getElementById('view-router-viewport')).paddingBottom
    };
  });
  assert.equal(authDockState.dockDisplay, 'none',
    'The Home dock must be hidden while the full-screen authentication overlay is open.');
  assert.equal(authDockState.dockVisibility, 'hidden',
    'Authentication must not leave an interactive dashboard dock underneath the login screen.');
  assert.equal(authDockState.viewportPadding, '0px',
    'The authentication screen must not inherit the dashboard dock clearance.');
  assert.deepEqual(errors, [], 'Mobile shell must not emit browser errors.');
  console.log('OVYX mobile dock geometry and light-theme browser checks passed.');
  await page.close();
} finally {
  await browser.close();
}
