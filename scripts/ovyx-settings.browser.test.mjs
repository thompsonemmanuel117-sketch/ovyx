import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local or deployed OVYX Pages app.');

const browser = await chromium.launch({ headless: true });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    const page = await browser.newPage({ viewport: target.viewport, acceptDownloads: true });
    page.setDefaultTimeout(25000);
    await page.addInitScript(() => {
      try { localStorage.clear(); sessionStorage.clear(); } catch (_) {}
    });

    let savedProfile = null;
    let savedNotifications = null;
    let accountDeletionRequests = 0;
    await page.route('**/api/settings/profile', async route => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          ok: true, profile: { displayName: 'Server Profile', workspaceName: 'Server Workspace' },
          updatedAt: '2026-10-15T00:00:00.000Z'
        }) });
        return;
      }
      if (method === 'PUT') {
        savedProfile = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          ok: true, profile: savedProfile.profile, updatedAt: '2026-10-15T00:01:00.000Z'
        }) });
        return;
      }
      await route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Unsupported test method.' }) });
    });
    await page.route('**/api/settings/preferences', async route => {
      const method = route.request().method();
      const defaults = {
        projectActivity: true, generationCompleted: true, deploymentStatus: true,
        connectionFailures: true, aiUsageWarnings: true, billing: true,
        emailProductUpdates: true, emailSecurityAlerts: true
      };
      if (method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, notifications: defaults }) });
        return;
      }
      if (method === 'PUT') {
        savedNotifications = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, notifications: savedNotifications.notifications || defaults }) });
        return;
      }
      await route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Unsupported test method.' }) });
    });
    await page.route('**/api/account/delete', async route => {
      accountDeletionRequests += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, deleted: true, emailScopedDocumentsDeleted: true }) });
    });

    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.ok(response && response.status() < 400, `[${target.name}] OVYX app did not load successfully.`);
    await page.waitForFunction(() => !!window.OVYXSettings && !!window.OVYXSettings.root?.querySelector('#ovyx-settings-main'), null, { timeout: 45000 });
    await page.evaluate(() => window.Router?.go?.('settings'));
    await page.waitForSelector('#view-settings [data-settings-nav="workspace"]', { state: 'attached' });

    await page.evaluate(() => window.OVYXSettings.show('workspace'));
    await page.waitForSelector('#view-settings [data-settings-panel="workspace"].active #set-open-behavior', { state: 'attached' });
    const openBehavior = page.locator('#view-settings [data-settings-panel="workspace"] #set-open-behavior');
    assert.equal(await openBehavior.inputValue(), 'Web Studio', `[${target.name}] the Workspace open-behavior selector is missing its default.`);
    assert.equal(await page.locator('#set-autosave').getAttribute('aria-checked'), 'true', `[${target.name}] autosave recovery should begin enabled.`);
    assert.equal(await page.locator('#set-confirm-delete').getAttribute('aria-checked'), 'true', `[${target.name}] destructive-action confirmation should begin enabled.`);

    await openBehavior.selectOption('Last active view');
    await page.waitForFunction(() => {
      const prefs = JSON.parse(localStorage.getItem('ovyx.settings.integrity.v83') || '{}');
      return prefs.openBehavior === 'Last active view';
    });
    await page.locator('#set-autosave').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ovyx.settings.integrity.v83') || '{}').autosave === false);
    await page.locator('#set-confirm-delete').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ovyx.settings.integrity.v83') || '{}').confirmDelete === false);

    const endpointInput = page.locator('#ovyx-data-endpoint');
    await endpointInput.fill('https://data-api.example.com/api/data');
    await page.locator('#ovyx-data-save').click();
    await page.waitForFunction(() => {
      const cfg = JSON.parse(localStorage.getItem('ovyx.data.layer.v1') || '{}');
      return cfg.endpoint === 'https://data-api.example.com/api/data' && cfg.projectSync === false;
    });
    const syncToggle = page.locator('#ovyx-data-sync');
    assert.equal(await syncToggle.getAttribute('aria-checked'), 'false', `[${target.name}] external Data API sync must be opt-in by default.`);
    const externalConsent = page.waitForEvent('dialog');
    const enablingSync = syncToggle.click();
    const dialog = await externalConsent;
    assert.match(dialog.message(), /Firebase ID token.*project metadata/i, `[${target.name}] external sync must disclose what is sent.`);
    await dialog.dismiss();
    await enablingSync;
    assert.equal(await syncToggle.getAttribute('aria-checked'), 'false', `[${target.name}] dismissing external-sync consent must leave it disabled.`);

    await page.evaluate(() => window.OVYXSettings.show('editor'));
    await page.waitForSelector('#set-editor-mode', { state: 'attached' });
    await page.locator('#set-editor-mode').selectOption('ask');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ovyx.settings.integrity.v83') || '{}').editorMode === 'ask');
    await page.locator('#set-inspector').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ovyx.settings.integrity.v83') || '{}').inspector === false);
    await page.locator('#set-live-preview').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ovyx.settings.integrity.v83') || '{}').livePreview === false);

    await page.evaluate(() => window.OVYXSettings.show('ai'));
    await page.waitForSelector('#set-ai-save', { state: 'attached' });
    await page.locator('#set-provider').selectOption('deepseek');
    await page.locator('#set-ai-model').selectOption('deepseek-flash');
    await page.locator('#set-ai-save').click();
    await page.waitForFunction(() => {
      const key = window.OVYXAIStorageKey ? window.OVYXAIStorageKey() : 'ovyx.ai.preferences.v1';
      const prefs = JSON.parse(localStorage.getItem(key) || '{}');
      return prefs.provider === 'deepseek' && prefs.model === 'deepseek-flash';
    });

    await page.evaluate(() => {
      const testUser = {
        uid: 'settings-browser-test-user',
        email: 'settings-browser-test@example.com',
        displayName: 'Server Profile',
        getIdToken: async () => 'settings-browser-test-token',
        getIdTokenResult: async () => ({ claims: { auth_time: Math.floor(Date.now() / 1000) } }),
        updateProfile: async patch => { testUser.displayName = patch.displayName || testUser.displayName; },
        delete: async () => { testUser.deleted = true; },
        metadata: { lastSignInTime: new Date().toISOString(), creationTime: new Date().toISOString() }
      };
      window.__OVYX_SETTINGS_BROWSER_TEST_USER__ = testUser;
      Object.defineProperty(window, 'firebase', {
        configurable: true, writable: true,
        value: { auth: () => ({ currentUser: testUser, signOut: async () => {} }) }
      });
    });

    await page.evaluate(() => window.OVYXSettings.show('profile'));
    await page.waitForSelector('#profile-save-action', { state: 'attached' });
    await page.waitForFunction(() => {
      const status = document.getElementById('ovyx-profile-server-status');
      return !!status && /Server profile last saved|No server profile saved|Verified on server/.test(status.textContent || '');
    });
    await page.locator('#set-profile-name').fill('Browser Verified Profile');
    await page.locator('#set-workspace-name').fill('Browser Verified Workspace');
    await page.locator('#profile-save-action').click();
    await page.waitForFunction(() => /Verified on server/.test(document.getElementById('ovyx-profile-server-status')?.textContent || ''));
    assert.deepEqual(savedProfile?.profile, {
      displayName: 'Browser Verified Profile',
      workspaceName: 'Browser Verified Workspace'
    }, `[${target.name}] Profile Save did not send the edited values to the authenticated Settings API.`);

    await page.evaluate(() => window.OVYXSettings.show('notifications'));
    const notificationToggle = page.locator('#view-settings [data-settings-panel="notifications"] [data-notify]').first();
    await notificationToggle.waitFor({ state: 'attached' });
    const notificationBefore = await notificationToggle.getAttribute('aria-checked');
    await notificationToggle.click();
    assert.notEqual(await notificationToggle.getAttribute('aria-checked'), notificationBefore, `[${target.name}] notification preference toggle did not change state.`);
    await page.locator('#notify-save').click();
    await page.waitForFunction(() => /Server confirmed account preferences saved/.test(document.getElementById('ovyx-notification-server-status')?.textContent || ''));
    assert.ok(savedNotifications?.notifications, `[${target.name}] notification Save did not call the authenticated Settings API.`);

    await page.evaluate(() => window.OVYXSettings.show('profile'));
    await page.waitForSelector('#profile-delete-action', { state: 'attached' });
    const profileDeleteDialog = page.waitForEvent('dialog');
    const deleteProfileClick = page.locator('#profile-delete-action').click();
    (await profileDeleteDialog).accept();
    await deleteProfileClick;
    await page.waitForFunction(() => window.__OVYX_SETTINGS_BROWSER_TEST_USER__?.deleted === true);
    assert.equal(accountDeletionRequests, 1, `[${target.name}] Profile account deletion bypassed the server-confirmed cleanup API.`);

    await page.evaluate(() => window.Router?.go?.('settings'));
    await page.evaluate(() => window.OVYXSettings.show('security'));
    await page.waitForSelector('#ovyx-security-delete', { state: 'attached' });
    const securityDeleteDialog = page.waitForEvent('dialog');
    const deleteSecurityClick = page.locator('#ovyx-security-delete').click();
    (await securityDeleteDialog).accept();
    await deleteSecurityClick;
    await page.waitForFunction(() => window.__OVYX_SETTINGS_BROWSER_TEST_USER__?.deleted === true && document.getElementById('ovyx-security-delete') !== null);
    assert.equal(accountDeletionRequests, 2, `[${target.name}] Security account deletion bypassed the same server-confirmed cleanup path.`);

    console.log(`OVYX Settings browser tests passed for ${target.name}: workspace control recovery and persistence, opt-in external sync consent, editor/AI preferences, verified profile/notification writes, and server-confirmed deletion.`);
    await page.close();
  }
} finally {
  await browser.close();
}
