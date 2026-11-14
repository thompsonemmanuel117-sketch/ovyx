import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { runCloudflarePagesBackendRuntime, validateBackendChecks } from './ovyx-generated-backend-runtime-eval.mjs';

const valid = validateBackendChecks({
  version: 1,
  backendRequired: true,
  backendChecks: [
    { id: 'health', method: 'GET', route: '/api/health', sourceFile: 'functions/api/health.js', expectedStatus: 200 },
    { id: 'create', method: 'POST', route: '/api/records', sourceFile: 'functions/api/records.js', expectedStatus: 201, sideEffect: 'disposable-local-only', body: { name: 'Synthetic item' }, identity: 'synthetic-owner-a' },
  ],
});
assert.equal(valid.ok, true);
assert.equal(valid.checks.length, 2);
assert.equal(validateBackendChecks({ version: 1, backendRequired: false, journeys: [], apiChecks: [], backendChecks: [] }).notRequired, true);

for (const backendChecks of [
  [{ id: 'charge', method: 'POST', route: '/api/payments/charge', body: { amount: 500 }, sideEffect: 'external-provider' }],
  [{ id: 'unsafe', method: 'POST', route: '/api/records', body: { email: 'real@example.com' }, sideEffect: 'disposable-local-only' }],
  [{ id: 'bad-route', method: 'GET', route: 'https://example.com/api/health' }],
  [{ id: 'secret-header', method: 'GET', route: '/api/health', headers: { authorization: 'Bearer secret' } }],
  [{ id: 'traversal', method: 'GET', route: '/api/../admin' }],
]) {
  assert.equal(validateBackendChecks({ version: 1, backendChecks }).ok, false,
    'Unsafe backend test intent must be rejected before a runtime starts.');
}

const withoutIsolation = await runCloudflarePagesBackendRuntime({ root: tmpdir() });
assert.equal(withoutIsolation.status, 'blocked', 'Untrusted generated Workers must never run outside an outbound-network-disabled container.');
assert.equal(withoutIsolation.testsRun, 0);

if (process.env.OVYX_QA_NETWORK_ISOLATION === 'docker-none') {
  const root = await mkdtemp(path.join(tmpdir(), 'ovyx-backend-runtime-fixture-'));
  try {
    await mkdir(path.join(root, 'functions', 'api'), { recursive: true });
    await mkdir(path.join(root, 'migrations'), { recursive: true });
    await writeFile(path.join(root, 'index.html'), '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Backend fixture</title></head><body>Backend fixture</body></html>');
    await writeFile(path.join(root, 'wrangler.jsonc'), JSON.stringify({
      name: 'ovyx-stage5-runtime-fixture',
      compatibility_date: '2026-10-30',
      pages_build_output_dir: '.',
      d1_databases: [{
        binding: 'DB',
        database_name: 'ovyx-stage5-runtime-fixture',
        database_id: '00000000-0000-0000-0000-000000000001',
        migrations_dir: 'migrations',
      }],
    }, null, 2));
    await writeFile(path.join(root, 'migrations', '0001_records.sql'),
      'CREATE TABLE records (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL);');
    await writeFile(path.join(root, 'functions', 'api', 'health.js'), [
      'export async function onRequest({ env }) {',
      "  const result = await env.DB.prepare('SELECT 1 AS ready').first();",
      '  return Response.json({ ready: result.ready });',
      '}',
    ].join('\n'));
    await writeFile(path.join(root, 'functions', 'api', 'records.js'), [
      'function identity(request, env) {',
      "  if (env.OVYX_QA_MODE !== '1' || request.headers.get('x-ovyx-qa-secret') !== env.OVYX_QA_TEST_SECRET) return null;",
      "  const value = request.headers.get('x-ovyx-qa-identity');",
      "  return value === 'synthetic-owner-a' || value === 'synthetic-owner-b' ? value : null;",
      '}',
      'export async function onRequest({ request, env }) {',
      '  const owner = identity(request, env);',
      "  if (!owner) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });",
      "  if (request.method === 'POST') {",
      '    const input = await request.json();',
      "    if (typeof input.name !== 'string' || input.name.length < 2) return Response.json({ error: 'INVALID' }, { status: 400 });",
      '    const id = crypto.randomUUID();',
      "    await env.DB.prepare('INSERT INTO records (id, owner_id, name) VALUES (?, ?, ?)').bind(id, owner, input.name).run();",
      "    return Response.json({ data: { id, name: input.name } }, { status: 201 });",
      '  }',
      "  const rows = await env.DB.prepare('SELECT id, name FROM records WHERE owner_id = ? ORDER BY name').bind(owner).all();",
      '  return Response.json({ data: rows.results || [] });',
      '}',
    ].join('\n'));
    await writeFile(path.join(root, 'ovyx-qa-plan.json'), JSON.stringify({
      version: 1,
      backendRequired: true,
      journeys: [],
      apiChecks: [],
      backendChecks: [
        { id: 'anonymous-denied', method: 'GET', sourceFile: 'functions/api/records.js', route: '/api/records', expectedStatus: 401 },
        { id: 'create-owner-a', method: 'POST', sourceFile: 'functions/api/records.js', route: '/api/records', expectedStatus: 201, sideEffect: 'disposable-local-only', identity: 'synthetic-owner-a', body: { name: 'Synthetic project' }, expect: { jsonPath: 'data.name', equals: 'Synthetic project' } },
        { id: 'owner-a-sees-record', method: 'GET', sourceFile: 'functions/api/records.js', route: '/api/records', expectedStatus: 200, identity: 'synthetic-owner-a', expect: { jsonPath: 'data.0.name', equals: 'Synthetic project' } },
        { id: 'owner-b-is-isolated', method: 'GET', sourceFile: 'functions/api/records.js', route: '/api/records', expectedStatus: 200, identity: 'synthetic-owner-b', expect: { jsonPath: 'data.length', equals: 0 } },
      ],
    }));
    const report = await runCloudflarePagesBackendRuntime({ root, sourceRoot: process.cwd() });
    assert.equal(report.status, 'passed', JSON.stringify(report));
    assert.equal(report.testsRun, 4);
    assert.ok(report.checks.every(check => check.status === 'passed'));
    process.stdout.write('OVYX isolated generated-backend runtime evaluator passed: Pages Functions, fresh D1 migrations, synthetic auth, CRUD and tenant isolation.\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
