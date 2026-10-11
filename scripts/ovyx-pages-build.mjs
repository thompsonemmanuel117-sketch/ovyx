import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const required = [
  'index.html',
  'assets/ovyx-launch-polish.js',
  'functions',
  'functions/_routes.json',
  'package.json',
];

const missing = required.filter(path => !fs.existsSync(path));
if (missing.length) {
  console.error(`OVYX Pages build cannot continue; missing: ${missing.join(', ')}`);
  process.exit(1);
}

execFileSync(process.execPath, ['scripts/ovyx-static-verify.mjs'], {
  stdio: 'inherit',
});

// Inject the shared launch polish runtime into the Pages output without editing
// the very large, versioned application shell by hand. The operation is
// idempotent, so local previews and repeated Pages builds never duplicate it.
const htmlPath = 'index.html';
const launchMarker = 'assets/ovyx-launch-polish.js';
let html = fs.readFileSync(htmlPath, 'utf8');
if (!html.includes(launchMarker)) {
  const closingBodyIndex = html.toLowerCase().lastIndexOf('</body>');
  if (closingBodyIndex < 0) {
    console.error('OVYX Pages build cannot continue; index.html has no closing body tag for the launch runtime.');
    process.exit(1);
  }
  const scriptTag = '<script defer src="/assets/ovyx-launch-polish.js"></script>';
  html = html.slice(0, closingBodyIndex) + scriptTag + '\n' + html.slice(closingBodyIndex);
  fs.writeFileSync(htmlPath, html, 'utf8');
}

console.log('OVYX Pages build preflight passed and the launch polish runtime is present. Cloudflare Pages configuration is managed by the Cloudflare dashboard.');
