import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const source = await readFile(new URL('../functions/api/backend/provision.js', import.meta.url), 'utf8');
const match = source.match(/const PAGES_D1_HEALTHCHECK_SOURCE = `([\s\S]*?)`;\nconst SECRET_CONTENT_PATTERNS/);
assert.ok(match, 'The backend provisioner must contain the internal Pages D1 proof route source.');

const directory = await mkdtemp(path.join(os.tmpdir(), 'ovyx-pages-d1-healthcheck-'));
try {
  const routePath = path.join(directory, 'healthcheck.mjs');
  await writeFile(routePath, match[1], 'utf8');
  const route = await import(pathToFileURL(routePath).href);
  const token = 'a'.repeat(64);
  const probeId = '12345678-1234-1234-1234-123456789abc';
  const nonceHash = createHash('sha256').update(token).digest('hex');
  const records = new Map([[probeId, { nonce_hash: nonceHash, created_at: Date.now() }]]);
  const queries = [];
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(value) {
            return {
              async first() {
                queries.push({ sql, value, action: 'read' });
                return records.get(String(value)) || null;
              },
              async run() {
                queries.push({ sql, value, action: 'delete' });
                records.delete(String(value));
                return { success: true };
              },
            };
          },
        };
      },
    },
  };
  const request = (value = token, id = probeId) => new Request('https://preview.example.pages.dev/api/__ovyx/healthcheck?probeId=' + id, {
    headers: { 'x-ovyx-probe-token': value },
  });
  const wrong = await route.onRequestGet({ request: request('b'.repeat(64)), env });
  assert.equal(wrong.status, 404);
  assert.equal(records.has(probeId), true, 'An incorrect token must not consume the proof.');
  const success = await route.onRequestGet({ request: request(), env });
  assert.equal(success.status, 204, 'The deployed Pages API must consume a valid D1 proof.');
  assert.equal(records.has(probeId), false, 'A successful proof must be single-use and delete its row.');
  const replay = await route.onRequestGet({ request: request(), env });
  assert.equal(replay.status, 404, 'A consumed proof must not be replayable.');
  assert.equal(queries.filter(item => item.action === 'delete').length, 1);
  const staleId = '22345678-1234-1234-1234-123456789abc';
  records.set(staleId, { nonce_hash: nonceHash, created_at: Date.now() - 601_000 });
  const stale = await route.onRequestGet({ request: request(token, staleId), env });
  assert.equal(stale.status, 404, 'Expired proof tokens must not be accepted.');
  assert.equal(records.has(staleId), true, 'Expired proof rows are left for the bounded cleanup query.');
  const unavailable = await route.onRequestGet({ request: request(), env: {} });
  assert.equal(unavailable.status, 503);
  console.log('OVYX Pages D1 live-binding healthcheck route tests passed.');
} finally {
  await rm(directory, { recursive: true, force: true });
}
