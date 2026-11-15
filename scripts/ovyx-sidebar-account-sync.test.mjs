import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const asset = await readFile(new URL('../assets/ovyx-sidebar-account-sync.js', import.meta.url), 'utf8');
const picker = await readFile(new URL('../assets/ovyx-project-workspace-picker.js', import.meta.url), 'utf8');
const middleware = await readFile(new URL('../functions/_middleware.js', import.meta.url), 'utf8');

assert.doesNotThrow(() => new Function(asset), 'Sidebar account synchronizer must parse.');
assert.match(asset, /onAuthStateChanged/, 'Firebase auth changes must refresh the sidebar account.');
assert.match(asset, /ovyx:firebase-auth-sdk-ready/, 'Firebase SDK readiness must install the listener even when the SDK loads after the shell.');
assert.match(asset, /const refreshAuth = \(\) => \{ installAuthListener\(\); sync\(\); \}/, 'Auth-ready events must retry listener installation before syncing the account.');
assert.match(asset, /firebase-auth-state-ready|ovyx:auth-ready/, 'The account synchronizer must handle the app auth-ready lifecycle.');
assert.match(asset, /ovyx\.profile\.v2\.user\./, 'Profile preferences must be read from the current Firebase UID namespace.');
assert.match(asset, /sidebar-user-display-name/, 'Desktop account name must be synchronized.');
assert.match(asset, /v52-account-name/, 'Mobile drawer account name must be synchronized after its hub mounts.');
assert.match(asset, /v52-account-email/, 'Mobile drawer email must reflect the active Firebase account.');
assert.match(asset, /Sign in to your account/, 'Guest state must use a clear sign-in action label.');
assert.match(asset, /OVYXAuthRoutes|OVYXMasterAuth/, 'Guest profile navigation must open the existing authentication flow.');
assert.match(picker, /function syncSidebarWorkspaceLabel/, 'The existing sidebar workspace label must be synchronized.');
assert.match(picker, /syncSidebarWorkspaceLabel\(\);/, 'Workspace selection, rename and account reload must refresh the sidebar label.');
assert.match(middleware, /ovyx-sidebar-account-sync\.js\?v=20261114-4/, 'The account synchronizer must load in the production Pages shell.');
console.log('OVYX sidebar account and workspace synchronization contracts passed.');

assert.match(asset, /Watch only for account surfaces being mounted/, 'Account synchronization must not observe its own internal DOM updates.');
assert.match(asset, /records\.some\(record =>[\s\S]*?record\.addedNodes[\s\S]*?containsAccountSurface/, 'Late account surfaces must be detected only from inserted nodes.');
assert.doesNotMatch(asset, /new MutationObserver\(\(\) => sync\(\)\)\.observe\(mobile/, 'Do not watch all mobile account descendants and resync on every edit.');
assert.doesNotMatch(asset, /new MutationObserver\(\(\) => \{[\s\S]*?sync\(currentUser\(\)\);[\s\S]*?\}\)\.observe\(desktopName/, 'Do not watch desktop name text mutations and rewrite the same node.');
