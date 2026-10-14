import assert from 'node:assert/strict';
import { evaluateSiteFiles } from './ovyx-webstudio-evaluation-runner.mjs';
import fs from 'node:fs';
import path from 'node:path';

const suite = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/ovyx-webstudio-evaluation-cases.json'), 'utf8'));
const category = suite.siteCategories.find(item => item.id === 'agency');
assert.ok(category, 'An evaluation category must be available.');

const goodFiles = {
  'index.html': '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Northstar Studio</title><meta name="description" content="Independent creative studio."><meta property="og:title" content="Northstar Studio"><link rel="stylesheet" href="assets/site.css"></head><body><nav aria-label="Main"><a href="/about/">About the studio</a><a href="/about/#team">Meet the team</a><a href="#approach">Our approach</a></nav><main><h1>Ideas made tangible</h1><section id="approach"><p>We create digital experiences with care.</p><img src="assets/mark.svg" srcset="assets/mark.svg 1x" alt="Northstar Studio mark"><a href="/about/">Meet the studio</a></section></main></body></html>',
  'about/index.html': '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>About Northstar Studio</title><meta name="description" content="Learn about Northstar Studio."><meta property="og:title" content="About Northstar Studio"><link rel="stylesheet" href="../assets/site.css"></head><body><nav aria-label="Main"><a href="/">Home</a></nav><main><h1>About the studio</h1><section id="team"><p>A small team building considered products.</p></section></main></body></html>',
  'assets/site.css': 'html{font-family:system-ui,sans-serif}body{margin:0;color:#111;background:#fff}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}',
  'assets/mark.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>',
};
const good = evaluateSiteFiles(goodFiles, category);
assert.equal(good.status, 'pass', JSON.stringify(good.findings));
assert.equal(good.counts.htmlPages, 2);
assert.ok(good.technicalReadinessScore >= 95);
assert.ok(good.functionalAcceptance.some(item => item.status === 'not-proven-by-static-scan'));
assert.ok(good.integrationTruth.every(item => item.status.includes('unverified')));
assert.equal(good.counts.fragmentLinks, 2, 'Valid same-page and cross-page fragment links should be counted.');
assert.equal(good.counts.srcsetCandidates, 1, 'Responsive image candidates should be counted.');
assert.ok(!good.findings.some(item => ['ORPHAN_FRAGMENT', 'BROKEN_ROUTE_FRAGMENT', 'IMAGE_SRCSET_UNRESOLVED'].includes(item.code)));

const routeAssetFailures = evaluateSiteFiles({
  ...goodFiles,
  'index.html': goodFiles['index.html']
    .replace('href="/about/#team"', 'href="/about/#missing-team"')
    .replace('href="#approach"', 'href="#missing-approach"')
    .replace('srcset="assets/mark.svg 1x"', 'srcset="assets/missing-2x.webp 2x"'),
}, category);
assert.ok(routeAssetFailures.findings.some(item => item.code === 'BROKEN_ROUTE_FRAGMENT'), 'The evaluator must find broken fragments targeting known pages.');
assert.ok(routeAssetFailures.findings.some(item => item.code === 'ORPHAN_FRAGMENT'), 'The evaluator must find broken same-page fragments.');
assert.ok(routeAssetFailures.findings.some(item => item.code === 'IMAGE_SRCSET_UNRESOLVED'), 'The evaluator must find missing responsive-image candidates.');

const accessibleReferenceFailures = evaluateSiteFiles({
  ...goodFiles,
  'index.html': goodFiles['index.html'].replace(
    '</main>',
    '<label for="missing-email-control">Email</label><input id="unlabelled-email" name="email"><button aria-labelledby="missing-button-name">Save</button><p aria-describedby="missing-help-copy">Help text</p></main>',
  ),
}, category);
assert.ok(accessibleReferenceFailures.findings.some(item => item.code === 'LABEL_TARGET_MISSING'), 'The evaluator must detect labels that target absent controls.');
assert.ok(accessibleReferenceFailures.findings.some(item => item.code === 'ARIA_REFERENCE_TARGET_MISSING'), 'The evaluator must detect aria-labelledby/aria-describedby references with missing ids.');
assert.ok(accessibleReferenceFailures.findings.some(item => item.code === 'FORM_CONTROL_LABEL_MISSING'), 'A missing aria-labelledby target must not count as a valid form control label.');

const dataSrcset = evaluateSiteFiles({
  ...goodFiles,
  'index.html': goodFiles['index.html'].replace('srcset="assets/mark.svg 1x"', 'srcset="data:image/svg+xml,%3Csvg%3E 1x"'),
}, category);
assert.ok(!dataSrcset.findings.some(item => item.code === 'IMAGE_SRCSET_UNRESOLVED'), 'Data URLs must not create false responsive-image findings.');

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
