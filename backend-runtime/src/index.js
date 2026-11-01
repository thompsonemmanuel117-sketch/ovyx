import { Sandbox, getSandbox, ContainerProxy } from '@cloudflare/sandbox';

export { ContainerProxy };

const MAX_BODY_BYTES = 2_200_000;
const MAX_FILES = 140;
const MAX_FILE_BYTES = 280_000;
const MAX_LOCKFILE_BYTES = 1_600_000;
const MAX_OUTPUT_CHARS = 150_000;
const MAX_RUN_MS = 210_000;
const ALLOWED_ROOT_FILES = new Set([
  'wrangler.jsonc', 'wrangler.json', 'package.json', 'package-lock.json',
  'npm-shrinkwrap.json', 'ovyx-qa-plan.json', '_routes.json', '_headers', 'tsconfig.json', 'vite.config.js', 'vite.config.ts',
]);
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:sk_(?:live|test|proj)_|whsec_|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_)[A-Za-z0-9_-]{12,}/i,
  /(?:["'](?:password|passcode|secret|token|api[_-]?key|authorization|card|cvv|cvc|iban|bank[_-]?account)["']\s*:\s*["'][^"']{12,}["']|(?:password|passcode|secret|token|api[_-]?key|authorization)\s*[:=]\s*["'][^"']{16,}["'])/i,
];

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const clean = (value, max = 320) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const encoder = new TextEncoder();

function safePath(raw) {
  const path = String(raw || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!path || path.length > 240 || path.split('/').some(part => !part || part === '.' || part === '..')) return '';
  if (/(?:^|\/)(?:\.git|node_modules|\.wrangler|\.next|coverage)(?:\/|$)/i.test(path)) return '';
  if (/(?:^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?)$/i.test(path)) return '';
  if (ALLOWED_ROOT_FILES.has(path)) return path;
  if (/^(?:functions|migrations|src|lib|api|server)\//i.test(path)) return path;
  return '';
}

function validPlan(plan) {
  if (!plan || plan.version !== 1 || plan.backendRequired !== true ||
      !Array.isArray(plan.backendChecks) || plan.backendChecks.length < 1 || plan.backendChecks.length > 24) return false;
  return true;
}

function safeFiles(rawFiles) {
  if (!Array.isArray(rawFiles) || rawFiles.length < 1 || rawFiles.length > MAX_FILES) {
    throw new Error('backend-runtime-file-count-invalid');
  }
  const files = [];
  const seen = new Set();
  let total = 0;
  for (const item of rawFiles) {
    const path = safePath(item?.path);
    if (!path || seen.has(path) || typeof item?.content !== 'string') throw new Error('backend-runtime-file-path-or-content-invalid');
    const bytes = encoder.encode(item.content);
    if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('backend-runtime-file-size-limit');
    if (SECRET_PATTERNS.some(pattern => pattern.test(item.content))) throw new Error('backend-runtime-secret-like-source-blocked');
    total += bytes.byteLength;
    if (total > MAX_BODY_BYTES) throw new Error('backend-runtime-source-size-limit');
    seen.add(path);
    files.push({ path, content: item.content });
  }
  if (!files.some(item => item.path === 'wrangler.jsonc' || item.path === 'wrangler.json')) {
    throw new Error('wrangler-json-config-required');
  }
  return files;
}

function hex(bytes) {
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
}

async function verifySignature(request, raw, secret) {
  const timestamp = request.headers.get('x-ovyx-timestamp') || '';
  const signature = request.headers.get('x-ovyx-signature') || '';
  if (!secret || !/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 120) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, encoder.encode(timestamp + '.' + raw)));
  const a = encoder.encode(expected.toLowerCase());
  const b = encoder.encode(signature.toLowerCase());
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

export class OvyxBackendSandbox extends Sandbox {
  enableInternet = false;
  allowedHosts = ['npm.registry'];
}

OvyxBackendSandbox.outboundByHost = {
  'npm.registry': async request => {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Blocked', { status: 405 });
    const source = new URL(request.url);
    if (source.hostname !== 'npm.registry' || source.username || source.password || source.pathname.startsWith('//') || source.pathname.includes('\\\\')) return new Response('Blocked', { status: 403 });
    const target = new URL('https://registry.npmjs.org');
    target.pathname = source.pathname;
    target.search = source.search;
    if (target.hostname !== 'registry.npmjs.org') return new Response('Blocked', { status: 403 });
    const headers = new Headers();
    const accept = request.headers.get('accept');
    if (accept) headers.set('accept', accept);
    headers.set('user-agent', 'OVYX-Isolated-Backend-QA/1.0');
    let upstream;
    try {
      upstream = await fetch(target.href, { method: request.method, headers, redirect: 'error' });
    } catch {
      return new Response('Package registry unavailable', { status: 502 });
    }
    const length = Number(upstream.headers.get('content-length') || 0);
    if (length > 30_000_000) return new Response('Package response too large', { status: 413 });
    const responseHeaders = new Headers();
    for (const name of ['content-type', 'content-length', 'etag', 'last-modified', 'cache-control']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    responseHeaders.set('cache-control', 'public, max-age=60');
    return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers: responseHeaders });
  },
};

