import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = await mkdtemp(join(tmpdir(), 'ovyx-generated-backend-runtime-'));
const functionsDir = join(root, 'functions', 'api');
const migrationsDir = join(root, 'migrations');
const configPath = join(root, 'wrangler.toml');
const migrationPath = join(migrationsDir, '0001_initial.sql');
const routePath = join(functionsDir, 'records.js');
const databaseName = 'ovyx-generated-backend-runtime';
const wranglerBin = join(process.cwd(), 'node_modules', '.bin', 'wrangler');

const routeSource = [
  "const json = (body, status = 200) => Response.json(body, { status });",
  "function authenticate(request) { const token = request.headers.get('authorization') || ''; if (token === 'Bearer test-owner-a') return { id: 'owner-a' }; if (token === 'Bearer test-owner-b') return { id: 'owner-b' }; return null; }",
  "function validRecord(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) return false; if (typeof value.name !== 'string' || value.name.trim().length < 2 || value.name.length > 80) return false; if (typeof value.description !== 'string' || value.description.length > 500) return false; return Object.keys(value).every(key => ['name', 'description'].includes(key)); }",
  "export async function onRequestGet({ request, env }) { const user = authenticate(request); if (!user) return json({ error: { code: 'UNAUTHENTICATED' } }, 401); const id = new URL(request.url).searchParams.get('id'); if (id) { const record = await env.DB.prepare('SELECT id, name, description, owner_id FROM records WHERE id = ? AND owner_id = ?').bind(id, user.id).first(); return record ? json({ data: record }) : json({ error: { code: 'NOT_FOUND' } }, 404); } const result = await env.DB.prepare('SELECT id, name, description, owner_id FROM records WHERE owner_id = ? ORDER BY created_at DESC').bind(user.id).all(); return json({ data: result.results || [] }); }",
  "export async function onRequestPost({ request, env }) { const user = authenticate(request); if (!user) return json({ error: { code: 'UNAUTHENTICATED' } }, 401); let input; try { input = await request.json(); } catch { return json({ error: { code: 'INVALID_JSON' } }, 400); } if (!validRecord(input)) return json({ error: { code: 'VALIDATION_FAILED' } }, 400); const id = crypto.randomUUID(); const now = new Date().toISOString(); await env.DB.prepare('INSERT INTO records (id, owner_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, user.id, input.name.trim(), input.description, now, now).run(); return json({ data: { id, owner_id: user.id, name: input.name.trim(), description: input.description } }, 201); }",
  "export async function onRequestPut({ request, env }) { const user = authenticate(request); if (!user) return json({ error: { code: 'UNAUTHENTICATED' } }, 401); let input; try { input = await request.json(); } catch { return json({ error: { code: 'INVALID_JSON' } }, 400); } if (!input || typeof input.id !== 'string' || !validRecord({ name: input.name, description: input.description })) return json({ error: { code: 'VALIDATION_FAILED' } }, 400); const result = await env.DB.prepare('UPDATE records SET name = ?, description = ?, updated_at = ? WHERE id = ? AND owner_id = ?').bind(input.name.trim(), input.description, new Date().toISOString(), input.id, user.id).run(); if (!result.meta || result.meta.changes !== 1) return json({ error: { code: 'NOT_FOUND' } }, 404); return json({ data: { id: input.id, name: input.name.trim(), description: input.description, owner_id: user.id } }); }",
  "export async function onRequestDelete({ request, env }) { const user = authenticate(request); if (!user) return json({ error: { code: 'UNAUTHENTICATED' } }, 401); const id = new URL(request.url).searchParams.get('id'); if (!id) return json({ error: { code: 'VALIDATION_FAILED' } }, 400); const result = await env.DB.prepare('DELETE FROM records WHERE id = ? AND owner_id = ?').bind(id, user.id).run(); if (!result.meta || result.meta.changes !== 1) return json({ error: { code: 'NOT_FOUND' } }, 404); return json({ data: { deleted: true } }); }",
].join('\n');

const migrationSql = [
  'CREATE TABLE records (',
  '  id TEXT PRIMARY KEY,',
  '  owner_id TEXT NOT NULL,',
  '  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 80),',
  '  description TEXT NOT NULL CHECK (length(description) <= 500),',
  '  created_at TEXT NOT NULL,',
  '  updated_at TEXT NOT NULL',
  ');',
  'CREATE INDEX idx_records_owner_created ON records(owner_id, created_at);',
].join('\n');

