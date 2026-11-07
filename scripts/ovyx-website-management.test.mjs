import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeSettings } from '../functions/api/site-management.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [api, client, middleware, packageSource] = await Promise.all([
  read('functions/api/site-management.js'),
  read('assets/ovyx-website-management.js'),
  read('functions/_middleware.js'),
  read('package.json'),
]);

assert.match(packageSource, /ovyx-website-management\.test\.mjs/);
assert.match(middleware, /ovyx-website-management\.js/);
assert.match(api, /authenticateRequest/);
assert.match(api, /from '\.\.\/_lib\/firebase-admin\.js'/, 'The endpoint must use the shared Firebase Admin helpers that support owner-scoped subcollections.');
assert.match(api, /loadOwnedProject/);
assert.match(api, /ownerUid/);
assert.match(api, /ownerEmail/);
assert.match(api, /expectedUpdateTime/);
assert.match(api, /listFirestoreSubcollectionDocumentsAtPath/);
assert.match(api, /setFirestoreDocumentAtPath/);
assert.match(api, /Before website settings update/);
assert.match(api, /Before restoring/);
assert.match(api, /MAX_BACKUPS = 20/);
assert.match(api, /BACKUP_TOO_LARGE/);
assert.match(api, /RESTORE_TOO_LARGE/);
assert.match(api, /not connected to this website yet/);
assert.match(client, /My Websites/);
assert.match(client, /Content/);
assert.match(client, /Media/);
assert.match(client, /Settings/);
assert.match(client, /Backups/);
assert.match(client, /Analytics/);
assert.match(client, /Publishing/);
assert.match(client, /\['downloads','Downloads'\]/, 'Downloads must be a first-class Manage Website tab.');
assert.match(client, /async function renderDownloads\(root\)/, 'The Downloads section must render inside Manage Website.');
assert.match(client, /Complete project/);
assert.match(client, /Frontend only/);
assert.match(client, /Backend only/);
assert.match(client, /exporter\.export\(\{ mode: option\.mode \}\)/, 'All download cards must reuse the existing project export engine.');
assert.match(client, /exporter\.inspect\(\{ mode: option\.mode \}\)/, 'Each download card must inspect availability before enabling export.');
assert.match(client, /The active website changed/, 'An export must not silently use a different project after switching websites.');
assert.match(client, /never puts private API keys, Firebase credentials or Cloudflare secrets/);
assert.match(client, /ovym-download-grid/);
assert.match(client, /OVYXAssetStore/);
const assetsApi = await read('functions/api/assets.js');
assert.match(client, /Search images by filename or type/, 'The Media Library must provide working asset search.');
assert.match(client, /Delete image/, 'The Media Library must expose explicit image deletion.');
assert.match(client, /storage\.ref\(String\(asset\.storagePath\)\)\.delete\(\)/, 'Image deletion must remove the authenticated Firebase Storage object before its metadata.');
assert.match(client, /api\/assets\?projectId=/, 'Image deletion must remove the matching owner-scoped asset metadata.');
assert.match(assetsApi, /method === 'DELETE'/, 'The existing owner-scoped asset API must remain the metadata deletion authority.');
assert.match(assetsApi, /ASSET_ACCESS_DENIED/, 'Asset deletion must retain server-side ownership checks.');

