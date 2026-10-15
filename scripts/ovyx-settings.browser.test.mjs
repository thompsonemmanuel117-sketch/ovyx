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
    const context = await browser.newContext({ viewport: target.viewport, acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const settingsErrors = [];
    page.on('pageerror', error => {
      if (/renderDataLayer|OVYXDataLayerSettings|ovyx-data-(?:endpoint|sync|test|save|schema)|dbCfg/i.test(error.message)) {
        settingsErrors.push(error.message);
      }
    });

    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.ok(response && response.status() < 400, '[' + target.name + '] OVYX app did not load.');
    await page.waitForFunction(
      () => typeof window.Router?.go === 'function'
        && typeof window.OVYXSettings?.show === 'function'
        && !!window.OVYXDataLayerSettings,
      null,
      { timeout: 45000 },
    );

    await page.evaluate(() => window.Router.go('settings'));
    await page.locator('#view-settings').waitFor({ state: 'visible' });
    await page.evaluate(() => window.OVYXSettings.show('workspace'));
    const layer = page.locator('#ovyx-data-layer-panel');
    await layer.waitFor({ state: 'visible' });

    const initialCopy = await layer.innerText();
    assert.match(initialCopy, /Not provisioned here/i, '[' + target.name + '] must not imply OVYX provisions PostgreSQL.');
    assert.match(initialCopy, /Health check only/i, '[' + target.name + '] must explain the actual test scope.');
    assert.match(initialCopy, /Download PostgreSQL Schema creates a starter SQL file/i);
    assert.doesNotMatch(initialCopy, /Production-ready relational storage/i);

    // Missing configuration should produce a useful status without making a network request.
    await page.locator('#ovyx-data-test').click();
    assert.equal(
      (await page.locator('#ovyx-data-result').innerText()).trim(),
      'Add your secure data API endpoint first.',
      '[' + target.name + '] an empty endpoint must be handled clearly.',
    );

    const endpoint = 'https://data-api.example.test/api/data';
    await page.locator('#ovyx-data-endpoint').fill(endpoint);
    await page.locator('#ovyx-data-save').click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx.data.layer.v1') || '{}'));
    assert.equal(saved.endpoint, endpoint, '[' + target.name + '] external endpoint preference must be saved locally.');

    // Add a cookie for the external endpoint. The health test must deliberately omit it.
    await context.addCookies([{
      name: 'third_party_session',
      value: 'must-not-be-sent',
      url: 'https://data-api.example.test',
      sameSite: 'None',
      secure: true,
    }]);
    const healthRequests = [];
    await page.route('https://data-api.example.test/api/data/health', async route => {
      const request = route.request();
      healthRequests.push({
        method: request.method(),
        url: request.url(),
        headers: await request.allHeaders(),
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
        body: JSON.stringify({ ok: true, database: 'PostgreSQL' }),
      });
    });

    await page.locator('#ovyx-data-test').click();
    await page.waitForFunction(
      () => document.getElementById('ovyx-data-result')?.textContent?.includes('Health endpoint responded successfully'),
      null,
      { timeout: 20000 },
    );
    assert.equal(healthRequests.length, 1, '[' + target.name + '] Test API must make exactly one request in this interaction.');
    assert.equal(healthRequests[0].method, 'GET', '[' + target.name + '] Test API should only make the documented health GET.');
    assert.equal(healthRequests[0].url, endpoint + '/health');
    assert.equal(healthRequests[0].headers.cookie, undefined, '[' + target.name + '] external endpoint cookies must not be sent.');
    const resultText = await page.locator('#ovyx-data-result').innerText();
    assert.match(resultText, /backend-reported database: PostgreSQL/i);
    assert.match(resultText, /This verifies only the health endpoint, not PostgreSQL connectivity or project CRUD/i,
      '[' + target.name + '] a health response must not claim database/CRUD verification.');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#ovyx-data-schema').click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'ovyx-postgresql-schema.sql',
      '[' + target.name + '] schema button should download the starter schema file.');

    const sync = page.locator('#ovyx-data-sync');
    await sync.click();
    assert.equal(await sync.getAttribute('aria-checked'), 'false',
      '[' + target.name + '] sync switch should reflect the off state after clicking.');
    const afterToggle = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx.data.layer.v1') || '{}'));
    assert.equal(afterToggle.projectSync, false, '[' + target.name + '] sync switch should persist its state locally.');

    // Reopening the panel must not duplicate its injected container or lose settings.
    await page.evaluate(() => window.OVYXSettings.show('appearance'));
    await page.evaluate(() => window.OVYXSettings.show('workspace'));
    await page.locator('#ovyx-data-endpoint').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#ovyx-data-layer-panel').count(), 1,
      '[' + target.name + '] the injected Data Layer panel must not duplicate.');
    assert.equal(await page.locator('#ovyx-data-endpoint').inputValue(), endpoint);
    assert.equal(await page.locator('#ovyx-data-sync').getAttribute('aria-checked'), 'false');

    // Verify local persistence across an actual page reload as well.
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      () => typeof window.Router?.go === 'function'
        && typeof window.OVYXSettings?.show === 'function'
        && !!window.OVYXDataLayerSettings,
      null,
      { timeout: 45000 },
    );
    await page.evaluate(() => window.Router.go('settings'));
    await page.locator('#view-settings').waitFor({ state: 'visible' });
    await page.evaluate(() => window.OVYXSettings.show('workspace'));
    await page.locator('#ovyx-data-endpoint').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#ovyx-data-endpoint').inputValue(), endpoint);
    const afterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx.data.layer.v1') || '{}'));
    assert.equal(afterReload.projectSync, false);

    // Exercise Appearance preview, save, cancel, and reset through the rendered UI.
    // Seed a known persisted baseline and reload so ThemeContext starts from that state.
    await page.evaluate(() => {
      const dark = {
        mode: 'dark',
        accentColor: '#F59E0B',
        backgroundColor: '#050607',
        sidebarColor: '#050607',
        cardColor: '#0B0D10',
        borderColor: '#1B222A',
        textColor: '#F8FAFC',
        mutedColor: '#94A3B8',
        density: 'balanced',
        scale: 'balanced',
        motion: 'full',
      };
      localStorage.setItem('ovyx-theme', JSON.stringify(dark));
      localStorage.setItem('ovyx.appearance.v3', JSON.stringify({ mode: 'dark', density: 'balanced', scale: 'balanced', motion: 'full' }));
    });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      () => typeof window.Router?.go === 'function' && typeof window.OVYXSettings?.show === 'function',
      null,
      { timeout: 45000 },
    );
    await page.evaluate(() => window.Router.go('settings'));
    await page.locator('#view-settings').waitFor({ state: 'visible' });
    await page.evaluate(() => window.OVYXSettings.show('appearance'));
    const appearance = page.locator('[data-settings-panel="appearance"]');
    await appearance.waitFor({ state: 'visible' });
    await appearance.locator('[data-appearance-save]').waitFor({ state: 'visible' });
    await appearance.locator('[data-appearance-cancel]').waitFor({ state: 'visible' });

    const initialSavedTheme = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'));
    assert.equal(initialSavedTheme.mode, 'dark', '[' + target.name + '] Appearance test baseline must be dark.');
    await appearance.locator('[data-mode="light"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.ovyxAppearanceMode === 'light');
    let savedTheme = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'));
    assert.equal(savedTheme.mode, 'dark', '[' + target.name + '] selecting Light must preview without persisting before Save.');

    await appearance.locator('#set-density').selectOption('compact');
    await page.waitForFunction(() => window.ThemeContext?.get?.().density === 'compact');
    savedTheme = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'));
    assert.equal(savedTheme.density, 'balanced', '[' + target.name + '] density changes must remain a preview until Save.');

    await appearance.locator('[data-appearance-cancel]').click();
    await page.waitForFunction(() => document.documentElement.dataset.ovyxAppearanceMode === 'dark'
      && window.ThemeContext?.get?.().density === 'balanced');
    savedTheme = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'));
    assert.equal(savedTheme.mode, 'dark', '[' + target.name + '] Cancel must retain the saved mode.');
    assert.equal(savedTheme.density, 'balanced', '[' + target.name + '] Cancel must retain saved density.');

    await appearance.locator('[data-mode="light"]').click();
    await appearance.locator('[data-appearance-save]').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}').mode === 'light');
    savedTheme = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'));
    assert.equal(savedTheme.mode, 'light', '[' + target.name + '] Save Appearance must persist selected mode.');

    await page.evaluate(() => window.OVYXSettings.show('privacy'));
    const privacy = page.locator('[data-settings-panel="privacy"]');
    await privacy.locator('[data-clear-appearance]').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}').mode === 'dark');
    savedTheme = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'));
    assert.equal(savedTheme.mode, 'dark', '[' + target.name + '] Privacy reset must restore the dark appearance baseline.');
    assert.equal(savedTheme.density, 'balanced', '[' + target.name + '] Privacy reset must restore balanced density.');
    assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('ovyx.appearance.v3'))).mode, 'dark',
      '[' + target.name + '] Privacy reset must update the legacy appearance mirror too.');

    // Authenticate as a deterministic test account; no real user or real account data is used.
    await page.evaluate(() => {
      const user = {
        uid: 'settings-browser-test-user',
        email: 'settings-browser-test@example.test',
        displayName: 'Initial Display Name',
        updateProfileCalls: 0,
        async getIdToken() { return 'settings-browser-test-token'; },
        async updateProfile(patch) {
          this.updateProfileCalls += 1;
          if (patch?.displayName) this.displayName = patch.displayName;
        },
      };
      window.__settingsBrowserTestUser = user;
      const firebaseStub = window.firebase || {};
      try {
        firebaseStub.auth = () => ({ currentUser: user });
        window.firebase = firebaseStub;
      } catch (_) {
        Object.defineProperty(window, 'firebase', {
          configurable: true,
          value: { auth: () => ({ currentUser: user }) },
        });
      }
    });

    // Profile Save must call the account API once, suppress the older local-only handler,
    // preserve failed-save state, and allow a successful retry.
    let failNextProfileSave = true;
    const profileRequests = [];
    await page.route('**/api/settings/profile', async route => {
      const request = route.request();
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            profile: { displayName: 'Server Initial Name', workspaceName: 'Server Initial Workspace' },
            updatedAt: '2026-10-15T00:00:00.000Z',
          }),
        });
        return;
      }
      const headers = await request.allHeaders();
      const body = request.postDataJSON();
      profileRequests.push({ method: request.method(), headers, body });
      if (failNextProfileSave) {
        failNextProfileSave = false;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, message: 'Simulated profile service failure.' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          profile: body.profile,
          updatedAt: '2026-10-15T22:00:00.000Z',
        }),
      });
    });

    await page.evaluate(() => window.OVYXSettings.show('profile'));
    const profilePanel = page.locator('[data-settings-panel="profile"]');
    await profilePanel.locator('#set-profile-name').waitFor({ state: 'visible' });
    await page.waitForFunction(
      () => document.getElementById('ovyx-profile-server-status')?.textContent?.includes('Server profile last saved'),
      null,
      { timeout: 20000 },
    );
    await profilePanel.locator('#set-profile-name').fill('Stage Two Browser Name');
    await profilePanel.locator('#set-workspace-name').fill('Stage Two Browser Workspace');
    const profileSave = profilePanel.locator('#profile-save-action');

    await profileSave.click();
    await page.waitForFunction(
      () => document.getElementById('ovyx-profile-server-status')?.textContent?.includes('Save failed: Simulated profile service failure.'),
      null,
      { timeout: 20000 },
    );
    assert.equal(profileRequests.length, 1, '[' + target.name + '] failed Profile Save must issue exactly one PUT.');
    assert.equal(profileRequests[0].method, 'PUT');
    assert.equal(profileRequests[0].headers.authorization, 'Bearer settings-browser-test-token',
      '[' + target.name + '] Profile Save must use the authenticated account token.');
    assert.deepEqual(profileRequests[0].body.profile, {
      displayName: 'Stage Two Browser Name',
      workspaceName: 'Stage Two Browser Workspace',
    });
    assert.equal(await page.evaluate(() => window.__settingsBrowserTestUser.updateProfileCalls), 0,
      '[' + target.name + '] Firebase displayName must not update before the server confirms the save.');

    await profileSave.click();
    await page.waitForFunction(
      () => document.getElementById('ovyx-profile-server-status')?.textContent?.includes('Verified on server at 2026-10-15T22:00:00.000Z'),
      null,
      { timeout: 20000 },
    );
    assert.equal(profileRequests.length, 2, '[' + target.name + '] each Profile Save click must result in only one account API PUT.');
    assert.equal(await page.evaluate(() => window.__settingsBrowserTestUser.updateProfileCalls), 1,
      '[' + target.name + '] the legacy Profile save listener must not fire alongside the account-backed handler.');
    const profileMirror = await page.evaluate(
      () => JSON.parse(localStorage.getItem('ovyx.profile.v2.user.settings-browser-test-user') || '{}'),
    );
    assert.equal(profileMirror.name, 'Stage Two Browser Name');
    assert.equal(profileMirror.workspace, 'Stage Two Browser Workspace');

    // Notification toggles stay as drafts. Failed Save does not commit the draft to the local mirror
    // or claim success; retry saves exactly one PUT, and Reset saves defaults through the same API.
    const notificationDefaults = {
      projectActivity: true,
      generationCompleted: true,
      deploymentStatus: true,
      connectionFailures: true,
      aiUsageWarnings: true,
      billing: true,
      emailProductUpdates: true,
      emailSecurityAlerts: true,
    };
    let failNextNotificationSave = true;
    const notificationRequests = [];
    await page.route('**/api/settings/preferences', async route => {
      const request = route.request();
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, notifications: notificationDefaults, updatedAt: '2026-10-15T00:00:00.000Z' }),
        });
        return;
      }
      const headers = await request.allHeaders();
      const body = request.postDataJSON();
      notificationRequests.push({ method: request.method(), headers, body });
      if (failNextNotificationSave) {
        failNextNotificationSave = false;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, message: 'Simulated notification service failure.' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, notifications: body.notifications, updatedAt: '2026-10-15T22:01:00.000Z' }),
      });
    });

    await page.evaluate(() => window.OVYXSettings.show('notifications'));
    const notificationsPanel = page.locator('[data-settings-panel="notifications"]');
    await notificationsPanel.locator('[data-notify="projectActivity"]').waitFor({ state: 'visible' });
    await page.waitForFunction(
      () => document.getElementById('ovyx-notification-server-status')?.textContent?.includes('Preferences loaded from your account'),
      null,
      { timeout: 20000 },
    );
    const activityToggle = notificationsPanel.locator('[data-notify="projectActivity"]');
    assert.equal(await activityToggle.getAttribute('aria-checked'), 'true');
    await activityToggle.click();
    assert.equal(await activityToggle.getAttribute('aria-checked'), 'false',
      '[' + target.name + '] a notification toggle must update its draft state.');
    assert.equal(notificationRequests.filter(request => request.method === 'PUT').length, 0,
      '[' + target.name + '] changing a toggle must not save before the Save button is clicked.');

    const preferencesKey = 'ovyx.notifications.v1.user.settings-browser-test-user';
    const savedBeforeFailedPut = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), preferencesKey);
    assert.equal(savedBeforeFailedPut.projectActivity, true,
      '[' + target.name + '] toggling a notification must not immediately overwrite the saved local mirror.');

    await notificationsPanel.locator('#notify-save').click();
    await page.waitForFunction(
      () => document.getElementById('ovyx-notification-server-status')?.textContent?.includes('Save failed: Simulated notification service failure.'),
      null,
      { timeout: 20000 },
    );
    const failedNotificationPuts = notificationRequests.filter(request => request.method === 'PUT');
    assert.equal(failedNotificationPuts.length, 1, '[' + target.name + '] failed notification Save must issue one PUT.');
    assert.equal(failedNotificationPuts[0].headers.authorization, 'Bearer settings-browser-test-token');
    assert.equal(failedNotificationPuts[0].body.notifications.projectActivity, false);
    const savedAfterFailedPut = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), preferencesKey);
    assert.equal(savedAfterFailedPut.projectActivity, true,
      '[' + target.name + '] a failed Save must not pretend that the draft was persisted.');

    await notificationsPanel.locator('#notify-save').click();
    await page.waitForFunction(
      () => document.getElementById('ovyx-notification-server-status')?.textContent?.includes('Server confirmed account preferences saved.'),
      null,
      { timeout: 20000 },
    );
    let notificationPuts = notificationRequests.filter(request => request.method === 'PUT');
    assert.equal(notificationPuts.length, 2, '[' + target.name + '] successful retry must issue one additional PUT only.');
    assert.equal(notificationPuts[1].body.notifications.projectActivity, false);
    const savedAfterSuccess = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), preferencesKey);
    assert.equal(savedAfterSuccess.projectActivity, false,
      '[' + target.name + '] successful Save must update the local mirror after server confirmation.');

    await notificationsPanel.locator('#notify-reset').click();
    await page.waitForFunction(
      () => document.getElementById('ovyx-notification-server-status')?.textContent?.includes('Server confirmed account preferences saved.'),
      null,
      { timeout: 20000 },
    );
    notificationPuts = notificationRequests.filter(request => request.method === 'PUT');
    assert.equal(notificationPuts.length, 3, '[' + target.name + '] Reset must issue one additional PUT only.');
    assert.deepEqual(notificationPuts[2].body.notifications, notificationDefaults,
      '[' + target.name + '] Reset must persist all documented defaults.');
    const savedAfterReset = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), preferencesKey);
    assert.deepEqual(savedAfterReset, notificationDefaults);
    assert.match(await notificationsPanel.locator('#ovyx-notification-server-status').innerText(), /Email options are stored preferences; delivery still requires a configured mail channel/i,
      '[' + target.name + '] Email settings must not claim to actually send email.');

    assert.deepEqual(settingsErrors, [], '[' + target.name + '] Settings controls should not throw browser errors.');
    await context.close();
  }
  console.log('OVYX Settings Data Layer browser tests passed on desktop and mobile: truthful status, local save/reload, sync toggle persistence, health-only request, omitted external cookies, and starter schema download.');
} finally {
  await browser.close();
}