async function installProjectDependencies(sandbox, files) {
  const manifest = files.find(item => item.path === 'package.json');
  if (!manifest) return { installed: false, reason: 'no-package-manifest' };
  let parsed;
  try { parsed = JSON.parse(manifest.content); } catch { throw new Error('package-json-invalid'); }
  const dependencies = { ...(parsed.dependencies || {}), ...(parsed.devDependencies || {}), ...(parsed.optionalDependencies || {}) };
  if (!Object.keys(dependencies).length) return { installed: false, reason: 'no-dependencies-declared' };
  await sandbox.writeFile('/workspace/project/.npmrc', 'registry=http://npm.registry/\nreplace-registry-host=always\nignore-scripts=true\naudit=false\nfund=false\n');
  const lock = files.some(item => item.path === 'package-lock.json' || item.path === 'npm-shrinkwrap.json');
  const command = lock
    ? 'npm ci --ignore-scripts --no-audit --no-fund --prefer-offline'
    : 'npm install --ignore-scripts --no-audit --no-fund --prefer-offline';
  const result = await sandbox.exec('cd /workspace/project && ' + command, { timeout: 90_000 });
  if (!result.success) throw new Error('dependency-install-failed: ' + clean(result.stderr || result.stdout, 260));
  return { installed: true, dependencyCount: Object.keys(dependencies).length };
}

async function runEvaluation(payload, env) {
  if (!validPlan(payload.qaPlan)) return { channel: 'backend', status: 'blocked', testsRun: 0, findings: [{ severity: 'warning', code: 'BACKEND_PLAN_INVALID', message: 'A valid backend-required QA plan with 1–24 checks is required.' }] };
  const files = safeFiles(payload.files);
  const sandboxId = 'ovyx-qa-' + crypto.randomUUID();
  const sandbox = getSandbox(env.SANDBOX, sandboxId);
  try {
    await sandbox.exec('mkdir -p /workspace/project /opt/ovyx-runtime/scripts');
  for (const file of files) {
    const target = '/workspace/project/' + file.path;
    const parent = target.slice(0, target.lastIndexOf('/'));
    await sandbox.exec('mkdir -p ' + shellQuote(parent));
    await sandbox.writeFile(target, file.content);
  }
  const plan = { version: 1, backendRequired: true, journeys: [], apiChecks: [], backendChecks: payload.qaPlan.backendChecks };
  await sandbox.writeFile('/workspace/project/ovyx-qa-plan.json', JSON.stringify(plan));
  const dependencyInstall = await installProjectDependencies(sandbox, files);
  await sandbox.removeAllowedHost('npm.registry');
  const command = 'cd /opt/ovyx-runtime && OVYX_QA_NETWORK_ISOLATION=cloudflare-sandbox-no-egress node scripts/ovyx-generated-backend-runtime-eval.mjs --root /workspace/project';
  const execution = await sandbox.exec(command, { timeout: MAX_RUN_MS });
  const output = clean(execution.stdout || '', MAX_OUTPUT_CHARS);
  let report;
  try { report = JSON.parse(output); }
  catch {
    return {
      channel: 'backend',
      status: 'blocked',
      testsRun: 0,
      findings: [{ severity: 'warning', code: 'BACKEND_RUNTIME_OUTPUT_INVALID', message: 'The isolated backend runtime did not return a valid evidence report: ' + clean(execution.stderr || 'No report output.', 240) }],
    };
  }
  report.runtime = 'cloudflare-sandbox-pages-d1';
  report.dependencyInstall = dependencyInstall;
  return report;
  } finally {
    try { await sandbox.destroy(); } catch {}
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'ovyx-backend-runtime', runtime: 'cloudflare-sandbox-pages-d1', version: 1 });
    }
    if (request.method !== 'POST' || url.pathname !== '/evaluate') return json({ ok: false, code: 'NOT_FOUND' }, 404);
    const length = Number(request.headers.get('content-length') || 0);
    if (length > MAX_BODY_BYTES) return json({ ok: false, code: 'BODY_TOO_LARGE' }, 413);
    const raw = await request.text();
    if (encoder.encode(raw).byteLength > MAX_BODY_BYTES) return json({ ok: false, code: 'BODY_TOO_LARGE' }, 413);
    if (!await verifySignature(request, raw, env.OVYX_BACKEND_RUNTIME_SECRET)) return json({ ok: false, code: 'UNAUTHORIZED' }, 401);
    let payload;
    try { payload = JSON.parse(raw); } catch { return json({ ok: false, code: 'INVALID_JSON' }, 400); }
    try {
      const result = await runEvaluation(payload, env);
      return json(result, result.status === 'passed' || result.status === 'not-required' ? 200 : 422);
    } catch (error) {
      return json({
        channel: 'backend',
        status: 'blocked',
        testsRun: 0,
        findings: [{ severity: 'warning', code: 'BACKEND_RUNTIME_BLOCKED', message: clean(error?.message || error) }],
      }, 422);
    }
  },
};