assert.ok(client.includes('function setDashboardBottomNavHidden(hidden)'), 'Manage Website must explicitly control visibility of the mobile dashboard navigation.');
assert.ok(client.includes('function isManageDashboardDock(node)'), 'Manage Website must detect the real dock by computed positioning and viewport geometry, matching the proven Assistant shield.');
assert.ok(client.includes("['display', 'visibility', 'opacity', 'pointer-events', 'transform']"), 'Manage Website must suppress dock visibility and interaction, not rely on a class alone.');
assert.ok(client.includes('function syncDashboardBottomNavigation(forceHidden)'), 'Manage Website must reassert dock suppression when dashboard controllers update it.');
assert.ok(client.includes('attributeFilter: [\'class\', \'style\', \'hidden\', \'aria-hidden\']'), 'Manage Website must watch dashboard dock state mutations.');
assert.ok(client.includes('window.visualViewport.addEventListener'), 'Manage Website must track mobile visual viewport changes.');
assert.match(client, /ovym-dashboard-bottom-nav-suppressed/, 'The dashboard bottom navigation must be fully hidden while Manage Website is open.');
assert.ok(client.includes('setDashboardBottomNavHidden(true)'), 'Opening Manage Website must hide the dashboard bottom navigation.');
assert.ok(client.includes('setDashboardBottomNavHidden(false)'), 'Closing Manage Website must restore the dashboard bottom navigation.');
assert.match(client, /function openWorkspace\(\)/, 'The sidebar entry must open the Manage Website hub rather than the source editor.');
assert.match(client, /width:100vw;height:100dvh/, 'Manage Website must occupy the full viewport as its own workspace, not a narrow slide-out panel.');
assert.match(client, /function openWorkspace\(\)[\s\S]*?open\(\);[\s\S]*?return true;/, 'Opening Manage Website must not navigate through Web Studio first.');
assert.doesNotMatch(client, /function openWorkspace\(\)[\s\S]*?Router\.go\('webstudio'\)/, 'Manage Website navigation must not force Web Studio open.');
assert.match(client, /ovym-auth-state/, 'Unauthenticated users must see a deliberate sign-in state in the page body.');
assert.match(client, /footer\.hidden = true/, 'Authentication errors must not be duplicated in the bottom status bar.');
assert.match(client, /flex-wrap:wrap/, 'Management tabs must wrap on narrow mobile screens instead of overflowing horizontally.');
assert.match(client, /node\.classList\.toggle\('active', selected\)/, 'The management hub must keep sidebar selection in sync.');
assert.match(client, /function close\(\)[\s\S]*activeView\(\)/, 'Closing management must restore the active route selection.');
assert.doesNotMatch(client, /open\(\); render\('content'\)/, 'Project switching must not trigger duplicate content renders.');
assert.match(client, /ProjectStore\.open\(p\.id\)/, 'Selecting a website must activate that exact saved project.');
assert.match(client, /String\(window\.KernelState\.activeProject\.id\) !== String\(p\.id\)/, 'A failed project switch must not show content from the previously selected website.');
assert.match(client, /openCodeEditor\(path\)/, 'Manage Website must open the real source editor for the selected file.');
assert.match(client, /button\(root, 'Open Code Editor'/, 'Manage Website must provide a direct Code Editor entry point.');
assert.match(client, /Pages & Content/);
assert.match(client, /Media Library/);
assert.match(client, /Website Settings/);
assert.doesNotMatch(client, /launcher\.id = ROOT \+ '-launcher'/, 'The old floating launcher must not remain as a duplicate entry point.');
assert.match(client, /api\/projects/);
assert.match(client, /api\/site-management/);
assert.match(client, /Restore this earlier website version/);
assert.match(client, /do not claim to rewrite the published HTML/);
assert.match(client, /No estimated or invented traffic/);

const normalized = normalizeSettings({
  title: '<script>alert(1)</script>',
  language: '../../invalid',
  navigation: [
    { label: 'Unsafe', path: 'javascript:alert(1)' },
    { label: 'Protocol relative', path: '//attacker.example' },
    { label: 'Traversal', path: '../private' },
    { label: 'Home', path: '/' },
    { label: 'About', path: 'about.html' },
  ],
});
assert.equal(normalized.language, 'en', 'Invalid language tags must normalize to a safe default.');
assert.deepEqual(normalized.navigation.map(item => item.path), ['/', 'about.html'],
  'Navigation must reject script URLs, protocol-relative URLs and path traversal.');
assert.equal(normalized.title, '<script>alert(1)</script>',
  'Settings are stored as text; consumers must escape them when rendering.');

console.log('OVYX Stage 8 website-management contracts passed.');
