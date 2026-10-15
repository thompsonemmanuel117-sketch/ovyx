import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local or deployed OVYX Pages app.');

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

const browser = await chromium.launch({ headless: true });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    const context = await browser.newContext({ viewport: target.viewport, acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const profileCalls = [];
    const notificationCalls = [];
    const pageErrors = [];
    let profile = { displayName: 'Initial Display', workspaceName: 'Initial Workspace' };
    let notifications = { ...notificationDefaults };

    await page.addInitScript(() => {
      if (localStorage.getItem('__ovyxSettingsCoreFixtureV1') !== '1') {
        const initialTheme = {
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
        localStorage.setItem('ovyx-theme', JSON.stringify(initialTheme));
        localStorage.removeItem('ovyx.appearance.v3');
        localStorage.removeItem('ovyx.theme.lab.v1');
        localStorage.setItem('__ovyxSettingsCoreFixtureV1', '1');
      }
      window.__settingsThemeAppliedEvents = [];
      window.__settingsAppearanceCanonicalizedEvents = [];
      document.addEventListener('ovyx:theme-applied', event => {
        window.__settingsThemeAppliedEvents.push(String(event.detail?.reason || ''));
      });
      window.addEventListener('ovyx:appearance-canonicalized', event => {
        window.__settingsAppearanceCanonicalizedEvents.push(String(event.detail?.reason || ''));
      });
    });

    await page.route('**/api/settings/profile', async route => {
      const request = route.request();
      const method = request.method();
      let body = null;
      if (method === 'PUT') {
        body = request.postDataJSON();
        profileCalls.push({ method, body });
        profile = {
          displayName: String(body?.profile?.displayName || ''),
          workspaceName: String(body?.profile?.workspaceName || ''),
        };
      } else {
        profileCalls.push({ method, body: null });
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, profile, updatedAt: '2026-10-15T12:00:00.000Z' }),
      });
    });

    await page.route('**/api/settings/preferences', async route => {
      const request = route.request();
      const method = request.method();
      let body = null;
      if (method === 'PUT') {
        body = request.postDataJSON();
        notificationCalls.push({ method, body });
        notifications = { ...notificationDefaults, ...(body?.notifications || {}) };
      } else {
        notificationCalls.push({ method, body: null });
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, notifications, updatedAt: '2026-10-15T12:00:00.000Z' }),
      });
    });

    page.on('pageerror', error => pageErrors.push(error.message));
    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.ok(response && response.status() < 400, '[' + target.name + '] OVYX app did not load.');
    await page.waitForFunction(
      () => typeof window.Router?.go === 'function'
        && typeof window.OVYXSettings?.show === 'function'
        && typeof window.ThemeContext?.get === 'function',
      null,
      { timeout: 45000 },
    );

    await page.evaluate(() => window.Router.go('settings'));
    await page.locator('#view-settings').waitFor({ state: 'visible' });

    // Appearance: one click must have one canonical owner, one preview, and no premature storage write.
    await page.evaluate(() => window.OVYXSettings.show('appearance'));
    const appearance = page.locator('[data-settings-panel="appearance"]');
    await appearance.locator('[data-appearance-save]').waitFor({ state: 'visible' });
    const savedBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'));
    await page.evaluate(() => {
      window.__settingsThemeAppliedEvents.length = 0;
      window.__settingsAppearanceCanonicalizedEvents.length = 0;
    });
    await appearance.locator('[data-mode="light"]').click();
    await page.waitForFunction(() => window.ThemeContext?.get?.().mode === 'light');
    assert.equal(await page.evaluate(() => window.ThemeContext.isDirty()), true,
      '[' + target.name + '] choosing a mode must create an unsaved preview.');
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'))).mode, savedBefore.mode,
      '[' + target.name + '] previewing a mode must not prematurely write saved appearance.');
    let events = await page.evaluate(() => ({
      applied: [...window.__settingsThemeAppliedEvents],
      canonicalized: [...window.__settingsAppearanceCanonicalizedEvents],
    }));
    assert.equal(events.applied.filter(reason => reason === 'preview').length, 1,
      '[' + target.name + '] a single mode click must apply exactly one preview; duplicate click listeners must not fire.');
    assert.equal(events.canonicalized.filter(reason => reason === 'mode-change').length, 1,
      '[' + target.name + '] a single mode click must have one canonical appearance action.');

    await page.evaluate(() => {
      window.__settingsThemeAppliedEvents.length = 0;
      window.__settingsAppearanceCanonicalizedEvents.length = 0;
    });
    await appearance.locator('[data-appearance-cancel]').click();
    await page.waitForFunction(() => window.ThemeContext?.isDirty?.() === false);
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'))).mode, savedBefore.mode,
      '[' + target.name + '] Cancel must leave saved appearance unchanged.');
    assert.equal((await page.evaluate(() => window.ThemeContext.get().mode)), savedBefore.mode);
    events = await page.evaluate(() => ({
      applied: [...window.__settingsThemeAppliedEvents],
      canonicalized: [...window.__settingsAppearanceCanonicalizedEvents],
    }));
    assert.equal(events.applied.filter(reason => reason === 'cancel').length, 1,
      '[' + target.name + '] Cancel must restore the preview exactly once.');

    await page.evaluate(() => {
      window.__settingsThemeAppliedEvents.length = 0;
      window.__settingsAppearanceCanonicalizedEvents.length = 0;
    });
    await appearance.locator('[data-mode="light"]').click();
    await appearance.locator('[data-appearance-save]').click();
    await page.waitForFunction(() => window.ThemeContext?.isDirty?.() === false && window.ThemeContext?.getSaved?.().mode === 'light');
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'))).mode, 'light',
      '[' + target.name + '] Save Appearance must persist the preview.');
    events = await page.evaluate(() => ({
      applied: [...window.__settingsThemeAppliedEvents],
      canonicalized: [...window.__settingsAppearanceCanonicalizedEvents],
    }));
    assert.equal(events.applied.filter(reason => reason === 'save').length, 1,
      '[' + target.name + '] Save Appearance must write/apply exactly once.');

    await page.evaluate(() => window.OVYXSettings.show('privacy'));
    const resetButton = page.locator('[data-settings-panel="privacy"] [data-clear-appearance]');
    await resetButton.waitFor({ state: 'visible' });
    await page.evaluate(() => { window.__settingsThemeAppliedEvents.length = 0; });
    await resetButton.click();
    await page.waitForFunction(() => window.ThemeContext?.getSaved?.().mode === 'dark' && window.ThemeContext?.isDirty?.() === false);
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'))).mode, 'dark',
      '[' + target.name + '] Reset appearance must persist the default theme.');
    assert.equal(
      (await page.evaluate(() => window.__settingsThemeAppliedEvents)).filter(reason => reason === 'reset').length,
      1,
      '[' + target.name + '] Reset must apply exactly once.',
    );

    // Fake an authenticated test account, then verify the capture-phase Profile save owns the click.
    await page.evaluate(() => {
      const user = {
        uid: 'settings-browser-user',
        email: 'settings@example.test',
        displayName: 'Initial Display',
        async getIdToken() { return 'settings-browser-id-token'; },
        async updateProfile(patch) { Object.assign(this, patch); },
      };
      const firebase = window.firebase || {};
      try {
        firebase.auth = () => ({ currentUser: user, async signOut() {} });
        window.firebase = firebase;
      } catch {
        Object.defineProperty(window, 'firebase', {
          configurable: true,
          value: { ...firebase, auth: () => ({ currentUser: user, async signOut() {} }) },
        });
      }
    });
    await page.evaluate(() => window.OVYXSettings.show('profile'));
    await page.locator('#profile-save-action').waitFor({ state: 'visible' });
    await page.waitForFunction(
      () => document.getElementById('ovyx-profile-server-status')?.textContent?.includes('Server profile last saved'),
      null,
      { timeout: 20000 },
    );
    await page.locator('#set-profile-name').fill('Browser Saved Display');
    await page.locator('#set-workspace-name').fill('Browser Saved Workspace');
    await page.locator('#profile-save-action').click();
    await page.waitForFunction(
      () => document.getElementById('ovyx-profile-server-status')?.textContent?.includes('Verified on server at'),
      null,
      { timeout: 20000 },
    );
    const profileWrites = profileCalls.filter(item => item.method === 'PUT');
    assert.equal(profileWrites.length, 1, '[' + target.name + '] one Save Profile click must make exactly one server write.');
    assert.deepEqual(profileWrites[0].body.profile, {
      displayName: 'Browser Saved Display',
      workspaceName: 'Browser Saved Workspace',
    });
    const profileMirror = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('ovyx.profile.v2.user.settings-browser-user') || '{}'));
    assert.equal(profileMirror.name, 'Browser Saved Display');
    assert.equal(profileMirror.workspace, 'Browser Saved Workspace');

    // Notification switches are drafts until Save; Save and Reset each write once.
    await page.evaluate(() => window.OVYXSettings.show('notifications'));
    const notificationPanel = page.locator('[data-settings-panel="notifications"]');
    await notificationPanel.locator('[data-notify="projectActivity"]').waitFor({ state: 'visible' });
    await page.waitForFunction(
      () => document.getElementById('ovyx-notification-server-status')?.textContent?.includes('Preferences loaded from your account'),
      null,
      { timeout: 20000 },
    );
    const toggle = notificationPanel.locator('[data-notify="projectActivity"]');
    const writesBeforeToggle = notificationCalls.filter(item => item.method === 'PUT').length;
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-checked'), 'false',
      '[' + target.name + '] notification toggle must update the unsaved draft state.');
    assert.equal(notificationCalls.filter(item => item.method === 'PUT').length, writesBeforeToggle,
      '[' + target.name + '] changing a notification must not silently save before the explicit Save action.');
    await notificationPanel.locator('#notify-save').click();
    await page.waitForFunction(
      () => document.getElementById('ovyx-notification-server-status')?.textContent?.includes('Server confirmed account preferences saved'),
      null,
      { timeout: 20000 },
    );
    const preferenceWrites = notificationCalls.filter(item => item.method === 'PUT');
    assert.equal(preferenceWrites.length, 1, '[' + target.name + '] Save Notification Preferences must make exactly one server write.');
    assert.equal(preferenceWrites[0].body.notifications.projectActivity, false);
    assert.equal(preferenceWrites[0].body.notifications.emailProductUpdates, true);

    await notificationPanel.locator('#notify-reset').click();
    await page.waitForFunction(
      () => document.getElementById('ovyx-notification-server-status')?.textContent?.includes('Server confirmed account preferences saved'),
      null,
      { timeout: 20000 },
    );
    const writesAfterReset = notificationCalls.filter(item => item.method === 'PUT');
    assert.equal(writesAfterReset.length, 2, '[' + target.name + '] Reset Notification Preferences must make exactly one additional server write.');
    assert.deepEqual(writesAfterReset[1].body.notifications, notificationDefaults);

    const relevantErrors = pageErrors.filter(message =>
      /ThemeContext|appearance|profile-save|notification|renderDataLayer|escDataLayer|ReferenceError/i.test(message));
    assert.deepEqual(relevantErrors, [], '[' + target.name + '] core Settings actions must not throw browser errors.');

    await context.close();
  }
  console.log('OVYX Settings core browser tests passed on desktop and mobile Chromium: single-owner Appearance preview/save/cancel/reset, exactly-once Profile server save, and explicit Notifications draft/save/reset persistence.');
} finally {
  await browser.close();
}
