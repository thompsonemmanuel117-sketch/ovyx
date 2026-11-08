import assert from 'node:assert/strict';
import { createCloudflareD1Adapter, splitSafeAdditiveMigration } from '../functions/_lib/backend-cloudflare-adapter.js';

const valid = [
  'CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, name TEXT NOT NULL);',
  "CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);",
  'ALTER TABLE customers ADD COLUMN created_at TEXT;',
];
assert.equal(splitSafeAdditiveMigration(valid.join('\n')).length, 3);
assert.equal(splitSafeAdditiveMigration("CREATE TABLE notes (body TEXT DEFAULT 'one;two');").length, 1);
for (const sql of [
  'DROP TABLE customers;',
  'CREATE TABLE x (id TEXT); DELETE FROM users;',
  'PRAGMA writable_schema=ON;',
  'CREATE TRIGGER t AFTER INSERT ON x BEGIN DELETE FROM x; END;',
  'CREATE TABLE _ovyx_migrations (version INTEGER);',
  "CREATE TABLE x (id TEXT); /* never closed",
]) assert.throws(() => splitSafeAdditiveMigration(sql));

assert.throws(() => createCloudflareD1Adapter({ accountId: 'bad', apiToken: 'short' }), { code: 'BACKEND_CLOUDFLARE_NOT_CONFIGURED' });

const calls = [];
const databases = new Map();
const fetchImpl = async (url, init = {}) => {
  const path = new URL(url).pathname;
  calls.push({ path, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
  if (path.endsWith('/d1/database') && (init.method || 'GET') === 'GET') {
    return Response.json({ success: true, result: [...databases.values()], result_info: { total_pages: 1 } });
  }
  if (path.endsWith('/d1/database') && init.method === 'POST') {
    const body = JSON.parse(init.body);
    const value = { uuid: '12345678-1234-1234-1234-123456789abc', name: body.name };
    databases.set(body.name, value);
    return Response.json({ success: true, result: value });
  }
  if (path.includes('/d1/database/') && !path.endsWith('/query')) {
    const id = path.split('/').at(-1);
    const value = [...databases.values()].find(item => item.uuid === id);
    return Response.json({ success: true, result: value });
  }
  if (path.endsWith('/query')) {
    const body = JSON.parse(init.body);
    if (body.sql?.startsWith('SELECT version')) return Response.json({ success: true, result: [{ success: true, results: [] }] });
    return Response.json({ success: true, result: [{ success: true, results: [] }] });
  }
  return Response.json({ success: false, errors: [{ code: 1 }] }, { status: 500 });
};
const adapter = createCloudflareD1Adapter({ accountId: 'a'.repeat(32), apiToken: 'x'.repeat(32), fetchImpl });
const database = await adapter.ensureDatabase({ name: 'ovyx-0123456789abcdef-preview' });
assert.equal(database.id, '12345678-1234-1234-1234-123456789abc');
const again = await adapter.ensureDatabase({ name: 'ovyx-0123456789abcdef-preview' });
assert.equal(again.id, database.id);
assert.equal(calls.filter(call => call.method === 'POST' && call.path.endsWith('/d1/database')).length, 1);
const migrationContent = 'CREATE TABLE people (id TEXT PRIMARY KEY);';
const migrationHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(migrationContent))), byte => byte.toString(16).padStart(2, '0')).join('');
const migrations = await adapter.applyMigrations(database.id, [
  { version: 1, sha256: migrationHash, content: migrationContent },
]);
assert.deepEqual(migrations.applied, [{ version: 1, status: 'applied' }]);
assert.ok(calls.some(call => call.body?.batch?.length === 2));
assert.ok(!JSON.stringify(calls).includes('x'.repeat(32)));

console.log('OVYX Cloudflare D1 adapter safety tests passed.');
