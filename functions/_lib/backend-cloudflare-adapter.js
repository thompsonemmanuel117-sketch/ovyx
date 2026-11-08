const API_ROOT = 'https://api.cloudflare.com/client/v4';
const MAX_LIST_PAGES = 10;
const REQUEST_TIMEOUT_MS = 15_000;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function fail(code, message, status = 400) {
  throw Object.assign(new Error(message), { code, status });
}
function safeDatabaseName(value) {
  const name = String(value || '').trim().toLowerCase();
  if (!/^ovyx-[a-f0-9]{16}-(?:preview|production)$/.test(name)) {
    fail('BACKEND_RESOURCE_NAME_INVALID', 'The backend database name is not an OVYX-owned resource name.');
  }
  return name;
}
function safeSqlIdentifier(value) {
  const name = String(value || '').trim().replace(/^`|`$/g, '').replace(/^"|"$/g, '').replace(/^\[|\]$/g, '');
  if (!IDENTIFIER.test(name)) fail('BACKEND_MIGRATION_IDENTIFIER_INVALID', 'A migration contains an unsupported SQL identifier.');
  return name;
}

/**
 * Splits SQL without treating semicolons inside quoted strings as statement
 * boundaries. Only additive DDL is accepted; comments are removed first.
 */
export function splitSafeAdditiveMigration(source) {
  const sql = String(source || '');
  if (!sql.trim() || sql.length > 280_000) fail('BACKEND_MIGRATION_INVALID', 'A migration is empty or exceeds the supported size.');
  let clean = '';
  let quote = '';
  let lineComment = false;
  let blockComment = false;
  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i], next = sql[i + 1];
    if (lineComment) {
      if (c === '\n') { lineComment = false; clean += '\n'; }
      continue;
    }
    if (blockComment) {
      if (c === '*' && next === '/') { blockComment = false; i += 1; clean += ' '; }
      continue;
    }
    if (quote) {
      clean += c;
      if (c === quote) {
        if (next === quote) { clean += next; i += 1; }
        else if (i === 0 || sql[i - 1] !== '\\') quote = '';
      }
      continue;
    }
    if (c === '-' && next === '-') { lineComment = true; i += 1; continue; }
    if (c === '/' && next === '*') { blockComment = true; i += 1; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; clean += c; continue; }
    clean += c;
  }
  if (quote || blockComment) fail('BACKEND_MIGRATION_INVALID', 'A migration contains an unterminated SQL string or comment.');
  const statements = [];
  let current = '', activeQuote = '';
  for (let i = 0; i < clean.length; i += 1) {
    const c = clean[i], next = clean[i + 1];
    if (activeQuote) {
      current += c;
      if (c === activeQuote) {
        if (next === activeQuote) { current += next; i += 1; }
        else activeQuote = '';
      }
    } else if (c === "'" || c === '"' || c === '`') {
      activeQuote = c; current += c;
    } else if (c === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
    } else current += c;
  }
  if (current.trim()) statements.push(current.trim());
  if (!statements.length || statements.length > 80) fail('BACKEND_MIGRATION_INVALID', 'A migration must contain between 1 and 80 SQL statements.');
  for (const statement of statements) {
    const normalized = statement.replace(/\s+/g, ' ').trim();
    const table = normalized.match(/^CREATE TABLE(?: IF NOT EXISTS)?\s+((?:[A-Za-z_][A-Za-z0-9_]*|"(?:[^"]|"")+"|`[^`]+`|\[[^\]]+\])\s*\([\s\S]+\)$/i);
    const index = normalized.match(/^CREATE (?:UNIQUE )?INDEX(?: IF NOT EXISTS)?\s+((?:[A-Za-z_][A-Za-z0-9_]*|"(?:[^"]|"")+"|`[^`]+`|\[[^\]]+\])\s+ON\s+((?:[A-Za-z_][A-Za-z0-9_]*|"(?:[^"]|"")+"|`[^`]+`|\[[^\]]+\]))\s*\([\s\S]+\)(?:\s+WHERE\s+[\s\S]+)?$/i);
    const alter = normalized.match(/^ALTER TABLE\s+((?:[A-Za-z_][A-Za-z0-9_]*|"(?:[^"]|"")+"|`[^`]+`|\[[^\]]+\])\s+ADD COLUMN\s+((?:[A-Za-z_][A-Za-z0-9_]*|"(?:[^"]|"")+"|`[^`]+`|\[[^\]]+\]))\s+[A-Z][A-Z0-9_]*(?:\s+[\s\S]+)?$/i);
    if (!table && !index && !alter) fail('BACKEND_MIGRATION_UNSUPPORTED', 'Only additive CREATE TABLE, CREATE INDEX and ALTER TABLE ADD COLUMN statements can run automatically.');
    if (table && safeSqlIdentifier(table[1]) === '_ovyx_migrations') fail('BACKEND_MIGRATION_RESERVED_TABLE', 'The migration ledger table name is reserved by OVYX.');
  }
  return statements;
}

export function createCloudflareD1Adapter({ accountId, apiToken, fetchImpl = fetch } = {}) {
  const account = String(accountId || '').trim();
  const token = String(apiToken || '').trim();
  if (!/^[a-f0-9]{32}$/i.test(account) || token.length < 20) {
    fail('BACKEND_CLOUDFLARE_NOT_CONFIGURED', 'Cloudflare D1 provisioning is not configured.', 503);
  }

  async function request(path, init = {}) {
    let response;
    try {
      response = await fetchImpl(API_ROOT + path, {
        ...init,
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/json',
          ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(init.headers || {}),
        },
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      fail('BACKEND_CLOUDFLARE_UNAVAILABLE', 'Cloudflare could not be reached. The provisioning operation can be retried safely.', 503);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success !== true) {
      const error = new Error('Cloudflare rejected the backend resource operation.');
      error.status = response.status >= 400 && response.status <= 599 ? response.status : 502;
      error.code = 'BACKEND_CLOUDFLARE_REQUEST_FAILED';
      error.providerCode = Array.isArray(payload.errors) ? String(payload.errors[0]?.code || '') : '';
      throw error;
    }
    return payload.result;
  }

  async function findDatabase(name) {
    for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
      const result = await request('/accounts/' + encodeURIComponent(account) + '/d1/database?page=' + page + '&per_page=100');
      const rows = Array.isArray(result) ? result : [];
      const match = rows.find(item => String(item?.name || '') === name);
      if (match) return match;
      if (rows.length < 100) break;
    }
    return null;
  }

  async function ensureDatabase({ name, jurisdiction } = {}) {
    const safeName = safeDatabaseName(name);
    let database = await findDatabase(safeName);
    if (!database) {
      const body = { name: safeName };
      if (['eu', 'fedramp', 'us'].includes(jurisdiction)) body.jurisdiction = jurisdiction;
      try {
        database = await request('/accounts/' + encodeURIComponent(account) + '/d1/database', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      } catch (error) {
        // A concurrent idempotent request may have won the create race.
        if (error.status !== 409 && error.providerCode !== '7502') throw error;
        database = await findDatabase(safeName);
        if (!database) throw error;
      }
    }
    const id = String(database?.uuid || database?.database_id || '');
    if (!/^[a-f0-9-]{20,64}$/i.test(id) || String(database?.name || '') !== safeName) {
      fail('BACKEND_DATABASE_VERIFY_FAILED', 'Cloudflare did not return the expected OVYX database identity.', 502);
    }
    const verified = await request('/accounts/' + encodeURIComponent(account) + '/d1/database/' + encodeURIComponent(id));
    if (String(verified?.uuid || verified?.database_id || '') !== id || String(verified?.name || '') !== safeName) {
      fail('BACKEND_DATABASE_VERIFY_FAILED', 'The created database could not be independently verified.', 502);
    }
    return Object.freeze({ id, name: safeName, createdAt: verified.created_at || database.created_at || null });
  }

  async function query(databaseId, body) {
    if (!/^[a-f0-9-]{20,64}$/i.test(String(databaseId || ''))) fail('BACKEND_DATABASE_ID_INVALID', 'The database identity is invalid.');
    return request('/accounts/' + encodeURIComponent(account) + '/d1/database/' + encodeURIComponent(databaseId) + '/query', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async function applyMigrations(databaseId, migrations) {
    if (!Array.isArray(migrations) || migrations.length > 140) fail('BACKEND_MIGRATION_MANIFEST_INVALID', 'The migration manifest is invalid.');
    if (!migrations.length) return { applied: [] };
    const ordered = migrations.slice().sort((a, b) => Number(a.version) - Number(b.version));
    const seenVersions = new Set();
    const validated = [];
    // Validate the complete manifest before the first database write.
    for (const migration of ordered) {
      const version = Number(migration.version);
      const hash = String(migration.sha256 || '').toLowerCase();
      if (!Number.isSafeInteger(version) || version < 1 || !/^[a-f0-9]{64}$/.test(hash)) {
        fail('BACKEND_MIGRATION_MANIFEST_INVALID', 'A migration version or checksum is invalid.');
      }
      if (seenVersions.has(version)) fail('BACKEND_MIGRATION_DUPLICATE_VERSION', 'Migration versions must be unique.');
      seenVersions.add(version);
      const content = String(migration.content || '');
      const actualHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))), byte => byte.toString(16).padStart(2, '0')).join('');
      if (actualHash !== hash) fail('BACKEND_MIGRATION_HASH_MISMATCH', 'A migration source does not match its trusted SHA-256 manifest.');
      validated.push({ version, hash, statements: splitSafeAdditiveMigration(content) });
    }
    await query(databaseId, { sql: 'CREATE TABLE IF NOT EXISTS _ovyx_migrations (version INTEGER PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL)' });
    const applied = [];
    for (const migration of validated) {
      const { version, hash, statements } = migration;
      const existingResult = await query(databaseId, { sql: 'SELECT version, sha256 FROM _ovyx_migrations WHERE version = ?', params: [version] });
      const existing = existingResult?.[0]?.results?.[0];
      if (existing) {
        if (String(existing.sha256).toLowerCase() !== hash) fail('BACKEND_MIGRATION_DRIFT', 'An already-applied migration has changed. Create a new migration instead of rewriting history.', 409);
        applied.push({ version, status: 'already-applied' });
        continue;
      }
      const batch = statements.map(sql => ({ sql }));
      batch.push({ sql: 'INSERT INTO _ovyx_migrations (version, sha256, applied_at) VALUES (?, ?, ?)', params: [version, hash, new Date().toISOString()] });
      try {
        await query(databaseId, { batch });
      } catch (error) {
        const retryCheck = await query(databaseId, { sql: 'SELECT version, sha256 FROM _ovyx_migrations WHERE version = ?', params: [version] }).catch(() => null);
        const raced = retryCheck?.[0]?.results?.[0];
        if (raced && String(raced.sha256).toLowerCase() === hash) {
          applied.push({ version, status: 'already-applied' });
          continue;
        }
        throw error;
      }
      applied.push({ version, status: 'applied' });
    }
    return { applied };
  }

  return Object.freeze({ ensureDatabase, applyMigrations });
}
