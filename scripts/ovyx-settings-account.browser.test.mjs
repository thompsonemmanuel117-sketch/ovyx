import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local OVYX Pages app.');

async function waitForRouteRestore(page) {
  // The late V25 controller reapplies the stored route at load/pageshow. Do not
  // issue a test navigation until that boot restoration has finished.
  await page.waitForFunction(
    () => document.readyState === 'complete'
      && typeof window.__OVYX_BOOT_ROUTE === 'string'
      && window.KernelState?.activeView === window.__OVYX_BOOT_ROUTE,
    null,
    { timeout: 45000 },
  );
  await page.waitForTimeout(120);
  await page.waitForFunction(
    () => typeof window.__OVYX_BOOT_ROUTE === 'string'
      && window.KernelState?.activeView === window.__OVYX_BOOT_ROUTE,
    null,
    { timeout: 10000 },
  );
}


const browser = await chromium.launch({ headless: true });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    const context = await browser.newContext({ viewport: target.viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const pageErrors = [];
    page.on('pageerror', error => {
      if (/Settings|profile|notification|OVYXSettings/i.test(error.message)) pageErrors.push(error.message);
    });

    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.ok(response && response.status() < 400, '[' + target.name + '] OVYX app failed to load.');
    await page.waitForFunction(
      () => typeof window.Router?.go === 'function' && typeof window.OVYXSettings?.show === 'function',
      null,
      { timeout: 45000 },
    );
    await waitForRouteRestore(page);
    await page.evaluate(() => window.Router.go('settings'));
    await page.waitForFunction(() => String(window.KernelState?.activeView || '').replace(/^view-/, '') === 'settings', null, { timeout: 15000 });
    await page.locator('#view-settings').waitFor({ state: 'visible' });

    const identity = await page.evaluate(() => {
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
      const firebaseStub = window.firebase || {};
      const fakeAuth = () => ({ currentUser: user });
      try {
        Object.defineProperty(firebaseStub, 'auth', {
          configurable: true, enumerable: true, writable: true, value: fakeAuth,
        });
      } catch (_) {
        firebaseStub.auth = fakeAuth;
      }
      try {
        Object.defineProperty(window, 'firebase', {
          configurable: true, enumerable: true, writable: true, value: firebaseStub,
        });
      } catch (_) {
        window.firebase = firebaseStub;
      }
      window.__settingsBrowserTestUser = user;
      return window.firebase?.auth?.().currentUser?.uid || '';
    });
    assert.equal(identity, 'settings-browser-test-user',
      '[' + target.name + '] test fixture must install an authenticated identity before the Settings checks.');

    // Profile API is mocked. Test one failed save followed by one successful retry.
    let failNextProfileSave = true;
    const profilePuts = [];
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
      const requestHeaders = await request.allHeaders();
      const body = request.postDataJSON();
      profilePuts.push({ method: request.method(), headers: requestHeaders, body });
      if (failNextProfileSave) {
        failNextProfileSave = false;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, message: 'Simulated profile service failure.' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true, profile: body.profile, updatedAt: '2026-10-15T22:00:00.000Z',
          }),
        });
      }
    });

    const profileGet = page.waitForResponse(r =>
      r.url().includes('/api/settings/profile') && r.request().method() === 'GET');
    await page.evaluate(() => window.OVYXSettings.show('profile'));
    await profileGet;
    const profilePanel = page.locator('[data-settings-panel="profile"]');
    const displayName = profilePanel.locator('#set-profile-name, #set-profile-name-legacy').first();
    const workspaceName = profilePanel.locator('#set-workspace-name, #set-workspace-name-legacy').first();
    await displayName.waitFor({ state: 'visible' });
    await workspaceName.waitFor({ state: 'visible' });
    const profileSave = profilePanel.locator('#profile-save-action, [data-save-profile]').first();
    await profileSave.waitFor({ state: 'visible' });

    await displayName.fill('Stage Two Browser Name');
    await workspaceName.fill('Stage Two Browser Workspace');
    await profileSave.click();
    await page.waitForFunction(
      () => document.getElementById('ovyx-profile-server-status')?.textContent
        ?.includes('Save failed: Simulated profile service failure.'),
      null,
      { timeout: 12000 },
    );
    assert.equal(profilePuts.length, 1, '[' + target.name + '] failed Profile Save must send exactly one PUT.');
    assert.equal(profilePuts[0].method, 'PUT');
    assert.equal(profilePuts[0].headers.authorization, 'Bearer settings-browser-test-token');
    assert.deepEqual(profilePuts[0].body.profile, {
      displayName: 'Stage Two Browser Name',
      workspaceName: 'Stage Two Browser Workspace',
    });
    assert.equal(await page.evaluate(() => window.__settingsBrowserTestUser.updateProfileCalls), 0,
      '[' + target.name + '] Firebase displayName must not change before server success.');
    await page.waitForFunction(
      () => !document.querySelector('#profile-save-action, [data-settings-panel="profile"] [data-save-profile]')?.disabled,
    );

    await profileSave.click();
    await page.waitForFunction(
      () => document.getElementById('ovyx-profile-server-status')?.textContent
        ?.includes('Verified on server at 2026-10-15T22:00:00.000Z'),
      null,
      { timeout: 12000 },
    );
    await page.waitForFunction(
      () => !document.querySelector('#profile-save-action, [data-settings-panel="profile"] [data-save-profile]')?.disabled,
    );
    assert.equal(profilePuts.length, 2, '[' + target.name + '] one account PUT is allowed per Profile Save click.');
    assert.equal(await page.evaluate(() => window.__settingsBrowserTestUser.updateProfileCalls), 1,
      '[' + target.name + '] older local-only Profile listener must not fire alongside server-backed save.');
    const profileMirror = await page.evaluate(
      () => JSON.parse(localStorage.getItem('ovyx.profile.v2.user.settings-browser-test-user') || '{}'),
    );
    assert.equal(profileMirror.name, 'Stage Two Browser Name');
    assert.equal(profileMirror.workspace, 'Stage Two Browser Workspace');

    // Notification switches must be drafts until Save; failed Save must not update local mirror.
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
    const notificationPuts = [];
    await page.route('**/api/settings/preferences', async route => {
      const request = route.request();
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true, notifications: notificationDefaults, updatedAt: '2026-10-15T00:00:00.000Z',
          }),
        });
        return;
      }
      const requestHeaders = await request.allHeaders();
      const body = request.postDataJSON();
      notificationPuts.push({ method: request.method(), headers: requestHeaders, body });
      if (failNextNotificationSave) {
        failNextNotificationSave = false;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, message: 'Simulated notification service failure.' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true, notifications: body.notifications, updatedAt: '2026-10-15T22:01:00.000Z',
          }),
        });
      }
    });

    const preferencesGet = page.waitForResponse(r =>
      r.url().includes('/api/settings/preferences') && r.request().method() === 'GET');
    await page.evaluate(() => window.OVYXSettings.show('notifications'));
    await preferencesGet;
    const notificationsPanel = page.locator('[data-settings-panel="notifications"]');
    const activityToggle = notificationsPanel.locator('[data-notify="projectActivity"]');
    await activityToggle.waitFor({ state: 'visible' });
    assert.equal(await activityToggle.getAttribute('aria-checked'), 'true');

    const preferencesKey = 'ovyx.notifications.v1.user.settings-browser-test-user';
    await activityToggle.click();
    assert.equal(await activityToggle.getAttribute('aria-checked'), 'false');
    assert.equal(notificationPuts.length, 0,
      '[' + target.name + '] toggling a preference must not issue a PUT before Save.');
    const savedBeforeFail = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), preferencesKey);
    assert.equal(savedBeforeFail.projectActivity, true);

    const savePreferences = notificationsPanel.locator('#notify-save');
    await savePreferences.click();
    await page.waitForFunction(
      () => document.getElementById('ovyx-notification-server-status')?.textContent
        ?.includes('Save failed: Simulated notification service failure.'),
      null,
      { timeout: 12000 },
    );
    assert.equal(notificationPuts.length, 1, '[' + target.name + '] failed Notification Save must issue one PUT.');
    assert.equal(notificationPuts[0].headers.authorization, 'Bearer settings-browser-test-token');
    assert.equal(notificationPuts[0].body.notifications.projectActivity, false);
    const savedAfterFail = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), preferencesKey);
    assert.equal(savedAfterFail.projectActivity, true,
      '[' + target.name + '] failed Save must not persist an unsaved draft.');
    await page.waitForFunction(() => !document.getElementById('notify-save')?.disabled);

    await savePreferences.click();
    await page.waitForFunction(
      () => document.getElementById('ovyx-notification-server-status')?.textContent
        ?.includes('Server confirmed account preferences saved.'),
      null,
      { timeout: 12000 },
    );
    await page.waitForFunction(() => !document.getElementById('notify-save')?.disabled);
    assert.equal(notificationPuts.length, 2, '[' + target.name + '] retry must add just one PUT.');
    assert.equal(notificationPuts[1].body.notifications.projectActivity, false);
    const savedAfterSuccess = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), preferencesKey);
    assert.equal(savedAfterSuccess.projectActivity, false);

    const resetPreferences = notificationsPanel.locator('#notify-reset');
    await resetPreferences.click();
    await page.waitForFunction(
      () => document.getElementById('ovyx-notification-server-status')?.textContent
        ?.includes('Server confirmed account preferences saved.'),
      null,
      { timeout: 12000 },
    );
    await page.waitForFunction(() => !document.getElementById('notify-reset')?.disabled);
    assert.equal(notificationPuts.length, 3, '[' + target.name + '] Reset must issue one PUT.');
    assert.deepEqual(notificationPuts[2].body.notifications, notificationDefaults);
    const savedAfterReset = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), preferencesKey);
    assert.deepEqual(savedAfterReset, notificationDefaults);
    assert.match(await notificationsPanel.locator('#ovyx-notification-server-status').innerText(),
      /Email options are stored preferences; delivery still requires a configured mail channel/i);

    assert.deepEqual(pageErrors, [], '[' + target.name + '] Profile and Notifications must not throw Settings errors.');
    await context.close();
  }
  console.log('OVYX Profile and Notifications browser tests passed on desktop and mobile: authenticated single-write Profile saves, failed-save retry, draft-only notification switches, failed-save preservation, server-confirmed retry, Reset defaults, and truthful email-delivery copy.');
} finally {
  await browser.close();
}
