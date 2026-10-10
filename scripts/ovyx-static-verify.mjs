import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const errors = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// OVYX is a Cloudflare Pages Git-integrated project. Pages configuration and
// production variables/secrets are managed in the Cloudflare dashboard.
// A Wrangler config in this repository would become a second source of truth
// and can overwrite dashboard-managed Pages variables on deployment.
for (const configName of ['wrangler.toml', 'wrangler.json', 'wrangler.jsonc']) {
  if (fs.existsSync(path.join(root, configName))) {
    errors.push(`${configName}: must not be committed to OVYX; Cloudflare Pages configuration is dashboard-managed to protect existing variables and secrets.`);
  }
}

for (const file of walk(path.join(root, 'functions'))) {
  if (!/\.(js|mjs|cjs)$/.test(file)) continue;
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    errors.push(`${path.relative(root, file)}: ${String(error.stderr || error.stdout || error.message).trim()}`);
  }
}

// Runtime contract checks for the incidents OVYX is repairing. Syntax alone
// does not detect an AI route that can wait forever or a missing API handler.
const providerRouterPath = path.join(root, 'functions/_lib/providers.js');
if (fs.existsSync(providerRouterPath)) {
  const providerRouter = fs.readFileSync(providerRouterPath, 'utf8');
  if (!/function fetchWithTimeout\(/.test(providerRouter)) {
    errors.push('functions/_lib/providers.js: AI provider requests need an explicit timeout.');
  }
  if (!/withTimeout\(\s*getActiveBrainConnectionId/.test(providerRouter)) {
    errors.push('functions/_lib/providers.js: Universal Connection lookup needs a deadline.');
  }
  if (
    !/if\s*\(options\.authUser\s*&&\s*!\/\^connection:\/i\.test\(requestedRaw\)\)/.test(providerRouter) ||
    !/UNIVERSAL_CONNECTION_SELECTION_FAILED/.test(providerRouter) ||
    !/selected Universal Connection AI Brain failed[\s\S]*?did not switch to another AI provider/i.test(providerRouter)
  ) {
    errors.push('functions/_lib/providers.js: a saved Universal Connection must override platform provider choices and fail closed instead of routing silently to platform keys.');
  }
  const rawFetches = (providerRouter.match(/\bawait fetch\s*\(/g) || []).length;
  if (rawFetches !== 1 || !/return await fetch\(url,\s*\{ \.\.\.options, signal: controller\.signal \}\)/.test(providerRouter)) {
    errors.push('functions/_lib/providers.js: provider network calls must pass through the timeout wrapper.');
  }
}

const entitlementRoutePath = path.join(root, 'functions/api/entitlements.js');
if (fs.existsSync(entitlementRoutePath)) {
  const entitlementRoute = fs.readFileSync(entitlementRoutePath, 'utf8');
  if (!/export async function onRequestGet\s*\(/.test(entitlementRoute)) {
    errors.push('functions/api/entitlements.js: authenticated GET route is missing; owner/admin visibility cannot be verified.');
  }
  if (!/role\s*,[\s\S]*owner:\s*root[\s\S]*admin:\s*root/.test(entitlementRoute)) {
    errors.push('functions/api/entitlements.js: server-authoritative owner/admin fields are missing from the response contract.');
  }
}

for (const file of walk(root).filter(x => /\.json$/.test(x))) {
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`${path.relative(root, file)}: invalid JSON: ${error.message}`);
  }
}

for (const file of [
  path.join(root, 'scripts/ovyx-pages-build.mjs'),
  path.join(root, 'scripts/ovyx-cloudflare-diagnostics.mjs'),
]) {
  if (!fs.existsSync(file)) continue;
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    errors.push(`${path.relative(root, file)}: ${String(error.stderr || error.stdout || error.message).trim()}`);
  }
}

const html = path.join(root, 'index.html');
if (fs.existsSync(html)) {
  const text = fs.readFileSync(html, 'utf8');
  if (!/^\s*<!doctype html>/i.test(text)) errors.push('index.html: missing doctype');
  if (!/<html\b/i.test(text) || !/<\/html>\s*$/i.test(text)) errors.push('index.html: document shell is incomplete');
  if (!/<script\b/i.test(text) || !/<\/script>/i.test(text)) errors.push('index.html: script structure is incomplete');
  if ((text.match(/id="view-webstudio"/gi) || []).length !== 1) errors.push('index.html: expected exactly one Web Studio view');
  if (!/id="app-sidebar"/i.test(text) || !/id="mobile-drawer"/i.test(text)) errors.push('index.html: main navigation shell is missing');
  if (/Agent is starting/i.test(text)) errors.push('index.html: stale Web Studio agent-starting copy detected');

  const inlineScriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let inlineIndex = 0;

  for (const match of text.matchAll(inlineScriptPattern)) {
    inlineIndex += 1;

    const attrs = String(match[1] || '');
    const body = String(match[2] || '');

    if (!body.trim()) continue;
    if (/\bsrc\s*=\s*/i.test(attrs)) continue;

    const typeMatch = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i);
    const type = String(typeMatch?.[1] || '').trim().toLowerCase();

    if (
      type &&
      type !== 'module' &&
      !type.includes('javascript') &&
      type !== 'text/ecmascript' &&
      type !== 'application/ecmascript'
    ) {
      continue;
    }

    try {
      execFileSync(
        process.execPath,
        ['--check'],
        {
          input: body,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );
    } catch (error) {
      errors.push(
        `index.html inline script #${inlineIndex}: ${String(
          error.stderr ||
          error.stdout ||
          error.message
        ).trim()}`
      );
    }
  }

  const studioMatch = text.match(/<script id="ovyx-webstudio-v2-runtime">([\s\S]*?)<\/script>/i);
  if (studioMatch) {
    try {
      execFileSync(process.execPath, ['--check'], { input: String(studioMatch[1] || ''), encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
    } catch (error) {
      errors.push(`index.html Web Studio runtime: ${String(error.stderr || error.stdout || error.message).trim()}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log('OVYX static verification passed.');
