import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { lstat, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { networkInterfaces, tmpdir } from 'node:os';

const MAX_CHECKS = 24;
const MAX_MIGRATIONS = 60;
const MAX_MIGRATION_BYTES = 1024 * 1024;
const MAX_BODY_BYTES = 4096;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);
const SAFE_HEADERS = new Set(['accept', 'content-type', 'x-idempotency-key', 'x-request-id']);
const OMIT_DIRS = new Set(['.git', '.wrangler', 'node_modules', '.next', 'coverage']);
const OMIT_FILES = /^(?:\.env(?:\..*)?|\.dev\.vars|\.dev\.vars\..*|wrangler\.lock)$/i;

function clean(value, limit = 240) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(?:sk_(?:live|test|proj)_[A-Za-z0-9_-]{12,}|whsec_[A-Za-z0-9]{12,}|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{20,})/gi, '[REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .trim()
    .slice(0, limit);
}

function isLoopbackOnlyNetworkNamespace() {
  const interfaces = Object.values(networkInterfaces()).flat().filter(Boolean);
  return interfaces.length > 0 && interfaces.every(item =>
    item.internal === true || item.address === '::1' || /^127\\./.test(String(item.address || ''))
  );
}

function jsonPath(value, key) {
  return String(key || '').split('.').filter(Boolean).reduce((current, part) => {
    if (current == null) return undefined;
    const index = /^\d+$/.test(part) ? Number(part) : part;
    return current[index];
  }, value);
}

function safeRoute(value) {
  const route = String(value || '');
  return route.startsWith('/api/') && !route.startsWith('//') &&
    !/[?#\\\u0000-\u001f]/.test(route) && !route.split('/').some(part => part === '.' || part === '..') &&
    route.length <= 180;
}

function containsSensitivePayload(value) {
  const serialized = JSON.stringify(value);
  return serialized.length > MAX_BODY_BYTES ||
    /"(?:password|passcode|secret|token|api[_-]?key|authorization|card|cvv|cvc|iban|bank[_-]?account|email|phone|address)"\s*:/i.test(serialized) ||
    /(?:sk_(?:live|test)_|whsec_|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{20,})/i.test(serialized);
}

export function validateBackendChecks(plan) {
  if (!plan || plan.version !== 1 || typeof plan.backendRequired !== 'boolean' || !Array.isArray(plan.backendChecks)) {
    return { ok: false, reason: 'backend-check-plan-missing-or-invalid', checks: [] };
  }
  if (!plan.backendRequired && plan.backendChecks.length === 0) {
    return { ok: true, notRequired: true, reason: '', checks: [] };
  }
  if (!plan.backendRequired || plan.backendChecks.length < 1 || plan.backendChecks.length > MAX_CHECKS) {
    return { ok: false, reason: 'backend-check-count-out-of-range', checks: [] };
  }
  const ids = new Set();
  const checks = [];
  for (const raw of plan.backendChecks) {
    const id = clean(raw?.id, 80);
    const method = String(raw?.method || 'GET').toUpperCase();
    const route = String(raw?.route || '');
    const expectedStatus = Number(raw?.expectedStatus ?? 200);
    if (!id || ids.has(id) || !SAFE_METHODS.has(method) || !safeRoute(route) ||
        !Number.isInteger(expectedStatus) || expectedStatus < 100 || expectedStatus > 599) {
      return { ok: false, reason: 'backend-check-schema-invalid', checks: [] };
    }
    ids.add(id);
    const headers = {};
    if (raw.headers != null) {
      if (!raw.headers || typeof raw.headers !== 'object' || Array.isArray(raw.headers)) {
        return { ok: false, reason: 'backend-check-headers-invalid', checks: [] };
      }
      for (const [name, value] of Object.entries(raw.headers)) {
        const key = String(name).toLowerCase();
        if (!SAFE_HEADERS.has(key) || typeof value !== 'string' || value.length > 160) {
          return { ok: false, reason: 'backend-check-header-not-allowed', checks: [] };
        }
        headers[key] = value;
      }
    }
    let body;
    if (raw.body !== undefined) {
      if (!['object', 'string', 'number', 'boolean'].includes(typeof raw.body) || containsSensitivePayload(raw.body)) {
        return { ok: false, reason: 'backend-check-body-sensitive-or-too-large', checks: [] };
      }
      body = raw.body;
    }
    if (!['GET', 'HEAD'].includes(method) && raw.sideEffect !== 'disposable-local-only') {
      return { ok: false, reason: 'backend-check-mutating-call-not-marked-local-only', checks: [] };
    }
    if (raw.identity != null && !['anonymous', 'synthetic-owner-a', 'synthetic-owner-b'].includes(raw.identity)) {
      return { ok: false, reason: 'backend-check-identity-unsupported', checks: [] };
    }
    const expect = raw.expect && typeof raw.expect === 'object' ? raw.expect : {};
    if (expect.jsonPath != null && (typeof expect.jsonPath !== 'string' || expect.jsonPath.length > 120)) {
      return { ok: false, reason: 'backend-check-json-path-invalid', checks: [] };
    }
    if (expect.equals !== undefined && expect.equals !== null &&
        ['object', 'function'].includes(typeof expect.equals)) {
      return { ok: false, reason: 'backend-check-expected-value-invalid', checks: [] };
    }
    checks.push({
      id, name: clean(raw.name || id, 120), method, route, expectedStatus,
      headers, body, identity: raw.identity || 'anonymous',
      expectJsonPath: expect.jsonPath || '', expectedValue: expect.equals,
      expectContains: typeof expect.contains === 'string' ? expect.contains.slice(0, 240) : '',
    });
  }
  return { ok: true, reason: '', checks };
}

function parseJsonc(source) {
  let output = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; output += char; continue; }
    if (char === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      output += '\n';
      continue;
    }
    if (char === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 1;
      output += ' ';
      continue;
    }
    output += char;
  }
  return JSON.parse(output.replace(/,\s*([}\]])/g, '$1'));
}

