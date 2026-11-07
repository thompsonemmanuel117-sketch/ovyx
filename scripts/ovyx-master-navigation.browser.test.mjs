import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { installOwnerBrowserApiFixtures } from './ovyx-owner-browser-api-fixtures.mjs';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local OVYX Pages app.');

const browser = await chromium.launch({ headless: true });
try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  desktop.setDefaultTimeout(15000);
  const errors = [];
  desktop.on('pageerror', error => errors.push(String(error?.stack || error?.message || error)));
  await installOwnerBrowserApiFixtures(desktop, { initialUser: { uid: 'ovyx-master-nav-desktop', email: 'master-nav-desktop@example.test', displayName: 'Navigation Test', token: 'ovyx-master-nav-desktop-token' } });
  await desktop.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await desktop.waitForFunction(() => window.OVYXMasterNavigation?.version === 1 && window.KernelState?.activeView === 'home' && getComputedStyle(document.getElementById('app-sidebar')).visibility !== 'hidden', null, { timeout: 45000 });
  await desktop.waitForFunction(() => document.documentElement.dataset.ovyxMasterMenuCaptureBound === '1');
  await desktop.evaluate(() => window.OVYXDesktopShell.setCollapsed(false, false));
  await desktop.waitForFunction(() => document.documentElement.dataset.ovyxSidebar === 'open');
  await desktop.waitForFunction(() => document.querySelectorAll('#app-sidebar .ovyx-master-nav-group').length === 6);
  const desktopGroups = await desktop.locator('#app-sidebar .ovyx-master-nav-group > .ovyx-nav-label').allTextContents();
  assert.deepEqual(desktopGroups, ['Workspace', 'Build', 'Connect', 'Operate', 'Account', 'Administration']);
  const desktopConnections = desktop.locator('#app-sidebar [data-nav="connections"]');
  const desktopConnectionsEvidence = await desktopConnections.evaluate(node => ({
    text: node.textContent,
    innerText: node.innerText,
    display: getComputedStyle(node).display,
    visibility: getComputedStyle(node).visibility
  }));
  console.log('Master navigation Connect entry:', JSON.stringify(desktopConnectionsEvidence));
  assert.ok(desktopConnectionsEvidence.text.includes('Personal Connections'), 'Connect entry must retain its visible label: ' + JSON.stringify(desktopConnectionsEvidence));
  assert.equal(await desktopConnections.isVisible(), true, 'Connect entry must be visible in the desktop sidebar.');
  const desktopRepair = desktop.locator('#app-sidebar [data-nav="kernel-bot"]');
  assert.ok((await desktopRepair.textContent()).includes('Workspace Repair'), 'Workspace Repair must appear in the Operate group.');
  assert.equal(await desktop.locator('#app-sidebar [data-nav="admin-overview"]').isVisible(), false,
    'The existing owner-only Admin Center control must remain hidden for an ordinary signed-in account.');
  assert.equal(await desktop.locator('#app-sidebar .ovyx-master-nav-group').last().isVisible(), false,
    'The entire Administration group must remain hidden without verified owner authorization.');

  await desktop.evaluate(() => window.OVYXDesktopShell.setCollapsed(true, true));
  await desktop.waitForFunction(() => document.documentElement.dataset.ovyxSidebar === 'collapsed' && localStorage.getItem('ovyx.sidebar.collapsed.v1') === '1');
  const menuBinding = await desktop.locator('#ovyx-v34-menu-source').evaluate(node => ({
    handler: String(node.onclick || ''),
    shellMethod: typeof window.OVYXDesktopShell?.toggleOrOpen,
    state: document.documentElement.dataset.ovyxSidebar,
    stored: localStorage.getItem('ovyx.sidebar.collapsed.v1'),
    captureBound: document.documentElement.dataset.ovyxMasterMenuCaptureBound
  }));
  console.log('Master navigation menu binding:', JSON.stringify(menuBinding));
  assert.equal(menuBinding.handler, '', 'The legacy target-level menu handler must be replaced to avoid conflicting collapse states.');
  assert.equal(menuBinding.shellMethod, 'function', 'The canonical desktop shell controller must remain available.');
  assert.equal(menuBinding.captureBound, '1', 'The menu must be handled before legacy parent click interception.');
  await desktop.locator('#ovyx-v34-menu-source').click();
  await desktop.waitForFunction(() => document.documentElement.dataset.ovyxSidebar === 'open');
  await desktop.locator('#ovyx-desktop-sidebar-close').click();
  await desktop.waitForFunction(() => document.documentElement.dataset.ovyxSidebar === 'collapsed');
  await desktop.locator('#ovyx-v34-menu-source').click();
  await desktop.waitForFunction(() => document.documentElement.dataset.ovyxSidebar === 'open');

  await desktop.locator('#app-sidebar [data-nav="projects"]').click();
  await desktop.waitForFunction(() => window.KernelState?.activeView === 'projects');
  await desktop.waitForFunction(() => document.getElementById('ovyx-master-breadcrumb-current')?.textContent === 'Projects');

  await desktop.locator('#app-sidebar [data-nav="connections"]').click();
  await desktop.waitForFunction(() => window.KernelState?.activeView === 'settings' && window.OVYXSettings?.current === 'connections');
  await desktop.waitForFunction(() => document.querySelector('#view-settings [data-settings-panel="connections"]')?.classList.contains('active'));
  await desktop.waitForFunction(() => document.getElementById('ovyx-master-breadcrumb-current')?.textContent === 'Personal Connections');

  await desktop.locator('#app-sidebar [data-nav="kernel-bot"]').click();
  await desktop.waitForFunction(() => window.KernelState?.activeView === 'kernel-bot');
  await desktop.waitForFunction(() => document.getElementById('ovyx-master-breadcrumb-current')?.textContent === 'Workspace Repair');
  await desktop.locator('#app-sidebar [data-nav="sites-publishing"]').click();
  await desktop.waitForFunction(() => window.KernelState?.activeView === 'webstudio' && document.getElementById('ovyx-website-management') && !document.getElementById('ovyx-website-management').hidden);
  await desktop.waitForFunction(() => document.getElementById('ovyx-master-breadcrumb-group')?.textContent === 'Operate' && document.getElementById('ovyx-master-breadcrumb-current')?.textContent === 'Sites & Publishing');
  await desktop.evaluate(() => window.OVYXWebsiteManagement?.close?.());
  await desktop.waitForFunction(() => document.getElementById('ovyx-website-management')?.hidden === true);
  await desktop.waitForFunction(() => document.getElementById('ovyx-master-breadcrumb-current')?.textContent === 'Web Studio');
  assert.equal(await desktop.locator('#view-webstudio').evaluate(node => node.classList.contains('ovyx-ds')), false,
    'The shell navigation must not opt Web Studio into platform-wide design-system changes.');
  assert.deepEqual(errors, [], 'Desktop navigation must not create browser errors: ' + errors.join('; '));
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  mobile.setDefaultTimeout(15000);
  const mobileErrors = [];
  mobile.on('pageerror', error => mobileErrors.push(String(error?.stack || error?.message || error)));
  await installOwnerBrowserApiFixtures(mobile, { initialUser: { uid: 'ovyx-master-nav-mobile', email: 'master-nav-mobile@example.test', displayName: 'Navigation Test', token: 'ovyx-master-nav-mobile-token' } });
  await mobile.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await mobile.waitForFunction(() => window.OVYXMasterNavigation?.version === 1 && window.KernelState?.activeView === 'home', null, { timeout: 45000 });
  await mobile.waitForFunction(() => document.documentElement.dataset.ovyxMasterMenuCaptureBound === '1');
  await mobile.locator('#ovyx-v34-menu-source').click();
  const drawer = mobile.locator('#mobile-drawer');
  await drawer.waitFor({ state: 'visible' });
  await mobile.waitForFunction(() => document.getElementById('mobile-drawer')?.getAttribute('aria-hidden') === 'false' && document.body.classList.contains('ovyx-drawer-open'));
  await mobile.waitForFunction(() => document.querySelectorAll('#mobile-drawer .ovyx-master-nav-group').length === 6);
  const mobileGroups = await mobile.locator('#mobile-drawer .ovyx-master-nav-group > .ovyx-nav-label').allTextContents();
  assert.deepEqual(mobileGroups, ['Workspace', 'Build', 'Connect', 'Operate', 'Account', 'Administration']);
  assert.equal(await mobile.locator('#mobile-drawer .ovyx-master-nav-group').first().locator('[data-mobile-nav="inbox"]').count(), 1,
    'Inbox must remain in the Workspace group on mobile, matching desktop navigation.');

  assert.equal(await mobile.locator('#mobile-drawer [data-mobile-nav="sites-publishing"]').isVisible(), true,
    'Sites & Publishing must be available in the mobile Operate group.');
  assert.equal(await mobile.locator('#mobile-drawer [data-mobile-nav="connections"]').isVisible(), true);
  assert.equal(await mobile.locator('#mobile-drawer [data-mobile-nav="admin-overview"]').isVisible(), false,
    'Mobile Admin Center must remain hidden unless server-verified owner access is available.');
  assert.equal(await mobile.locator('#mobile-drawer .ovyx-master-nav-group').last().isVisible(), false,
    'The mobile Administration group must remain hidden without verified owner authorization.');
  await mobile.locator('#mobile-drawer [data-mobile-nav="connections"]').click();
  await mobile.waitForFunction(() => window.KernelState?.activeView === 'settings' && window.OVYXSettings?.current === 'connections');
  await mobile.waitForFunction(() => document.getElementById('mobile-current-view')?.textContent === 'Personal Connections');
  await mobile.waitForFunction(() => document.getElementById('mobile-drawer')?.getAttribute('aria-hidden') === 'true');
  assert.deepEqual(mobileErrors, [], 'Mobile navigation must not create browser errors: ' + mobileErrors.join('; '));
  await mobile.close();
  console.log('OVYX master navigation browser tests passed on desktop and mobile.');
} finally {
  await browser.close();
}
