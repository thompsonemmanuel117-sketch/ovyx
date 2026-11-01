import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const clientPath = new URL('./ovyx-cloudflare-backend-repair-client.mjs', import.meta.url);
const source = await fs.readFile(clientPath, 'utf8');
assert.match(source, /isTrustedGithubOidcRequestHostname/);
assert.match(source, /CLOUDFLARE_PAGES_PROJECT/);
assert.match(source, /BACKEND_CHECK_FAILED/);
assert.match(source, /changedPaths/);
assert.match(source, /--restore/);

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ovyx-backend-repair-rollback-'));
try {
  const site = path.join(root, 'site');
  const backup = path.join(root, 'backup');
  const originalFile = path.join(site, 'functions', 'api', 'catalog.js');
  const backupFile = path.join(backup, 'functions', 'api', 'catalog.js');
  await fs.mkdir(path.dirname(originalFile), { recursive: true });
  await fs.mkdir(path.dirname(backupFile), { recursive: true });
  await fs.writeFile(originalFile, 'export const version = 2;');
  await fs.writeFile(backupFile, 'export const version = 1;');
  await fs.writeFile(path.join(backup, 'original-report.json'), '{"status":"failed"}');
  const result = spawnSync(process.execPath, [
    new URL('./ovyx-cloudflare-backend-repair-client.mjs', import.meta.url).pathname,
    '--restore',
    '--site-dir', site,
    '--backup-dir', backup,
  ], { encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await fs.readFile(originalFile, 'utf8'), 'export const version = 1;',
    'Rejected backend repair must restore the exact original function source.');
  await assert.rejects(fs.access(path.join(site, 'original-report.json')),
    'The original runtime report must not be copied into the generated project.');
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
console.log('OVYX backend repair client tests passed: trusted request contract and exact source rollback.');