async function walkSafe(root, relative = '') {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    if (entry.name === '.' || entry.name === '..' || OMIT_DIRS.has(entry.name) || OMIT_FILES.test(entry.name)) continue;
    const rel = path.posix.join(relative.split(path.sep).join('/'), entry.name);
    const full = path.join(root, rel);
    const info = await lstat(full);
    if (info.isSymbolicLink()) throw new Error('symlink-artifact-blocked');
    if (info.isDirectory()) found.push(...await walkSafe(root, rel));
    else if (info.isFile()) found.push({ relative: rel.split(path.sep).join('/'), full, bytes: info.size });
  }
  return found;
}

function validateWranglerConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return { ok: false, reason: 'wrangler-config-invalid' };
  const unsupported = ['durable_objects', 'services', 'queues', 'vectorize', 'hyperdrive', 'browser', 'ai', 'analytics_engine_datasets', 'dispatch_namespaces'];
  if (unsupported.some(key => Array.isArray(config[key]) && config[key].length)) {
    return { ok: false, reason: 'unsupported-cloudflare-binding-requires-dedicated-adapter' };
  }
  const kv = Array.isArray(config.kv_namespaces) ? config.kv_namespaces : [];
  const r2 = Array.isArray(config.r2_buckets) ? config.r2_buckets : [];
  if (kv.some(item => !item || typeof item.binding !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(item.binding) || item.remote === true) ||
      r2.some(item => !item || typeof item.binding !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(item.binding) || typeof item.bucket_name !== 'string' || item.remote === true)) {
    return { ok: false, reason: 'kv-or-r2-binding-invalid-or-remote' };
  }
  if (config.env && Object.keys(config.env).length) return { ok: false, reason: 'wrangler-environment-overrides-require-dedicated-adapter' };
  const vars = config.vars && typeof config.vars === 'object' ? config.vars : {};
  if (Object.keys(vars).some(key => /secret|token|password|credential|private|(?:^|[_-])key(?:$|[_-])/i.test(key)) ||
      Object.values(vars).some(value => typeof value === 'string' && /(?:sk_(?:live|test)_|whsec_|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{20,})/i.test(value))) {
    return { ok: false, reason: 'secret-like-wrangler-var-blocked' };
  }
  const databases = Array.isArray(config.d1_databases) ? config.d1_databases : [];
  const bindings = [];
  for (const db of databases) {
    if (!db || typeof db.binding !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(db.binding) ||
        typeof db.database_name !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(db.database_name) ||
        db.remote === true || typeof db.database_id !== 'string') {
      return { ok: false, reason: 'd1-binding-invalid-or-remote' };
    }
    bindings.push({
      binding: db.binding, databaseName: db.database_name,
      databaseId: randomUUID(), migrationsDir: typeof db.migrations_dir === 'string' ? db.migrations_dir : 'migrations',
    });
  }
  return { ok: true, bindings, kvBindings: kv.map(item => item.binding), r2Bindings: r2.map(item => item.binding) };
}