let server;
let serverOutput = '';
let serverError = '';
let port;
try {
  await mkdir(functionsDir, { recursive: true });
  await mkdir(migrationsDir, { recursive: true });
  await writeFile(configPath, [
    'name = "ovyx-generated-backend-runtime"',
    'compatibility_date = "2026-10-31"',
    '',
    '[[d1_databases]]',
    'binding = "DB"',
    'database_name = "' + databaseName + '"',
    'database_id = "00000000-0000-0000-0000-000000000000"',
    'migrations_dir = "migrations"',
    '',
  ].join('\n'));
  await writeFile(migrationPath, migrationSql);
  await writeFile(routePath, routeSource);

  const wrangler = (...args) => {
    const child = spawn(wranglerBin, args, {
      cwd: root,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', code => code === 0
        ? resolve(stdout + stderr)
        : reject(new Error('Wrangler command failed (' + code + '): ' + stderr + stdout)));
    });
  };

  await wrangler('d1', 'execute', databaseName, '--local', '--file', migrationPath, '--config', configPath);
  const portServer = createServer();
  await new Promise((resolve, reject) => {
    portServer.once('error', reject);
    portServer.listen(0, '127.0.0.1', resolve);
  });
  port = portServer.address().port;
  await new Promise(resolve => portServer.close(resolve));

  server = spawn(wranglerBin, [
    'pages', 'dev', '.', '--local', '--ip', '127.0.0.1', '--port', String(port), '--config', configPath,
  ], {
    cwd: root,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
  server.stderr.on('data', chunk => { serverError += chunk.toString(); });

  const baseUrl = 'http://127.0.0.1:' + port;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) throw new Error('Local Pages runtime exited early: ' + serverError + serverOutput);
    try {
      const response = await fetch(baseUrl + '/api/records', { signal: AbortSignal.timeout(1000) });
      if (response.status === 401) { ready = true; break; }
    } catch {}
    await delay(500);
  }
  assert.equal(ready, true, 'Generated backend must start in the isolated local Pages runtime. ' + serverError);

  const request = (path, token, method = 'GET', body) => fetch(baseUrl + path, {
    method,
    headers: {
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(5000),
  });
  const anonymous = await request('/api/records');
  assert.equal(anonymous.status, 401, 'Anonymous reads must be rejected.');

  const invalid = await request('/api/records', 'test-owner-a', 'POST', { name: 'x', description: 'bad' });
  assert.equal(invalid.status, 400, 'Invalid request payloads must be rejected before persistence.');

  const createdResponse = await request('/api/records', 'test-owner-a', 'POST', { name: 'Project A', description: 'Owner A record' });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.ok(created.data.id);
  assert.equal(created.data.owner_id, 'owner-a');

  const ownerAList = await request('/api/records', 'test-owner-a');
  const ownerAData = await ownerAList.json();
  assert.equal(ownerAData.data.length, 1, 'Created records must persist and be readable.');
  assert.equal(ownerAData.data[0].id, created.data.id);

  const ownerBList = await request('/api/records', 'test-owner-b');
  const ownerBData = await ownerBList.json();
  assert.equal(ownerBData.data.length, 0, 'Another tenant must not see owner A records.');

  const crossOwnerRead = await request('/api/records?id=' + encodeURIComponent(created.data.id), 'test-owner-b');
  assert.equal(crossOwnerRead.status, 404, 'Cross-owner reads must be denied without disclosing the record.');

  const crossOwnerUpdate = await request('/api/records', 'test-owner-b', 'PUT', {
    id: created.data.id, name: 'Hijacked record', description: 'Should not be allowed',
  });
  assert.equal(crossOwnerUpdate.status, 404, 'Cross-owner updates must be denied.');

  const updatedResponse = await request('/api/records', 'test-owner-a', 'PUT', {
    id: created.data.id, name: 'Updated Project A', description: 'Persisted update',
  });
  assert.equal(updatedResponse.status, 200);
  const updated = await updatedResponse.json();
  assert.equal(updated.data.name, 'Updated Project A');

  const readUpdated = await request('/api/records?id=' + encodeURIComponent(created.data.id), 'test-owner-a');
  assert.equal((await readUpdated.json()).data.description, 'Persisted update');

  const crossOwnerDelete = await request('/api/records?id=' + encodeURIComponent(created.data.id), 'test-owner-b', 'DELETE');
  assert.equal(crossOwnerDelete.status, 404, 'Cross-owner deletion must be denied.');

  const deleted = await request('/api/records?id=' + encodeURIComponent(created.data.id), 'test-owner-a', 'DELETE');
  assert.equal(deleted.status, 200);
  const afterDelete = await request('/api/records?id=' + encodeURIComponent(created.data.id), 'test-owner-a');
  assert.equal(afterDelete.status, 404, 'Deleted data must no longer be returned.');

  process.stdout.write('OVYX generated-backend runtime integration test passed: auth, validation, D1 CRUD and tenant isolation.\n');
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([
      new Promise(resolve => server.once('exit', resolve)),
      delay(5000),
    ]);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
  await rm(root, { recursive: true, force: true });
}
