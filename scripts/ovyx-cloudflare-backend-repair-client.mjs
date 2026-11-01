import fs from 'node:fs/promises';
import path from 'node:path';
import { isTrustedGithubOidcRequestHostname } from './ovyx-github-oidc-url.mjs';

const AUDIENCE = 'ovyx-live-site-evaluation';
const ROUTE = '/api/internal/live-generation-eval';
const MAX_RESPONSE_BYTES = 240_000;

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error('Missing trusted GitHub Actions OIDC setting: ' + name + '.');
  return value;
}
function safeFunctionPath(value) {
  const file = String(value || '').trim().replace(/\\/g, '/');
  return file.startsWith('functions/') && file.length <= 240 &&
    !file.split('/').some(part => !part || part === '.' || part === '..') &&
    /\.(?:m?js|ts)$/i.test(file) ? file : '';
}
async function readBoundedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) return {};
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('Backend repair response exceeded its bounded size.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(merged)); }
  catch { throw new Error('Backend repair endpoint returned invalid JSON.'); }
}
async function getOidcToken() {
  const rawUrl = required('ACTIONS_ID_TOKEN_REQUEST_URL');
  const requestToken = required('ACTIONS_ID_TOKEN_REQUEST_TOKEN');
  let url;
  try {
    url = new URL(rawUrl);
    if (url.protocol !== 'https:' || !isTrustedGithubOidcRequestHostname(url.hostname.toLowerCase().replace(/\.$/, '')) ||
        url.username || url.password || url.hash || url.port) {
      throw new Error('untrusted-oidc-request-url');
    }
    url.searchParams.set('audience', AUDIENCE);
  } catch {
    throw new Error('GitHub Actions did not provide a trusted HTTPS OIDC request URL.');
  }
  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: 'Bearer ' + requestToken, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('GitHub OIDC token request failed.');
  }
  const payload = await readBoundedJson(response);
  const token = String(payload.value || '').trim();
  if (!response.ok || !token || token.length > 12_000) throw new Error('GitHub did not issue the expected short-lived OIDC token.');
  return token;
}
async function restoreBackup(siteDir, backupDir) {
  const entries = await fs.readdir(backupDir, { recursive: true });
  for (const entry of entries) {
    const relative = String(entry).split(path.sep).join('/');
    if (!relative || relative === 'original-report.json') continue;
    const source = path.join(backupDir, relative);
    const target = path.join(siteDir, relative);
    const bytes = await fs.readFile(source);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
  }
}
async function main() {
  const args = process.argv.slice(2);
  const arg = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  const siteDir = path.resolve(arg('--site-dir'));
  const runtimeReportPath = path.resolve(arg('--runtime-report'));
  const backupDir = path.resolve(arg('--backup-dir'));
  if (args.includes('--restore')) {
    if (!arg('--site-dir') || !arg('--backup-dir')) throw new Error('--restore requires --site-dir and --backup-dir.');
    await restoreBackup(siteDir, backupDir);
    return;
  }
  if (!arg('--site-dir') || !arg('--runtime-report') || !arg('--backup-dir')) {
    throw new Error('usage: node ovyx-cloudflare-backend-repair-client.mjs --site-dir <dir> --runtime-report <report.json> --backup-dir <dir>');
  }
  const runtimeReport = JSON.parse(await fs.readFile(runtimeReportPath, 'utf8'));
  if (runtimeReport.status !== 'failed' || !Array.isArray(runtimeReport.findings)) {
    throw new Error('Only concrete failed backend runtime evidence can request a repair.');
  }
  const liveReport = JSON.parse(await fs.readFile(path.resolve('artifacts/webstudio-generated-sites/live-generation-report.json'), 'utf8'));
  const origin = new URL(String(liveReport.cloudflareOrigin || ''));
  if (origin.protocol !== 'https:' || !origin.hostname.toLowerCase().endsWith('.pages.dev') ||
      origin.username || origin.password || origin.port || origin.search || origin.hash) {
    throw new Error('The exact trusted Cloudflare Pages deployment origin is missing or invalid.');
  }
  const caseId = path.basename(siteDir);
  const siteMetadata = (liveReport.sites || []).find(site => site.id === caseId);
  if (!siteMetadata) throw new Error('Generated site case does not match the trusted live acceptance report.');
  const failingFindings = runtimeReport.findings.filter(item =>
    item.code === 'BACKEND_CHECK_FAILED' && safeFunctionPath(item.file)
  );
  const targetPaths = [...new Set(failingFindings.map(item => safeFunctionPath(item.file)))];
  if (!targetPaths.length || targetPaths.length > 6) throw new Error('No safe exact backend function source files were identified for repair.');
  const files = {};
  let totalChars = 0;
  for (const file of targetPaths) {
    const content = await fs.readFile(path.join(siteDir, file), 'utf8');
    if (!content || content.length > 24_000 ||
        /(?:sk_(?:live|test|proj)_[A-Za-z0-9_-]{12,}|whsec_[A-Za-z0-9]{12,}|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i.test(content)) {
      throw new Error('A backend source file is too large or contains credential-shaped content; refusing to transmit it for repair.');
    }
    totalChars += content.length;
    if (totalChars > 100_000) throw new Error('Backend repair source context exceeded the bounded size.');
    files[file] = content;
  }
  const token = await getOidcToken();
  const response = await fetch(origin.origin + ROUTE, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      operation: 'repair-backend',
      caseId,
      provider: String(siteMetadata.provider || process.env.OVYX_EVAL_PROVIDER || 'automatic'),
      model: String(siteMetadata.model || process.env.OVYX_EVAL_MODEL || ''),
      files,
      findings: failingFindings,
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(90_000),
  });
  const payload = await readBoundedJson(response);
  if (!response.ok || payload.ok !== true || !payload.files || typeof payload.files !== 'object') {
    throw new Error('Trusted backend repair was rejected: ' + String(payload.reason || payload.error || response.status).slice(0, 180));
  }
  const changedPaths = Array.isArray(payload.changedPaths) ? payload.changedPaths : [];
  if (!changedPaths.length || changedPaths.length > targetPaths.length ||
      changedPaths.some(file => !targetPaths.includes(safeFunctionPath(file)) || typeof payload.files[file] !== 'string' || payload.files[file].length > 24_000)) {
    throw new Error('Backend repair returned a path or file outside the exact source allowlist.');
  }
  await fs.mkdir(backupDir, { recursive: true });
  for (const file of changedPaths) {
    const original = await fs.readFile(path.join(siteDir, file));
    const backup = path.join(backupDir, file);
    await fs.mkdir(path.dirname(backup), { recursive: true });
    await fs.writeFile(backup, original);
  }
  for (const file of changedPaths) {
    const destination = path.join(siteDir, file);
    await fs.writeFile(destination, payload.files[file]);
  }
  process.stdout.write(JSON.stringify({
    ok: true,
    attempts: 1,
    provider: payload.provider || null,
    changedPaths,
    verificationRequired: payload.verificationRequired || 'Rerun the exact same backend checks.',
  }, null, 2) + '\n');
}
main().catch(error => {
  console.error('OVYX backend runtime repair failed:', String(error?.message || 'Unknown failure').slice(0, 400));
  process.exitCode = 1;
});
