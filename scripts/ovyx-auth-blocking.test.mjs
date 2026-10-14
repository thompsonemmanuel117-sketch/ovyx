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
assert.ok(signInSource.includes('auth/operation-not-allowed'), 'Disabled email/password provider errors must be surfaced instead of pretending sign-in worked.');
assert.ok(createSource.includes('auth().createUserWithEmailAndPassword(email,password)'), 'Creating an account must remain an explicit, separate action.');
assert.ok(oauthSource.includes('oauthLoginInFlight=true'), 'OAuth sign-in must be tracked so auth state cannot activate the workspace prematurely.');
assert.ok(oauthSource.includes("!additional||typeof additional.isNewUser!=='boolean'"), 'Unknown OAuth account age must fail closed.');
assert.ok(oauthSource.includes('additional.isNewUser===true'), 'New Google/GitHub identities must be rejected.');
assert.ok(oauthSource.includes('cred.user.delete()'), 'The browser must attempt to remove a newly created rejected OAuth identity.');
assert.doesNotMatch(oauthSource, /signInWithRedirect/, 'Popup failure must not fall back to an OAuth path that could skip the account-age check.');

console.log('OVYX Auth tests passed: separate email/password sign-in and account creation, existing-account-only Google/GitHub login checks, and fail-closed unknown OAuth state.');
