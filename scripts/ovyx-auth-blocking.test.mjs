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
assert.ok(html.includes("'auth/operation-not-allowed':'This sign-in option is not available here. Choose another option or contact support.'"), 'Disabled email/password provider errors must be surfaced instead of pretending sign-in worked.');
assert.ok(createSource.includes('auth().createUserWithEmailAndPassword(email,password)'), 'Creating an account must remain an explicit, separate action.');
assert.ok(oauthSource.includes("saveOAuthIntent('signin')"), 'Google/GitHub controls must stay on existing-account sign-in.');
assert.ok(oauthSource.includes('oauthLoginInFlight=true'), 'OAuth sign-in must be tracked so auth state cannot activate the workspace prematurely.');
assert.ok(oauthSource.includes('await enforceOAuthRegistration(a,cred,providerName)'), 'New Google/GitHub identities must be rejected before workspace activation.');
assert.doesNotMatch(oauthSource, /signInWithRedirect/, 'Popup failure must not fall back to an OAuth path that could skip the account-age check.');
assert.ok(fs.readFileSync(new URL('../firebase-auth-blocking/index.js', import.meta.url), 'utf8').includes('beforeUserCreated'), 'A Firebase blocking function must enforce policy before creating OAuth accounts.');

console.log('OVYX Auth tests passed: email/password account creation is explicit, Google/GitHub are existing-account-only, and the server blocking policy is covered.');


// Startup readiness regression: Firebase Auth must not inherit Firestore/Storage
// latency, and a restored user must be observed before optional async bootstrap.
const firebaseLoaderStart = html.indexOf('<script id="ovyx-firebase-runtime-loader">');
const firebaseLoaderEnd = html.indexOf('</script>', firebaseLoaderStart);
const firebaseLoader = html.slice(firebaseLoaderStart, firebaseLoaderEnd);
const authRuntimeStart = html.indexOf('<script id="ovyx-master-auth-infrastructure-final">');
const authRuntimeEnd = html.indexOf('</script>', authRuntimeStart);
const authRuntime = html.slice(authRuntimeStart, authRuntimeEnd);
const deepRepairStart = html.indexOf('<script id="ovyx-deep-repair-v1">');
const deepRepairEnd = html.indexOf('</script>', deepRepairStart);
const deepRepair = html.slice(deepRepairStart, deepRepairEnd);
assert.ok(firebaseLoaderStart >= 0 && firebaseLoaderEnd > firebaseLoaderStart, 'The Firebase runtime loader must remain present.');
assert.ok(firebaseLoader.includes('__OVYX_FIREBASE_AUTH_READY_PROMISE__'), 'Firebase must expose a separate Auth readiness promise.');
assert.ok(firebaseLoader.includes('finishAuthReady(true)'), 'Auth readiness must resolve immediately after firebase-auth-compat loads.');
assert.ok(firebaseLoader.indexOf('await authLoad') < firebaseLoader.indexOf('finishAuthReady(true)'), 'Auth readiness must follow the Auth SDK load.');
assert.ok(authRuntimeStart >= 0 && authRuntimeEnd > authRuntimeStart, 'The final authentication runtime must remain present.');
assert.ok(authRuntime.includes('initialAuthStateReady'), 'A first-state observer must exist during auth bootstrap.');
assert.ok(authRuntime.indexOf('initialAuthStateReady') < authRuntime.indexOf("await withAuthDeadline(()=>a.setPersistence"), 'The restored-session observer must be installed before persistence setup.');
assert.ok(authRuntime.indexOf('initialAuthStateReady') < authRuntime.indexOf("await withAuthDeadline(()=>a.getRedirectResult"), 'The restored-session observer must be installed before redirect-result checks.');
assert.ok(authRuntime.includes("'Firebase persistence setup',2500"), 'Persistence setup must have a finite deadline.');
assert.ok(authRuntime.includes("'Firebase redirect-result check',3500"), 'Redirect-result handling must have a finite deadline.');
assert.ok(authRuntime.includes('__OVYX_AUTH_BOOT_COMPLETE__=true'), 'Auth startup must record when its primary listener is attached.');
assert.ok(authRuntime.includes("ovyx:firebase-auth-sdk-ready"), 'Late Auth SDK readiness must retry startup instead of leaving the shell permanently uninitialized.');
assert.ok(authRuntime.includes('The dashboard remains available'), 'A missing Firebase SDK must not force a full-screen auth overlay.');
assert.ok(deepRepair.includes("window.__OVYX_FIREBASE_AUTH_READY__===false"), 'Protected-action gates must distinguish an unavailable SDK from an unfinished session restore.');
