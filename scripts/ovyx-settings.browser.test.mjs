import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { installOwnerBrowserApiFixtures } from './ovyx-owner-browser-api-fixtures.mjs';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local OVYX Pages app.');

const browser = await chromium.launch({ headless: true });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    const uid = 'settings-browser-' + target.name;
    const page = await browser.newPage({ viewport: target.viewport, acceptDownloads: true });
    page.setDefaultTimeout(20000);
    const pageErrors = [];
    page.on('pageerror', error => {
      if (/ovyx-settings|Settings|ThemeContext|ThemeLab|session revocation/i.test(error.message)) pageErrors.push(error.message);
    });
    await installOwnerBrowserApiFixtures(page, {
      initialUser: { uid, email: uid + '@example.test', displayName: 'Initial Settings Name', token: 'settings-browser-fixture-token' }
    });

    let profile = { displayName: 'Server Saved Name', workspaceName: 'Server Workspace' };
    const profileWrites = [];
    let preferences = {
      projectActivity: true, generationCompleted: true, deploymentStatus: true,
      connectionFailures: true, aiUsageWarnings: true, billing: true,
      emailProductUpdates: true, emailSecurityAlerts: true
    };
    const preferenceWrites = [];
    const sessionRequests = [];

    await page.route('**/api/settings/profile', async route => {
      const request = route.request();
      const method = request.method().toUpperCase();
      if (method === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, profile, updatedAt: '2026-10-15T00:00:00.000Z', authority: 'SERVER' }) });
      }
      if (method === 'PUT') {
        const payload = request.postDataJSON() || {};
        profile = { ...profile, ...(payload.profile || payload) };
        profileWrites.push({ ...profile });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, profile, updatedAt: new Date().toISOString(), authority: 'SERVER' }) });
      }
      return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }) });
    });

    await page.route('**/api/settings/preferences', async route => {
      const request = route.request();
      const method = request.method().toUpperCase();
      if (method === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, notifications: preferences, updatedAt: 'fixture', emailDelivery: 'preference-only' }) });
      }
      if (method === 'PUT') {
        const payload = request.postDataJSON() || {};
        preferences = { ...preferences, ...(payload.notifications || payload.preferences || payload) };
        preferenceWrites.push({ ...preferences });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, notifications: preferences, updatedAt: new Date().toISOString(), emailDelivery: 'preference-only' }) });
      }
      return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }) });
    });

    await page.route('**/api/auth/revoke-sessions', async route => {
      sessionRequests.push({ method: route.request().method(), headers: route.request().headers() });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revoked: true, reauthenticationRequired: true, message: 'All sessions revoked.' }) });
    });

    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.ok(response && response.status() < 400, '[' + target.name + '] app returned an HTTP error');
    await page.waitForFunction(() => !!window.OVYXSettings && !!window.ThemeContext && !!window.OVYXThemeLab && !!window.firebase?.auth?.().currentUser && typeof window.Router?.go === 'function', null, { timeout: 45000 });
    await page.evaluate(() => window.Router.go('settings'));
    await page.locator('#view-settings .ovyx-settings-shell').waitFor({ state: 'visible' });

    // Profile loads from the account API and Save Profile sends the changed values back to the server.
    await page.locator('[data-settings-nav="profile"]').click();
    const profileName = page.locator('#set-profile-name-legacy');
    const workspaceName = page.locator('#set-workspace-name-legacy');
    await profileName.waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.getElementById('set-profile-name-legacy')?.value === 'Server Saved Name');
    await page.waitForFunction(() => document.getElementById('set-workspace-name-legacy')?.value === 'Server Workspace');
    await profileName.fill('Updated Browser Name');
    await workspaceName.fill('Updated Workspace');
    await page.locator('[data-save-profile]').click();
    await page.waitForFunction(() => document.getElementById('ovyx-profile-server-status')?.textContent?.includes('Verified on server at'));
    assert.equal(profileWrites.at(-1)?.displayName, 'Updated Browser Name', '[' + target.name + '] profile save did not reach the server contract');
    assert.equal(profileWrites.at(-1)?.workspaceName, 'Updated Workspace', '[' + target.name + '] workspace name was not saved');

    // Notifications are account-scoped and email toggles are preferences only, not a fake email sender.
    await page.locator('[data-settings-nav="notifications"]').click();
    const projectActivity = page.locator('[data-settings-panel="notifications"] [data-notify="projectActivity"]');
    await projectActivity.waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.getElementById('ovyx-notification-server-status')?.textContent?.includes('Preferences loaded from your account.'));
    await projectActivity.click();
    await page.locator('#notify-save').click();
    await page.waitForFunction(() => document.getElementById('ovyx-notification-server-status')?.textContent?.toLowerCase().includes('saved'));
    assert.equal(preferenceWrites.at(-1)?.projectActivity, false, '[' + target.name + '] notification toggle was not saved');

    // Workspace settings change actual persistent state and editor mode.
    await page.locator('[data-settings-nav="editor"]').click();
    const livePreview = page.locator('#set-live-preview');
    await livePreview.waitFor({ state: 'visible' });
    const beforeLivePreview = await livePreview.getAttribute('aria-checked');
    await livePreview.click();
    const expectedLivePreview = beforeLivePreview !== 'true';
    await page.waitForFunction(expected => {
      const value = JSON.parse(localStorage.getItem('ovyx.settings.integrity.v83') || '{}');
      return value.livePreview === expected;
    }, expectedLivePreview);
    assert.equal(await livePreview.getAttribute('aria-checked'), String(expectedLivePreview), '[' + target.name + '] live-preview toggle state did not match persistence');

    await page.locator('#set-editor-mode').selectOption('fix');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ovyx.settings.integrity.v83') || '{}').editorMode === 'fix');

    // AI preferences update the account-specific browser preference record used by the generation request bridge.
    await page.locator('[data-settings-nav="ai"]').click();
    await page.locator('#set-provider').waitFor({ state: 'visible' });
    await page.locator('#set-provider').selectOption('openai');
    await page.locator('#set-ai-routing').selectOption('preferred-first');
    await page.locator('#set-ai-fallback').selectOption('stop');
    await page.locator('#set-ai-save').click();
    await page.waitForFunction(id => {
      const value = JSON.parse(localStorage.getItem('ovyx.ai.preferences.v1.user.' + id) || '{}');
      return value.provider === 'openai' && value.routing === 'preferred-first' && value.fallback === 'stop';
    }, uid);

    // Theme Lab buttons all complete real local actions; previews remain previews until Save Appearance.
    await page.locator('[data-settings-nav="appearance"]').click();
    await page.locator('[data-appearance-save]').waitFor({ state: 'visible' });
    const labCount = () => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('ovyx.theme.lab.v1') || '{}').customThemes || {}).length);
    await page.locator('[data-settings-panel="appearance"] [data-theme-save]').click();
    await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem('ovyx.theme.lab.v1') || '{}').customThemes || {}).length >= 1);
    const countAfterSave = await labCount();
    await page.locator('[data-settings-panel="appearance"] [data-theme-duplicate]').click();
    await page.waitForFunction(count => Object.keys(JSON.parse(localStorage.getItem('ovyx.theme.lab.v1') || '{}').customThemes || {}).length === count + 1, countAfterSave);
    const countAfterDuplicate = await labCount();

    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-settings-panel="appearance"] [data-theme-export]').click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /\.json$/i, '[' + target.name + '] Export did not download a JSON theme file');

    const chooserPromise = page.waitForEvent('filechooser');
    await page.locator('[data-settings-panel="appearance"] [data-theme-import]').click();
    const chooser = await chooserPromise;
    const importedTheme = {
      schema: 'ovyx-theme', version: 1, name: 'Browser Imported Theme',
      backgroundColor: '#101820', sidebarColor: '#101820', cardColor: '#18232D',
      borderColor: '#30404A', textColor: '#F3F7FA', mutedColor: '#A0B4C0', accentColor: '#6FD7FF',
      mode: 'dark', density: 'compact', scale: 'balanced', motion: 'reduced'
    };
    await chooser.setFiles({ name: 'browser-imported-theme.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(importedTheme)) });
    await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('ovyx.theme.lab.v1') || '{}').customThemes || {}).some(theme => theme.name === 'Browser Imported Theme'));
    await page.waitForFunction(() => window.ThemeContext?.isDirty() === true);

    const importedCard = page.locator('[data-settings-panel="appearance"] .ovyx-theme-card').filter({ hasText: 'Browser Imported Theme' });
    await importedCard.waitFor({ state: 'visible' });
    await importedCard.click();
    const beforeDelete = await labCount();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-settings-panel="appearance"] [data-theme-delete]').click();
    await page.waitForFunction(count => Object.keys(JSON.parse(localStorage.getItem('ovyx.theme.lab.v1') || '{}').customThemes || {}).length === count - 1, beforeDelete);

    await page.locator('[data-settings-panel="appearance"] [data-theme-save]').click();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-settings-panel="appearance"] [data-theme-reset]').click();
    await page.waitForFunction(() => {
      const lab = JSON.parse(localStorage.getItem('ovyx.theme.lab.v1') || '{}');
      return Object.keys(lab.customThemes || {}).length === 0 && lab.active === 'obsidian';
    });
    await page.locator('#set-density').selectOption('compact');
    await page.locator('[data-appearance-save]').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}').density === 'compact');

    // The modern Security panel exposes the existing session-revocation and account-deletion handlers.
    await page.locator('[data-settings-nav="security"]').click();
    await page.locator('#ovyx-security-revoke-sessions').waitFor({ state: 'visible' });
    await page.locator('#ovyx-security-delete').waitFor({ state: 'visible' });
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#ovyx-security-revoke-sessions').click();
    await page.waitForFunction(() => window.firebase?.auth?.().currentUser === null);
    assert.equal(sessionRequests.length, 1, '[' + target.name + '] session revocation did not call the authenticated server endpoint');
    assert.equal(sessionRequests[0].method, 'POST');
    assert.match(sessionRequests[0].headers.authorization || '', /^Bearer\s+/i);
    assert.deepEqual(pageErrors, [], '[' + target.name + '] Settings runtime raised a browser error: ' + pageErrors.join('; '));

    await page.close();

    // Isolated fixture page: exercise the destructive delete flow without deleting a real account.
    const deletePage = await browser.newPage({ viewport: target.viewport });
    deletePage.setDefaultTimeout(20000);
    await installOwnerBrowserApiFixtures(deletePage, {
      initialUser: { uid: uid + '-delete', email: 'delete-' + uid + '@example.test', displayName: 'Delete Test User', token: 'settings-delete-fixture-token' }
    });
    const deleteCalls = [];
    await deletePage.route('**/api/account/delete', async route => {
      deleteCalls.push({
        method: route.request().method(),
        confirmation: route.request().headers()['x-ovyx-account-deletion'],
        payload: route.request().postData() || ''
      });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        ok: true, deleted: true, firestore: 'deleted', emailScopedSettings: 'deleted',
        emailScopedDocumentsDeleted: true, storage: 'deleted', requiresClientAuthDeletion: true
      }) });
    });
    await deletePage.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await deletePage.waitForFunction(() => !!window.OVYXSettings && !!window.firebase?.auth?.().currentUser && typeof window.Router?.go === 'function');
    await deletePage.evaluate(() => {
      const user = window.firebase.auth().currentUser;
      user.getIdTokenResult = async () => ({ claims: { auth_time: Math.floor(Date.now() / 1000) } });
      user.delete = async () => { window.__OVYX_TEST_AUTH_USER_DELETED__ = true; };
    });
    await deletePage.evaluate(() => window.Router.go('settings'));
    await deletePage.locator('#view-settings .ovyx-settings-shell').waitFor({ state: 'visible' });
    await deletePage.locator('[data-settings-nav="security"]').click();
    await deletePage.locator('#ovyx-security-delete').waitFor({ state: 'visible' });
    deletePage.once('dialog', dialog => dialog.accept());
    await deletePage.locator('#ovyx-security-delete').click();
    await deletePage.waitForFunction(() => window.__OVYX_TEST_AUTH_USER_DELETED__ === true);
    assert.equal(deleteCalls.length, 1, '[' + target.name + '] account delete did not call the server cleanup endpoint');
    assert.equal(deleteCalls[0].method, 'POST');
    assert.equal(deleteCalls[0].confirmation, 'CONFIRM');
    await deletePage.close();
    console.log('OVYX Settings browser actions passed in ' + target.name + ': profile/server hydration, notifications, workspace/editor preferences, AI routing, Theme Lab CRUD/import/export, session revocation and guarded account deletion (fixture-only).');
  }
} finally {
  await browser.close();
}
