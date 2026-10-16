import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local OVYX Pages app.');

async function waitForRouteRestore(page) {
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
    page.setDefaultTimeout(15000);
    const pageErrors = [];
    page.on('pageerror', error => {
      if (/security|revoke|session|Settings/i.test(error.message)) pageErrors.push(error.message);
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
    await page.waitForFunction(() => window.KernelState?.activeView === 'settings', null, { timeout: 15000 });
    await page.locator('#view-settings').waitFor({ state: 'visible' });

    await page.evaluate(() => {
      const user = {
        uid: 'security-browser-test-user',
        email: 'security-browser-test@example.test',
        deleteCalls: 0,
        async getIdToken() { return 'security-browser-test-token'; },
        async getIdTokenResult() {
          return { claims: { auth_time: Math.floor(Date.now() / 1000) - 301 } };
        },
        async delete() { this.deleteCalls += 1; },
      };
      window.__securityTestState = { currentUser: user, signOutCalls: 0 };
      window.__securityToasts = [];
      // The Security runtime now routes errors through window.showToast before its DOM fallback.
      // Observe the public feedback contract directly instead of assuming the app's toast markup.
      window.showToast = (message, type) => {
        window.__securityToasts.push({ message: String(message ?? ''), type: String(type || 'info') });
      };
      const auth = {
        get currentUser() { return window.__securityTestState.currentUser; },
        async signOut() {
          window.__securityTestState.signOutCalls += 1;
          window.__securityTestState.currentUser = null;
        },
      };
      const firebaseStub = window.firebase || {};
      Object.defineProperty(firebaseStub, 'auth', {
        configurable: true, enumerable: true, writable: true, value: () => auth,
      });
      Object.defineProperty(window, 'firebase', {
        configurable: true, enumerable: true, writable: true, value: firebaseStub,
      });
    });

    await page.evaluate(() => window.OVYXSettings.show('security'));
    const button = page.locator('#ovyx-revoke-all-devices');
    await button.waitFor({ state: 'visible' });

    let nextReply = {
      status: 200,
      body: { ok: false, revoked: false, message: 'The server did not confirm that all sessions were revoked.' },
    };
    const requests = [];
    await page.route('**/api/api/auth/revoke-sessions', async route => {
      const request = route.request();
      requests.push({ method: request.method(), headers: await request.allHeaders() });
      await route.fulfill({
        status: nextReply.status,
        contentType: 'application/json; charset=utf-8',
        headers: { 'Cache-Control': 'no-store' },
        body: JSON.stringify(nextReply.body),
      });
    });

    // A 2xx status without the positive revocation result must not log out the browser.
    let responseWait = page.waitForResponse(r =>
      r.url().includes('/api/api/auth/revoke-sessions') && r.request().method() === 'POST');
    await button.click();
    await responseWait;
    await page.waitForFunction(() => {
      const current = document.getElementById('ovyx-revoke-all-devices');
      return current && !current.disabled && window.__securityToasts?.some(t => t.type === 'error' && /did not confirm/i.test(t.message));
    });
    let state = await page.evaluate(() => ({
      signOutCalls: window.__securityTestState.signOutCalls,
      uid: window.__securityTestState.currentUser?.uid || null,
      toasts: [...window.__securityToasts],
      disabled: document.getElementById('ovyx-revoke-all-devices')?.disabled ?? null,
      busy: document.getElementById('ovyx-revoke-all-devices')?.getAttribute('aria-busy') || null,
    }));
    assert.equal(state.signOutCalls, 0, '[' + target.name + '] unconfirmed HTTP 200 must not sign out.');
    assert.equal(state.uid, 'security-browser-test-user');
    assert.ok(state.toasts.some(t => t.type === 'error' && /did not confirm/i.test(t.message)),
      '[' + target.name + '] unconfirmed revocation must show an error, not success: ' + JSON.stringify(state.toasts));
    assert.ok(!state.toasts.some(t => t.type === 'success' && /all devices have been logged out/i.test(t.message)),
      '[' + target.name + '] unconfirmed revocation must not display success feedback.');
    assert.equal(state.disabled, false);
    assert.equal(state.busy, null);

    nextReply = {
      status: 503,
      body: { ok: false, code: 'AUTH_REVOCATION_FAILED', message: 'Simulated session revocation outage.' },
    };
    responseWait = page.waitForResponse(r =>
      r.url().includes('/api/api/auth/revoke-sessions') && r.request().method() === 'POST');
    await button.click();
    await responseWait;
    await page.waitForFunction(() => {
      const current = document.getElementById('ovyx-revoke-all-devices');
      return current && !current.disabled && window.__securityToasts?.some(t => t.type === 'error' && /simulated session revocation outage/i.test(t.message));
    });
    state = await page.evaluate(() => ({
      signOutCalls: window.__securityTestState.signOutCalls,
      uid: window.__securityTestState.currentUser?.uid || null,
      toasts: [...window.__securityToasts],
    }));
    assert.equal(state.signOutCalls, 0, '[' + target.name + '] HTTP 503 must not sign out.');
    assert.equal(state.uid, 'security-browser-test-user');
    assert.ok(state.toasts.some(t => t.type === 'error' && /simulated session revocation outage/i.test(t.message)),
      '[' + target.name + '] outage must be reported: ' + JSON.stringify(state.toasts));

    // Delete Account: cancellation must be a no-op; stale recent-auth must stop before the API.
    // Even a regression cannot delete anything: the only route is intercepted with a failure response.
    let accountDeleteRequests = 0;
    await page.route('**/api/account/delete', async route => {
      accountDeleteRequests += 1;
      await route.fulfill({
        status: 503,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ ok: false, code: 'TEST_DELETE_BLOCKED', error: 'Test blocked account deletion.' }),
      });
    });
    const deleteButton = page.locator('#ovyx-security-delete');
    await deleteButton.waitFor({ state: 'visible' });
    await page.evaluate(() => { window.confirm = () => false; });
    await deleteButton.click();
    await page.waitForFunction(() => {
      const button = document.getElementById('ovyx-security-delete');
      return button && !button.disabled;
    });
    let deletionState = await page.evaluate(() => ({
      uid: window.__securityTestState.currentUser?.uid || null,
      deleteCalls: window.__securityTestState.currentUser?.deleteCalls || 0,
    }));
    assert.equal(accountDeleteRequests, 0, '[' + target.name + '] cancelling Delete Account must not call the server.');
    assert.equal(deletionState.deleteCalls, 0, '[' + target.name + '] cancelling Delete Account must not delete the Firebase user.');
    assert.equal(deletionState.uid, 'security-browser-test-user');

    await page.evaluate(() => { window.confirm = () => true; });
    await deleteButton.click();
    await page.waitForFunction(() => {
      const button = document.getElementById('ovyx-security-delete');
      return button && !button.disabled
        && window.__securityToasts?.some(t => t.type === 'error' && /sign in again before deleting your account/i.test(t.message));
    }, null, { timeout: 10000 });
    deletionState = await page.evaluate(() => ({
      uid: window.__securityTestState.currentUser?.uid || null,
      deleteCalls: window.__securityTestState.currentUser?.deleteCalls || 0,
      toasts: [...window.__securityToasts],
    }));
    assert.equal(accountDeleteRequests, 0, '[' + target.name + '] stale recent-auth must be rejected before the account deletion API.');
    assert.equal(deletionState.deleteCalls, 0, '[' + target.name + '] stale recent-auth must not delete the Firebase user.');
    assert.equal(deletionState.uid, 'security-browser-test-user');
    assert.ok(deletionState.toasts.some(t => t.type === 'error' && /sign in again before deleting your account/i.test(t.message)),
      '[' + target.name + '] stale recent-auth must explain that a fresh sign-in is required.');

    // Positive server confirmation is required before local sign-out and success messaging.
    nextReply = {
      status: 200,
      body: {
        ok: true, authenticated: true, revoked: true, reauthenticationRequired: true,
        message: 'All Firebase refresh-token sessions were revoked.',
      },
    };
    responseWait = page.waitForResponse(r =>
      r.url().includes('/api/api/auth/revoke-sessions') && r.request().method() === 'POST');
    await button.click();
    await responseWait;
    await page.waitForFunction(() => window.__securityTestState?.signOutCalls === 1
      && window.__securityTestState.currentUser === null
      && window.__securityToasts?.some(t => t.type === 'success' && /all devices have been logged out/i.test(t.message)), null, { timeout: 10000 });

    assert.equal(requests.length, 3, '[' + target.name + '] each click must issue exactly one revocation request.');
    assert.ok(requests.every(r => r.method === 'POST'), '[' + target.name + '] revocation must use POST.');
    assert.ok(requests.every(r => r.headers.authorization === 'Bearer security-browser-test-token'),
      '[' + target.name + '] each request must include the Firebase ID token.');
    assert.deepEqual(pageErrors, [], '[' + target.name + '] Security interactions must not throw browser errors.');

    await context.close();
  }
  console.log('OVYX Security browser tests passed on desktop and mobile: Log Out All Devices rejects unconfirmed 2xx responses, handles outages, signs out only after confirmed revocation, and Delete Account safely cancels and rejects stale recent authentication.');
} finally {
  await browser.close();
}
