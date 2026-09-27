import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const required = [
  'index.html',
  'functions',
  'functions/_routes.json',
  'package.json',
  'wrangler.toml',
];

const missing = required.filter(path => !fs.existsSync(path));
if (missing.length) {
  console.error(`OVYX Pages build cannot continue; missing: ${missing.join(', ')}`);
  process.exit(1);
}

execFileSync(process.execPath, ['scripts/ovyx-static-verify.mjs'], {
  stdio: 'inherit',
});

console.log('OVYX Pages build preflight passed. Cloudflare Pages output directory: repository root.');
