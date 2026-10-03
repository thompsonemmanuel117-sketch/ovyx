import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const required = (name) => {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing required mobile build environment variable: ${name}`);
  return value;
};

const baseUrl = required('OVYX_PUBLIC_BASE_URL').replace(/\/$/, '');
const jobId = required('OVYX_MOBILE_JOB_ID');
const expires = required('OVYX_MOBILE_PAYLOAD_EXPIRES');
const secret = required('OVYX_MOBILE_BUILD_PAYLOAD_SECRET');
const displayName = String(process.env.OVYX_APP_DISPLAY_NAME || 'OVYX Mobile App').trim().slice(0, 60);

const signature = crypto.createHmac('sha256', secret).update(`${jobId}.${expires}`).digest('hex');
const payloadUrl = `${baseUrl}/api/mobile/build/payload?jobId=${encodeURIComponent(jobId)}&exp=${encodeURIComponent(expires)}&sig=${encodeURIComponent(signature)}`;
const response = await fetch(payloadUrl, { headers: { accept: 'application/json' } });
const data = await response.json().catch(() => ({}));
if (!response.ok || !data?.ok) {
  throw new Error(data?.error || `OVYX payload fetch failed with HTTP ${response.status}.`);
}

const root = process.cwd();
const assetsDir = path.join(root, 'assets');
await fs.mkdir(assetsDir, { recursive: true });

const icon = String(data.iconDataUrl || '');
if (!/^data:image\/png;base64,/i.test(icon)) throw new Error('OVYX mobile payload does not contain a valid PNG icon.');
await fs.writeFile(path.join(assetsDir, 'icon.png'), Buffer.from(icon.replace(/^data:image\/png;base64,/i, ''), 'base64'));

function findHtml(value, depth = 0) {
  if (depth > 8 || value == null) return '';
  if (typeof value === 'string') {
    const clean = value.trim();
    if (clean.length > 100 && /<html|<body|<main|<!doctype/i.test(clean)) return clean;
    return '';
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findHtml(item, depth + 1);
      if (result) return result;
    }
    return '';
  }
  if (typeof value === 'object') {
    for (const key of ['html', 'renderedHtml', 'compiledHtml', 'content', 'source']) {
      const result = findHtml(value[key], depth + 1);
      if (result) return result;
    }
    for (const item of Object.values(value)) {
      const result = findHtml(item, depth + 1);
      if (result) return result;
    }
  }
  return '';
}

const website = data.payload?.website || {};
let html = findHtml(website.compiledHtmlTrees) || findHtml(website.pages) || findHtml(website.graph) || findHtml(website.project);
if (!html) throw new Error('OVYX could not find a compiled HTML tree in the Web Studio payload.');

if (!/<!doctype\s+html/i.test(html)) {
  html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${displayName.replace(/[<>]/g, '')}</title></head><body style="margin:0">${html}</body></html>`;
}

const generated = `const SITE_HTML = ${JSON.stringify(html)};\nexport default SITE_HTML;\n`;
await fs.writeFile(path.join(assetsDir, 'generated-site.js'), generated, 'utf8');

await fs.writeFile(path.join(root, 'build-runtime.json'), JSON.stringify({
  jobId,
  displayName,
  sourceProjectId: String(data.sourceProjectId || '').trim(),
  appSlug: String(data.appSlug || 'ovyx-mobile-app').trim(),
  easProjectId: String(process.env.EXPO_PROJECT_ID || '').trim()
}, null, 2), 'utf8');

console.log(`[OVYX] Prepared real mobile payload for job ${jobId}: ${html.length.toLocaleString()} HTML chars.`);
