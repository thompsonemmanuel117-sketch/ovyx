import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isAllowedNewAccountProvider } from '../firebase-auth-blocking/policy.js';

assert.equal(isAllowedNewAccountProvider('password'), true, 'Explicit email/password account creation must remain allowed.');
assert.equal(isAllowedNewAccountProvider('PASSWORD'), true, 'Provider IDs should be normalized.');
assert.equal(isAllowedNewAccountProvider('google.com'), false, 'A new Google account must be blocked.');
assert.equal(isAllowedNewAccountProvider('github.com'), false, 'A new GitHub account must be blocked.');
assert.equal(isAllowedNewAccountProvider('facebook.com'), false, 'Unknown social providers must not bypass the policy.');
assert.equal(isAllowedNewAccountProvider(''), false, 'Missing provider identity must fail closed.');

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const signInStart = html.indexOf('async function signIn(e)');
const createStart = html.indexOf('async function createAccount()', signInStart);
const oauthStart = html.indexOf('async function popupSignIn(kind)', createStart);
const routerStart = html.indexOf('function wrapRouter()', oauthStart);
assert.ok(signInStart >= 0 && createStart > signInStart, 'The application shell must keep distinct sign-in and account-creation handlers.');
assert.ok(oauthStart > createStart && routerStart > oauthStart, 'OAuth sign-in handler boundary must be present.');
const signInSource = html.slice(signInStart, createStart);
const createSource = html.slice(createStart, oauthStart);
const oauthSource = html.slice(oauthStart, routerStart);
assert.ok(signInSource.includes('a.signInWithEmailAndPassword(email,password)'), 'Log In must authenticate an existing email/password account.');
assert.ok(html.includes("form.addEventListener('submit',signIn)"), 'The Log In form must be wired to the email/password sign-in handler.');
assert.ok(html.includes("'auth/operation-not-allowed':'This sign-in method is not enabled for the current Firebase project.'"), 'Disabled email/password provider errors must be surfaced instead of pretending sign-in worked.');
assert.ok(createSource.includes('auth().createUserWithEmailAndPassword(email,password)'), 'Creating an account must remain an explicit, separate action.');
assert.ok(oauthSource.includes("saveOAuthIntent('signin')"), 'Google/GitHub controls must stay on existing-account sign-in.');
assert.ok(oauthSource.includes('oauthLoginInFlight=true'), 'OAuth sign-in must be tracked so auth state cannot activate the workspace prematurely.');
assert.ok(oauthSource.includes('await enforceOAuthRegistration(a,cred,providerName)'), 'New Google/GitHub identities must be rejected before workspace activation.');
assert.doesNotMatch(oauthSource, /signInWithRedirect/, 'Popup failure must not fall back to an OAuth path that could skip the account-age check.');
assert.ok(fs.readFileSync(new URL('../firebase-auth-blocking/index.js', import.meta.url), 'utf8').includes('beforeUserCreated'), 'A Firebase blocking function must enforce policy before creating OAuth accounts.');

console.log('OVYX Auth tests passed: email/password account creation is explicit, Google/GitHub are existing-account-only, and the server blocking policy is covered.');
