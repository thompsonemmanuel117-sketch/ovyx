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

for (const file of walk(path.join(root, 'functions'))) {
  if (!/\.(js|mjs|cjs)$/.test(file)) continue;
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    errors.push(`${path.relative(root, file)}: ${String(error.stderr || error.stdout || error.message).trim()}`);
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

  const inlineScriptPattern = /<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi;
  let inlineIndex = 0;

  for (const match of text.matchAll(inlineScriptPattern)) {
    inlineIndex += 1;

    const attrs = String(match[1] || '');
    const body = String(match[2] || '');

    if (!body.trim()) continue;
    if (/\\bsrc\\s*=\\s*/i.test(attrs)) continue;

    const typeMatch = attrs.match(/\\btype\\s*=\\s*["']([^"']+)["']/i);
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
