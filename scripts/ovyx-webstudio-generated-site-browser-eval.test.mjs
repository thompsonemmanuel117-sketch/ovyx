import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ovyx-generated-site-fixture-'));
const out = path.join(root, 'report');
const site = path.join(root, 'sites', 'fixture-real-estate');
const badSite = path.join(root, 'sites', 'fixture-placeholder-copy');
await fs.mkdir(path.join(site, 'properties'), { recursive: true });
await fs.writeFile(path.join(site, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixture Realtor</title><style>*{box-sizing:border-box}body{margin:0;font:16px sans-serif}main{max-width:960px;margin:auto;padding:24px}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}@media(max-width:600px){.cards{grid-template-columns:1fr}}img{width:100%;height:auto}button{padding:12px}</style></head><body><main><h1>Find a home</h1><div class="cards"><article><img alt="Sample home" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="><h2>Sample property</h2><a href="/properties/index.html">View property</a></article></div><button type="button" id="contact-toggle" aria-expanded="false" aria-controls="agent-contact">Contact agent</button><p id="agent-contact" hidden>Agent contact details are not configured yet.</p></main><script>const toggle=document.querySelector("#contact-toggle");const contact=document.querySelector("#agent-contact");toggle.addEventListener("click",()=>{contact.hidden=!contact.hidden;toggle.setAttribute("aria-expanded",String(!contact.hidden));});</script></body></html>');
await fs.writeFile(path.join(site, 'properties', 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Property detail</title><meta name="description" content="Review this clearly labelled sample property and send a QA-only enquiry."></head><body><main><h1>Property detail</h1><a href="/">Back home</a><form method="post" action="/.well-known/ovyx-qa-enquiry"><label for="qa-name">Your name</label><input id="qa-name" name="name" required><button type="submit">Send enquiry</button><p id="qa-result" aria-live="polite"></p></form></main><script>const form=document.querySelector("form");form.addEventListener("submit",async event=>{event.preventDefault();const response=await fetch(form.action,{method:"POST",body:new URLSearchParams(new FormData(form))});document.querySelector("#qa-result").textContent=response.ok?"Enquiry received (QA only). No real customer message was sent.":"Could not send the QA enquiry. Try again.";});</script></body></html>');
await fs.mkdir(badSite, { recursive: true });
await fs.writeFile(path.join(badSite, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Placeholder copy fixture</title></head><body><main><h1>Meet the team</h1><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p></main></body></html>');

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'ovyx-webstudio-generated-site-browser-eval.mjs');
const run = spawnSync(process.execPath, [script, path.join(root, 'sites'), out], { encoding: 'utf8', timeout: 60000 });
assert.equal(run.status, 1, 'Browser evaluator should detect the deliberate placeholder-copy fixture. stderr: ' + run.stderr);
const report = JSON.parse(await fs.readFile(path.join(out, 'browser-report.json'), 'utf8'));
assert.equal(report.status, 'needs-attention');
assert.equal(report.sitesFound, 2);
assert.deepEqual(report.viewportWidths, [320, 390, 768, 1024, 1440]);
const good = report.results.find(item => item.site === 'fixture-real-estate');
const bad = report.results.find(item => item.site === 'fixture-placeholder-copy');
assert.ok(good && bad, 'The report should keep clean and deliberately flawed site evidence separate.');
assert.equal(good.status, 'browser-checked-no-obvious-blockers');
assert.equal(good.htmlRoutes, 2);
assert.equal(good.testedRoutes, 2);
assert.equal(good.pages.length, 10, 'Both routes should be checked at all five mobile, tablet and desktop widths.');
assert.equal(bad.status, 'needs-attention', 'Placeholder copy must be a reported quality issue.');
assert.equal(bad.pages.length, 5, 'The placeholder page should be inspected at all five widths.');
for (const page of good.pages) {
  await fs.access(path.join(out, 'fixture-real-estate', page.screenshot));
  assert.equal(page.metrics.horizontalOverflow, false);
  assert.equal(page.metrics.brokenImages.length, 0);
  assert.deepEqual(page.metrics.copyIssues, []);
}
assert.ok(bad.pages.every(page => page.metrics.copyIssues.includes('lorem ipsum')), 'Obvious lorem ipsum copy must be detected at every width.');
await fs.rm(root, { recursive: true, force: true });
console.log('Generated-site browser evaluator passed its two-route, five-viewport screenshot smoke test.');