async function nextPort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs || 60000);
    timer.unref?.();
    child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-12000); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-12000); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      if (timedOut) reject(new Error('command-timeout:' + path.basename(command)));
      else if (code === 0) resolve({ stdout, stderr });
      else reject(new Error('command-failed:' + path.basename(command) + ':' + clean(stderr || stdout, 500)));
    });
  });
}

async function waitForServer(origin, child, timeoutMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.spawnError) throw new Error('wrangler-spawn-failed:' + clean(child.spawnError.message, 180));
    if (child.exitCode != null) throw new Error('wrangler-exited-before-ready');
    try {
      await fetch(origin + '/', { signal: AbortSignal.timeout(1000) });
      return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('wrangler-readiness-timeout');
}

async function executeChecks(origin, checks, testSecret) {
  const results = [];
  for (const check of checks) {
    const headers = { ...check.headers };
    if (check.body !== undefined && !headers['content-type']) headers['content-type'] = 'application/json';
    if (check.identity !== 'anonymous') {
      headers['x-ovyx-qa-identity'] = check.identity;
      headers['x-ovyx-qa-secret'] = testSecret;
    }
    let body;
    if (check.body !== undefined) body = typeof check.body === 'string' ? check.body : JSON.stringify(check.body);
    try {
      const response = await fetch(origin + check.route, {
        method: check.method, headers, body: ['GET', 'HEAD'].includes(check.method) ? undefined : body,
        redirect: 'manual', signal: AbortSignal.timeout(8000),
      });
      let text = '';
      if (check.method !== 'HEAD' && response.body) {
        const reader = response.body.getReader();
        const chunks = [];
        let bytes = 0;
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 65536) {
            await reader.cancel();
            throw new Error('backend-response-size-limit');
          }
          chunks.push(part.value);
        }
        text = new TextDecoder().decode(Buffer.concat(chunks.map(chunk => Buffer.from(chunk))));
      }
      let parsed;
      try { parsed = text ? JSON.parse(text) : null; } catch {}
      let failure = '';
      if (response.status !== check.expectedStatus) failure = 'http-status-mismatch';
      else if (check.expectJsonPath && jsonPath(parsed, check.expectJsonPath) !== check.expectedValue) failure = 'json-assertion-mismatch';
      else if (check.expectContains && !text.includes(check.expectContains)) failure = 'response-text-assertion-mismatch';
      results.push({ id: check.id, name: check.name, status: failure ? 'failed' : 'passed', httpStatus: response.status, failure });
    } catch (error) {
      results.push({ id: check.id, name: check.name, status: 'failed', httpStatus: 0, failure: clean(error?.message || error, 180) });
    }
  }
  return results;
}

