import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const firebaseConfig = JSON.parse(read('firebase.json'));
const rulesPath = firebaseConfig.storage?.rules;

assert.equal(firebaseConfig.firestore?.rules, 'firestore.rules',
  'The existing Firestore rules deployment mapping must remain intact.');
assert.equal(rulesPath, 'functions/api/_lib/storage.rules',
  'Firebase CLI configuration must point to the single maintained Storage rules file.');
assert.ok(fs.statSync(path.join(root, rulesPath)).isFile(),
  'The configured Storage rules file must exist.');

const rules = read(rulesPath);
const html = read('index.html');

assert.match(rules, /function owns\(userId\)[\s\S]*?request\.auth\s*!=\s*null[\s\S]*?request\.auth\.uid\s*==\s*userId/,
  'Every allowed Storage path must be tied to the authenticated owner UID.');

function scopedRule(header) {
  const start = rules.indexOf(header);
  assert.ok(start >= 0, 'Missing Storage rule: ' + header);
  const next = rules.indexOf('\n    match /', start + header.length);
  return rules.slice(start, next < 0 ? rules.length : next);
}

const projectAssets = scopedRule('match /users/{userId}/projects/{projectId}/assets/{assetId}/{fileName}');
assert.match(projectAssets, /allow read:\s*if owns\(userId\)/,
  'Project assets must be readable only by their owner.');
assert.match(projectAssets, /allow create, update:\s*if owns\(userId\)\s*&& validProjectAssetUpload\(\)/,
  'Project asset writes must be owner-authorized and validated.');
assert.match(projectAssets, /allow delete:\s*if owns\(userId\)/,
  'Project asset deletion must remain owner-authorized.');
assert.match(rules, /request\.resource\.size <= 100 \* 1024 \* 1024/,
  'Binary uploads must have an enforced server-side size ceiling.');
assert.match(rules, /application\/octet-stream/,
  'The rules must retain support for the generic binary MIME type accepted by the asset bridge.');

const profile = scopedRule('match /profile/{userId}/avatar.jpg');
assert.match(profile, /allow read:\s*if owns\(userId\)/);
assert.match(profile, /request\.resource\.size <= 8 \* 1024 \* 1024/,
  'Profile image uploads must retain the 8 MB product limit.');
assert.match(profile, /request\.resource\.contentType == 'image\/jpeg'/,
  'Profile uploads must match the JPEG produced by the resize pipeline.');

const templateReferences = scopedRule('match /ovyx-template-references/{userId}/{fileName}');
assert.match(templateReferences, /allow read:\s*if owns\(userId\)/);
assert.match(templateReferences, /validTemplateReferenceUpload\(\)/,
  'Template references must validate both size and media type.');

assert.match(rules, /match \/\{allPaths=\*\*\}[\s\S]*?allow read, write:\s*if false;/,
  'Unlisted Storage paths must remain denied by default.');
assert.doesNotMatch(rules, /match \/users\/\{userId\}\/\{allPaths=\*\*\}/,
  'Do not replace scoped project-asset rules with unrestricted writes throughout a user prefix.');

const assetScriptStart = html.indexOf('<script id="ovyx-stepB-asset-storage">');
const assetScriptEnd = html.indexOf('</script>', assetScriptStart);
assert.ok(assetScriptStart >= 0 && assetScriptEnd > assetScriptStart,
  'The existing project asset bridge must remain present.');
const assetBridge = html.slice(assetScriptStart, assetScriptEnd);
assert.match(assetBridge, /users\/\$\{uid\}\/projects\/\$\{projectId\}\/assets\/\$\{assetId\}\//,
  'Storage rules must match the current Web Studio project asset upload path.');
assert.match(html, /profile\/\$\{u\.uid\}\/avatar\.jpg/,
  'Storage rules must match the existing profile avatar upload path.');
assert.match(html, /ovyx-template-references\/\$\{u\.uid\}\//,
  'Storage rules must match the existing Admin Template Factory reference upload path.');

console.log('OVYX Firebase Storage rules tests passed: Firebase CLI mapping, owner isolation, upload limits, MIME restrictions, default deny, and all three existing upload paths are aligned.');
