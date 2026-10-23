import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ovyx-generated-site-fixture-'));
const out = path.join(root, 'report');
const site = path.join(root, 'sites', 'fixture-real-estate');
await fs.mkdir(path.join(site, 'properties'), { recursive: true });
await fs.writeFile(path.join(site, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixture Realtor</title><style>*{box-sizing:border-box}body{margin:0;font:16px sans-serif}main{max-width:960px;margin:auto;padding:24px}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}@media(max-width:600px){.cards{grid-template-columns:1fr}}img{width:100%;height:auto}button{padding:12px}</style></head><body><main><h1>Find a home</h1><div class="cards"><article><img alt="Sample home" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="><h2>Sample property</h2><a href="/properties/index.html">View property</a></article></div><button type="button">Contact agent</button></main></body></html>');
await fs.writeFile(path.join(site, 'properties', 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Property detail</title></head><body><main><h1>Property detail</h1><a href="/">Back home</a></main></body></html>');

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'ovyx-webstudio-generated-site-browser-eval.mjs');
const run = spawnSync(process.execPath, [script, path.join(root, 'sites'), out], { encoding: 'utf8', timeout: 60000 });
assert.equal(run.status, 0, 'Browser evaluator should pass the responsive two-page fixture. stderr: ' + run.stderr);
const report = JSON.parse(await fs.readFile(path.join(out, 'browser-report.json'), 'utf8'));
assert.equal(report.status, 'browser-evaluated');
assert.equal(report.sitesFound, 1);
assert.equal(report.results[0].htmlRoutes, 2);
assert.equal(report.results[0].testedRoutes, 2);
assert.equal(report.results[0].pages.length, 6, 'Both routes should be checked at mobile, tablet and desktop widths.');
assert.deepEqual(report.viewportWidths, [390, 768, 1440]);
for (const page of report.results[0].pages) {
  await fs.access(path.join(out, 'fixture-real-estate', page.screenshot));
  assert.equal(page.metrics.horizontalOverflow, false);
  assert.equal(page.metrics.brokenImages.length, 0);
}
await fs.rm(root, { recursive: true, force: true });
console.log('Generated-site browser evaluator passed its two-route, three-viewport screenshot smoke test.');