export async function runCloudflarePagesBackendRuntime(options = {}) {
  if (process.env.OVYX_QA_NETWORK_ISOLATION !== 'docker-none' || !isLoopbackOnlyNetworkNamespace()) {
    return { channel: 'backend', status: 'blocked', testsRun: 0, findings: [{ severity: 'warning', code: 'NETWORK_SANDBOX_REQUIRED', message: 'Cloudflare Pages Functions runtime was not started because the process is not inside a verified loopback-only network namespace.' }] };
  }
  const projectRoot = path.resolve(String(options.root || ''));
  const sourceRoot = path.resolve(String(options.sourceRoot || process.cwd()));
  const report = { channel: 'backend', status: 'blocked', testsRun: 0, findings: [], checks: [], runtime: 'cloudflare-pages-d1-local' };
  let workspace = '';
  let child = null;
  try {
    const configPath = ['wrangler.jsonc', 'wrangler.json'].map(name => path.join(projectRoot, name));
    let configSource = '';
    let actualConfigPath = '';
    for (const candidate of configPath) {
      try { configSource = await readFile(candidate, 'utf8'); actualConfigPath = candidate; break; } catch {}
    }
    if (!actualConfigPath) throw new Error('wrangler-json-config-required');
    const config = parseJsonc(configSource);
    const configCheck = validateWranglerConfig(config);
    if (!configCheck.ok) throw new Error(configCheck.reason);
    const plan = JSON.parse(await readFile(path.join(projectRoot, 'ovyx-qa-plan.json'), 'utf8'));
    const validated = validateBackendChecks(plan);
    if (!validated.ok) throw new Error(validated.reason);
    if (validated.notRequired) {
      report.status = 'not-required';
      report.findings.push({ severity: 'info', code: 'BACKEND_NOT_REQUIRED', message: 'The generated QA plan explicitly declares no backend runtime requirement.' });
      return report;
    }
    const sourceFiles = await walkSafe(projectRoot);
    if (sourceFiles.length > 500 || sourceFiles.reduce((sum, file) => sum + file.bytes, 0) > 20 * 1024 * 1024) throw new Error('generated-artifact-size-limit');
    for (const file of sourceFiles) {
      if (file.bytes > 2 * 1024 * 1024) throw new Error('generated-source-file-size-limit');
      if (/\.(?:m?js|jsx|tsx?)$/i.test(file.relative)) {
        const source = await readFile(file.full, 'utf8');
        for (const match of source.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g)) {
          const specifier = match[1];
          if (/^(?:\.{1,2}\/|\/|node:|cloudflare:|workerd:)/.test(specifier)) continue;
          throw new Error('third-party-package-import-requires-pinned-isolated-dependency-adapter');
        }
      }
      if (/\.(?:js|mjs|cjs|json|html|sql|toml|jsonc)$/i.test(file.relative)) {
        const source = await readFile(file.full, 'utf8');
        if (/(?:sk_(?:live|test|proj)_[A-Za-z0-9_-]{12,}|whsec_[A-Za-z0-9]{12,}|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i.test(source)) {
          throw new Error('credential-shaped-generated-source-blocked');
        }
      }
    }
    if (!sourceFiles.some(file => file.relative.startsWith('functions/'))) throw new Error('cloudflare-pages-functions-not-found');
    if (sourceFiles.some(file => /(?:^|\/)\.env(?:\.|$)|\.dev\.vars/i.test(file.relative))) throw new Error('environment-file-blocked');
    const migrations = [];
    for (const binding of configCheck.bindings) {
      const migrationRoot = path.resolve(projectRoot, binding.migrationsDir);
      if (!migrationRoot.startsWith(projectRoot + path.sep)) throw new Error('migration-path-escape-blocked');
      let entries = [];
      try { entries = await readdir(migrationRoot, { withFileTypes: true }); } catch {}
      for (const entry of entries) {
        if (!entry.isFile() || !/^\d+_[a-z0-9_-]+\.sql$/i.test(entry.name)) continue;
        const file = path.join(migrationRoot, entry.name);
        const info = await lstat(file);
        if (info.size > MAX_MIGRATION_BYTES) throw new Error('migration-size-limit');
        const sql = await readFile(file, 'utf8');
        if (/\b(?:ATTACH\s+DATABASE|DETACH\s+DATABASE|LOAD_EXTENSION|VACUUM\s+INTO)\b/i.test(sql)) throw new Error('unsafe-migration-statement-blocked');
        migrations.push({ binding, file, name: entry.name });
      }
    }
    if (configCheck.bindings.length && !migrations.length) throw new Error('d1-migrations-missing');
    if (migrations.length > MAX_MIGRATIONS) throw new Error('migration-count-limit');
    const workspaceRoot = path.resolve(options.tempRoot || tmpdir());
    workspace = await mkdtemp(path.join(workspaceRoot, 'ovyx-generated-backend-'));
    for (const file of sourceFiles) {
      const destination = path.join(workspace, file.relative);
      if (!destination.startsWith(workspace + path.sep)) throw new Error('artifact-path-escape-blocked');
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, await readFile(file.full));
    }
    const configName = path.basename(actualConfigPath);
    const isolatedConfig = { ...config };
    isolatedConfig.d1_databases = configCheck.bindings.map(binding => ({
      binding: binding.binding, database_name: binding.databaseName,
      database_id: binding.databaseId, preview_database_id: binding.databaseId, migrations_dir: binding.migrationsDir,
    }));
    await writeFile(path.join(workspace, configName), JSON.stringify(isolatedConfig, null, 2));
    const wrangler = options.wranglerBin || path.resolve(sourceRoot, 'node_modules/.bin/wrangler');
    const stateDir = path.join(workspace, '.qa-state');
    await mkdir(stateDir, { recursive: true });
    const home = path.join(workspace, '.qa-home');
    await mkdir(home, { recursive: true });
    const env = {
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      HOME: home, CI: '1', NO_COLOR: '1', WRANGLER_SEND_METRICS: 'false',
      XDG_CONFIG_HOME: home, XDG_CACHE_HOME: path.join(home, '.cache'),
      OVYX_QA_MODE: '1', OVYX_QA_TEST_SECRET: randomUUID(),
    };
    for (const migration of migrations) {
      await runCommand(wrangler, ['d1', 'execute', migration.binding.databaseName, '--local', '--persist-to', stateDir, '--file', migration.file], { cwd: workspace, env });
    }
    const port = await nextPort();
    const outputDir = typeof config.pages_build_output_dir === 'string' ? config.pages_build_output_dir : '.';
    if (path.isAbsolute(outputDir) || outputDir.split(/[\\/]/).includes('..')) throw new Error('pages-output-path-invalid');
    const args = ['pages', 'dev', outputDir, '--ip', '127.0.0.1', '--port', String(port), '--persist-to', stateDir, '--log-level', 'error'];
    for (const binding of configCheck.bindings) args.push('--d1', binding.binding + '=' + binding.databaseId);
    for (const binding of configCheck.kvBindings) args.push('--kv', binding);
    for (const binding of configCheck.r2Bindings) args.push('--r2', binding);
    args.push('--binding', 'OVYX_QA_MODE=1', '--binding', 'OVYX_QA_TEST_SECRET=' + env.OVYX_QA_TEST_SECRET);
    child = spawn(wrangler, args, { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.once('error', error => { child.spawnError = error; });
    child.stdout.on('data', () => {});
    child.stderr.on('data', () => {});
    const origin = 'http://127.0.0.1:' + port;
    await waitForServer(origin, child);
    report.checks = await executeChecks(origin, validated.checks, env.OVYX_QA_TEST_SECRET);
    report.testsRun = report.checks.length;
    const failed = report.checks.filter(check => check.status !== 'passed');
    report.status = failed.length ? 'failed' : 'passed';
    for (const item of failed) report.findings.push({ severity: 'blocker', code: 'BACKEND_CHECK_FAILED', message: item.id + ': ' + item.failure });
    if (report.status === 'passed') report.findings.push({ severity: 'info', code: 'BACKEND_RUNTIME_PASSED', message: report.testsRun + ' backend checks passed against disposable local Pages/D1 runtime.' });
  } catch (error) {
    report.status = 'blocked';
    report.findings.push({ severity: 'warning', code: 'BACKEND_RUNTIME_BLOCKED', message: clean(error?.message || error, 300) });
  } finally {
    if (child && child.exitCode == null) {
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 2500);
        timer.unref?.();
        child.once('close', () => { clearTimeout(timer); resolve(); });
        child.kill('SIGTERM');
      });
      if (child.exitCode == null) child.kill('SIGKILL');
    }
    if (workspace) await rm(workspace, { recursive: true, force: true });
  }
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf('--root');
  const outIndex = args.indexOf('--out');
  if (rootIndex < 0 || !args[rootIndex + 1]) throw new Error('usage: node ovyx-generated-backend-runtime-eval.mjs --root <generated-pages-project> [--out <report.json>]');
  const result = await runCloudflarePagesBackendRuntime({
    root: args[rootIndex + 1],
    sourceRoot: process.cwd(),
  });
  const serialized = JSON.stringify(result, null, 2);
  if (outIndex >= 0 && args[outIndex + 1]) await writeFile(path.resolve(args[outIndex + 1]), serialized);
  process.stdout.write(serialized + '\n');
  if (!['passed', 'not-required'].includes(result.status)) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) await main();
