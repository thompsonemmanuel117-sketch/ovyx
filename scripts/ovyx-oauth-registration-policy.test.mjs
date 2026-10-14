import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf("  const OAUTH_INTENT_KEY = 'ovyx.oauth.intent.v1';");
const end = html.indexOf('  async function popupSignIn(kind){', start);
assert.ok(start >= 0 && end > start, 'OAuth policy helpers must exist before the popup handler');
const helperSource = html.slice(start, end);
for (const contract of [
  'function oauthIsNewUser(credential)',
  'async function enforceOAuthRegistration(a, credential, providerName)',
  "credential.user.delete()",
  "error.code = 'auth/registration-required'",
  "error.code = 'auth/registration-check-unavailable'",
]) {
  assert.ok(helperSource.includes(contract), 'OAuth registration policy is missing: ' + contract);
}
assert.ok(html.includes("await enforceOAuthRegistration(a,cred,providerName)"),
  'Popup OAuth must reject new accounts before workspace activation.');
assert.ok(html.includes("await enforceOAuthRegistration(a,redirectCredential,redirectProviderName)"),
  'Legacy redirect OAuth must reject new accounts before workspace activation.');
assert.ok(html.includes("saveOAuthIntent('signin')") &&
  html.includes("window.sessionStorage?.getItem(OAUTH_INTENT_KEY)"),
  'OAuth must always be an existing-account sign-in, never an account-creation route.');
assert.ok(!helperSource.includes('allowRegistration'), 'OAuth account creation must not be enabled by a signup-mode flag.');
const popupStart=html.indexOf('async function popupSignIn(kind){');
const popupEnd=html.indexOf('  function wrapRouter(){', popupStart);
assert.ok(popupStart >= 0 && popupEnd > popupStart);
assert.doesNotMatch(html.slice(popupStart,popupEnd), /signInWithRedirect/, 'Popup fallback must not bypass account-age enforcement.');
assert.ok(html.includes('if(u&&oauthLoginInFlight)') && html.includes("if(u&&rejectedOAuthUid&&String(u.uid||'')===rejectedOAuthUid"), 'Auth-state restoration must not activate a newly rejected OAuth identity.');

const state = { removedIntent: 0, deleted: 0, signedOut: 0, liveStates: [], authActions: [] };
const storage = new Map();
const sandbox = {
  window: {
    sessionStorage: {
      setItem: (key, value) => storage.set(key, value),
      getItem: key => storage.get(key) || null,
      removeItem: key => { if (storage.delete(key)) state.removedIntent += 1; },
    },
    firebase: { auth: {} },
  },
  clearActivation: () => { state.cleared = true; },
  setLiveState: value => state.liveStates.push(value),
  updateAuthAction: value => state.authActions.push(value),
};
const policy = vm.runInNewContext(helperSource + '\n;({ oauthIsNewUser, enforceOAuthRegistration, saveOAuthIntent, readOAuthIntent, clearOAuthIntent });', sandbox);

assert.equal(policy.oauthIsNewUser({ additionalUserInfo: { isNewUser: true } }), true);
assert.equal(policy.oauthIsNewUser({ additionalUserInfo: { isNewUser: false } }), false);
assert.equal(policy.oauthIsNewUser({ user: { metadata: { creationTime: '2026-10-14T10:00:00Z', lastSignInTime: '2026-10-14T10:00:02Z' } } }), true);
assert.equal(policy.oauthIsNewUser({ user: { metadata: { creationTime: '2025-01-01T10:00:00Z', lastSignInTime: '2026-10-14T10:00:00Z' } } }), false);

const existingCredential = { additionalUserInfo: { isNewUser: false }, user: { delete: async () => { state.deleted += 1; } } };
const auth = { signOut: async () => { state.signedOut += 1; } };
assert.equal(await policy.enforceOAuthRegistration(auth, existingCredential, 'Google', false), existingCredential);
assert.equal(state.deleted, 0, 'existing account must never be deleted');
assert.equal(state.signedOut, 0, 'existing account must not be signed out');
assert.equal(state.liveStates.length, 0, 'existing account should be allowed to continue');

const newCredential = { additionalUserInfo: { isNewUser: true }, user: { delete: async () => { state.deleted += 1; } } };
await assert.rejects(
  () => policy.enforceOAuthRegistration(auth, newCredential, 'Google', false),
  error => error.code === 'auth/registration-required',
);
assert.equal(state.deleted, 1, 'new OAuth account created during a Log In attempt must be removed');
assert.equal(state.signedOut, 1, 'a rejected OAuth account must be signed out');
assert.equal(state.cleared, true, 'rejected OAuth user must lose any workspace activation');
assert.deepEqual(state.liveStates, [false]);
assert.equal(state.authActions.at(-1), null);

const unknownCredential = { user: { delete: async () => { state.deleted += 1; } } };
await assert.rejects(
  () => policy.enforceOAuthRegistration(auth, unknownCredential, 'GitHub', false),
  error => error.code === 'auth/registration-check-unavailable',
);
assert.equal(state.deleted, 1, 'an ambiguous identity must not cause destructive deletion');
assert.equal(state.signedOut, 2, 'an ambiguous identity must fail closed');
assert.deepEqual(state.liveStates, [false, false]);

policy.saveOAuthIntent('signup');
assert.equal(policy.readOAuthIntent(), 'signup', 'signup intent must survive redirect');
policy.clearOAuthIntent();
assert.equal(policy.readOAuthIntent(), 'signin', 'cleared redirect intent must default to login');

console.log('OAuth registration policy tests passed: existing-only Login, explicit Sign Up, popup/redirect guards, and safe handling of ambiguous provider identity.');
