import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const required = [
  'index.html',
  'assets/ovyx-launch-polish.js',
  'functions',
  '_routes.json',
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

console.log('OVYX Pages build preflight passed. The root _routes.json enables the application-shell middleware and favicon routes while excluding static assets; Cloudflare Pages environment configuration remains dashboard-managed.');
