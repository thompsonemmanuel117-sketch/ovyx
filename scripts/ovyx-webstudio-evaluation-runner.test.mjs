import assert from 'node:assert/strict';
import { evaluateSiteFiles } from './ovyx-webstudio-evaluation-runner.mjs';
import fs from 'node:fs';
import path from 'node:path';

const suite = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/ovyx-webstudio-evaluation-cases.json'), 'utf8'));
const category = suite.siteCategories.find(item => item.id === 'agency');
assert.ok(category, 'An evaluation category must be available.');

const goodFiles = {
  'index.html': '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Northstar Studio</title><meta name="description" content="Independent creative studio."><meta property="og:title" content="Northstar Studio"><link rel="stylesheet" href="assets/site.css"></head><body><nav aria-label="Main"><a href="/about/">About the studio</a></nav><main><h1>Ideas made tangible</h1><section><p>We create digital experiences with care.</p><img src="assets/mark.svg" alt="Northstar Studio mark"><a href="/about/">Meet the studio</a></section></main></body></html>',
  'about/index.html': '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>About Northstar Studio</title><meta name="description" content="Learn about Northstar Studio."><meta property="og:title" content="About Northstar Studio"><link rel="stylesheet" href="../assets/site.css"></head><body><nav aria-label="Main"><a href="/">Home</a></nav><main><h1>About the studio</h1><section><p>A small team building considered products.</p></section></main></body></html>',
  'assets/site.css': 'html{font-family:system-ui,sans-serif}body{margin:0;color:#111;background:#fff}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}',
  'assets/mark.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>',
};
const good = evaluateSiteFiles(goodFiles, category);
assert.equal(good.status, 'pass', JSON.stringify(good.findings));
assert.equal(good.counts.htmlPages, 2);
assert.ok(good.technicalReadinessScore >= 95);
assert.ok(good.functionalAcceptance.some(item => item.status === 'not-proven-by-static-scan'));
assert.ok(good.integrationTruth.every(item => item.status.includes('unverified')));

const secret = 'sk-abcdefghijklmnopqrstuvwxyz123456';
const badFiles = {
  'index.html': '<html><body><h1>Replace this with your company name</h1><a href="#">Click</a><img src="missing.png"><script src="missing.js"></script><main></main></body></html>',
  'app.js': 'const apiKey = "' + secret + '";',
};
const bad = evaluateSiteFiles(badFiles, category);
assert.equal(bad.status, 'needs-attention');
assert.ok(bad.findings.some(item => item.code === 'PLACEHOLDER_COPY'));
assert.ok(bad.findings.some(item => item.code === 'CLIENT_SECRET_PATTERN'));
assert.ok(bad.findings.some(item => item.code === 'PLACEHOLDER_LINK'));
assert.ok(bad.findings.every(item => !item.message.includes(secret)), 'Reports must not echo secret values.');
assert.ok(bad.findings.some(item => item.code === 'SCRIPT_UNRESOLVED'));

console.log('Web Studio artifact evaluator tests passed: technical readiness, missing resources, placeholder content, secret redaction, and unverified functional/integration status.');
