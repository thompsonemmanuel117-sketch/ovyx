import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const legacyStart = html.indexOf('<script id="ovyx-v6-project-cloud-sync">');
const legacyEnd = html.indexOf('</script>', legacyStart);
assert.ok(legacyStart >= 0 && legacyEnd > legacyStart, 'The legacy project-sync compatibility layer must remain present.');
const legacy = html.slice(legacyStart, legacyEnd);

assert.match(legacy, /window\.OVYXProjectCloudSync=\{syncNow:compatibilitySyncNow,save:compatibilitySave,delete:compatibilityDelete,state:sync\}/,
  'Recovery and deletion callers must retain the legacy public API.');
assert.match(legacy, /window\.ProjectCloudSync\?\.load/, 'Legacy syncNow must delegate to the single active cloud-sync owner.');
assert.match(legacy, /window\.ProjectCloudSync\?\.remove/, 'Legacy deletion must delegate to the active cloud-sync owner.');
assert.doesNotMatch(legacy, /onAuthStateChanged/, 'The retired sync layer must not register a second Firebase auth listener.');
assert.doesNotMatch(legacy, /async function onAuth\(/, 'The retired sync layer must not retain an independently callable auth-pull handler.');

const deepStart = html.indexOf('<script id="ovyx-deep-repair-v1">');
const deepEnd = html.indexOf('</script>', deepStart);
assert.ok(deepStart >= 0 && deepEnd > deepStart, 'The primary project-sync runtime must remain present.');
const deep = html.slice(deepStart, deepEnd);
assert.match(deep, /loadGeneration:0/, 'Cloud loads must have an account/session generation guard.');
assert.match(deep, /const loadGeneration=\+\+this\.loadGeneration/, 'Each cloud load must invalidate older in-flight loads.');
assert.match(deep, /String\(latestUser\.uid\|\|''\)!==uid\|\|emailOf\(latestUser\)!==email/,
  'A late cloud response must not replace projects after an account switch.');
assert.match(deep, /cloud-sync-local-only/, 'Local-only drafts must be preserved in project recovery before cloud reconciliation.');
assert.match(deep, /ProjectCloudSync\.loadGeneration\+=1/, 'Signing out must invalidate pending cloud loads.');

const recoveryStart = html.indexOf('<script id="ovyx-project-recovery-v1">');
const recoveryEnd = html.indexOf('</script>', recoveryStart);
const recovery = html.slice(recoveryStart, recoveryEnd);
assert.match(recovery, /function storageKey\(\).*ovyx\.deleted-projects\.v1\.user\.'\+uid/,
  'Full project recovery snapshots must be isolated by Firebase UID.');
assert.match(recovery, /localStorage\.getItem\(storageKey\(\)\)/, 'Recovery reads must use the account-scoped key.');
assert.match(recovery, /localStorage\.setItem\(storageKey\(\)/, 'Recovery writes must use the account-scoped key.');

const projectsApi = await readFile(new URL('../functions/api/projects.js', import.meta.url), 'utf8');
assert.match(projectsApi, /PROJECT_OWNERSHIP_CONFLICT/, 'The server must continue rejecting cross-account project writes.');
assert.match(projectsApi, /expectedUpdateTime/, 'Cloud writes must retain Firestore optimistic concurrency protection.');
assert.match(projectsApi, /clean\(project\.ownerUid\)!==uid/, 'Project reads must remain owner-scoped.');

console.log('OVYX project cloud-sync ownership, account-switch and recovery contracts passed.');
