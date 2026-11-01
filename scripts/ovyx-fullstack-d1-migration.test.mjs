import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = await mkdtemp(join(tmpdir(), 'ovyx-d1-migration-'));
const migrations = join(root, 'migrations');
const configPath = join(root, 'wrangler.toml');
const migrationPath = join(migrations, '0001_initial.sql');
const databaseName = 'ovyx-d1-migration-validation';
const migrationSql = [
  'CREATE TABLE contact_submissions (',
  '  id TEXT PRIMARY KEY,',
  '  name TEXT NOT NULL,',
  '  reply_to TEXT NOT NULL,',
  '  message TEXT NOT NULL,',
  "  status TEXT NOT NULL CHECK (status IN ('received', 'queued', 'sending', 'delivered', 'failed', 'closed')),",
  '  created_at TEXT NOT NULL',
  ');',
  'CREATE TABLE delivery_records (',
  '  id TEXT PRIMARY KEY,',
  '  source_id TEXT NOT NULL REFERENCES contact_submissions(id),',
  '  idempotency_key TEXT NOT NULL UNIQUE,',
  "  status TEXT NOT NULL CHECK (status IN ('queued', 'sending', 'delivered', 'failed')),",
  '  created_at TEXT NOT NULL',
  ');',
  'CREATE INDEX idx_contact_submissions_status_created_at ON contact_submissions(status, created_at);',
].join('\n');

try {
  await mkdir(migrations, { recursive: true });
  await writeFile(configPath, [
    'name = "ovyx-d1-migration-validation"',
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

  const wrangler = (...args) => execFileSync('npx', ['wrangler', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });

  wrangler('d1', 'execute', databaseName, '--local', '--file', migrationPath, '--config', configPath);
  const tables = wrangler(
    'd1', 'execute', databaseName, '--local', '--command',
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('contact_submissions', 'delivery_records') ORDER BY name;",
    '--config', configPath,
  );
  assert.match(tables, /contact_submissions/);
  assert.match(tables, /delivery_records/);

  const foreignKeys = wrangler(
    'd1', 'execute', databaseName, '--local', '--command',
    'PRAGMA foreign_key_check;',
    '--config', configPath,
  );
  assert.doesNotMatch(foreignKeys, /foreign key constraint failed/i);

  wrangler(
    'd1', 'execute', databaseName, '--local', '--command',
    "INSERT INTO contact_submissions (id, name, reply_to, message, status, created_at) VALUES ('contact-1', 'Name', 'email@example.com', 'Message', 'received', '2026-10-31T00:00:00Z');",
    '--config', configPath,
  );
  wrangler(
    'd1', 'execute', databaseName, '--local', '--command',
    "INSERT INTO delivery_records (id, source_id, idempotency_key, status, created_at) VALUES ('d1', 'contact-1', 'same-key', 'queued', '2026-10-31T00:00:00Z');",
    '--config', configPath,
  );

  let duplicateKeyRejected = false;
  try {
    wrangler(
      'd1', 'execute', databaseName, '--local', '--command',
      "INSERT INTO delivery_records (id, source_id, idempotency_key, status, created_at) VALUES ('d2', 'contact-1', 'same-key', 'queued', '2026-10-31T00:00:00Z');",
      '--config', configPath,
    );
  } catch {
    duplicateKeyRejected = true;
  }
  assert.equal(duplicateKeyRejected, true, 'The database must reject duplicate idempotency keys.');

  let rejectedInvalidStatus = false;
  try {
    wrangler(
      'd1', 'execute', databaseName, '--local', '--command',
      "INSERT INTO contact_submissions (id, name, reply_to, message, status, created_at) VALUES ('bad', 'Name', 'email@example.com', 'Message', 'invalid', '2026-10-31T00:00:00Z');",
      '--config', configPath,
    );
  } catch {
    rejectedInvalidStatus = true;
  }
  assert.equal(rejectedInvalidStatus, true, 'The generated schema contract must reject an invalid business state.');
} finally {
  await rm(root, { recursive: true, force: true });
}

process.stdout.write('OVYX local D1 migration smoke test passed.\n');
