import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimePath = path.join(root, 'assets/ovyx-webstudio-quality.js');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));

const home = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Home | QA fixture</title><link rel="stylesheet" href="../styles.css"></head><body><nav aria-label="Primary navigation"><a href="/">Home</a><a href="/about/">About</a><a href="/contact/">Contact</a></nav><main><h1>Home</h1><img alt="Brand mark" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="><button id="toggle-info" type="button">Open details</button><p id="info" hidden>Helpful details appear here.</p><form action="/contact/submit" method="post"><label for="email">Email</label><input id="email" type="email" name="email"><button type="submit">Send request</button></form></main><script src="../main.js"></script></body></html>';
const about = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>About | QA fixture</title><link rel="stylesheet" href="../styles.css"></head><body><nav aria-label="Primary navigation"><a href="/">Home</a><a href="/about/">About</a><a href="/contact/">Contact</a></nav><main><h1>About</h1><p>About this test website.</p><div class="overflow-probe" style="width:1100px;max-width:none">Responsive regression fixture</div></main><script src="../main.js"></script></body></html>';
const contact = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Contact | QA fixture</title><link rel="stylesheet" href="../styles.css"></head><body><nav aria-label="Primary navigation"><a href="/">Home</a><a href="/about/">About</a><a href="/contact/">Contact</a></nav><main><h1>Contact</h1><form action="/contact/submit" method="post"><label for="name">Name</label><input id="name" name="name"><label for="message">Message</label><textarea id="message" name="message"></textarea><button type="submit">Send message</button></form></main><script src="../main.js"></script></body></html>';
const css = '*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Arial,sans-serif;color:#172033;background:#fff}nav{display:flex;gap:12px;flex-wrap:wrap;padding:12px}main{width:100%;max-width:64rem;margin:0 auto;padding:16px}img{max-width:100%;height:auto}button,input,textarea{max-width:100%;font:inherit}button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid #8b5cf6;outline-offset:2px}@media(max-width:600px){nav{gap:8px}main{padding:12px}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}';
const js = 'var info=document.getElementById("info");var toggle=document.getElementById("toggle-info");if(toggle&&info){toggle.addEventListener("click",function(){info.hidden=!info.hidden;toggle.textContent=info.hidden?"Open details":"Close details"})}document.body.dataset.qaScript="loaded";';

const scriptJSON = value => JSON.stringify(value).replace(/</g, '\\u003c');

const fixture = '<!doctype html><html lang="en"><head><title>OVYX Web Studio quality fixture</title></head><body><section id="view-webstudio" aria-hidden="false"><header><div class="ovyx-ws-header-actions"><button id="ws-preview-trigger" type="button">Preview</button></div></header><div id="ws-inline-preview"><div id="ws-console-body"></div></div></section><script>window.KernelState={activeView:"webstudio",activeProject:{id:"quality-test-project",name:"Quality test site",description:"A test website",pages:[{name:"Home",route:"/",__ovyxFile:"src/pages/Home.html"},{name:"About",route:"/about/",__ovyxFile:"src/pages/About.html"},{name:"Contact",route:"/contact/",__ovyxFile:"src/pages/Contact.html"}],ovyxBuildState:"verified",ovyxBuildVerifiedAt:"2000-01-01T00:00:00.000Z"},projects:[]};window.KernelState.projects=[window.KernelState.activeProject];window.ProjectStore={save:function(){},renderHome:function(){},renderProjects:function(){}};window.__qualityRepairCalls=[];window.__qualityToasts=[];window.__previewPublishRecords=[];window.__qualityTimeline=[];window.addEventListener("ovyx:webstudio-build-stage",function(event){window.__qualityTimeline.push({kind:"stage",stage:event.detail&&event.detail.stage})});window.addEventListener("ovyx:webstudio-quality-report",function(event){var report=event.detail||{};window.__qualityTimeline.push({kind:"report",gatePassed:(report.checks||[]).some(function(item){return item.group==="Automatic build gate"&&item.status==="pass"})})});window.showToast=function(message,kind){window.__qualityToasts.push({message:String(message),kind:String(kind||"")})};window.WebStudio={graph:{version:2,entry:"src/pages/Home.html",files:{"src/pages/Home.html":{type:"text/html",content:""},"src/pages/About.html":{type:"text/html",content:""},"src/pages/Contact.html":{type:"text/html",content:""},"src/styles.css":{type:"text/css",content:""},"src/main.js":{type:"text/javascript",content:""}},updatedAt:Date.now()},requestEpoch:1,historyStack:[],historyPointer:-1,graphKeyPrefix:"quality-test.",ensureProjectGraph:function(){return this.graph},snapshotGraph:function(){return JSON.parse(JSON.stringify(this.graph))},diffFiles:function(a,b){var A=a&&a.files||{},B=b&&b.files||{};return Array.from(new Set(Object.keys(A).concat(Object.keys(B)))).filter(function(k){var av=typeof A[k]==="string"?A[k]:A[k]&&A[k].content||"";var bv=typeof B[k]==="string"?B[k]:B[k]&&B[k].content||"";return av!==bv})},runTests:function(){return {ok:true,summary:"Source checks passed.",details:"No source issues."}},syncGraphToProject:function(){window.KernelState.activeProject.ovyxGraph=this.graph},renderPreview:function(){var report=window.OVYXWebStudioQuality&&window.OVYXWebStudioQuality.getReport();var record={kind:"preview",aboutContent:this.graph.files["src/pages/About.html"].content,qualityPassed:!!report&&report.status==="pass",gatePassed:!!report&&(report.checks||[]).some(function(item){return item.group==="Automatic build gate"&&item.status==="pass"})};window.__previewPublishRecords.push(record);window.__qualityTimeline.push({kind:"preview",gatePassed:record.gatePassed})},render:function(){},runBuildAgent:async function(prompt,repair,token,attachments,rollback){window.__qualityRepairCalls.push({prompt:String(prompt),repair:repair===true,token:token});var about=this.graph.files["src/pages/About.html"];about.content=repair===true?about.content.replace("width:1100px;max-width:none","width:100%;max-width:100%"):about.content.replace("width:100%;max-width:100%","width:1100px;max-width:none");window.KernelState.activeProject.ovyxGraph=this.graph;window.KernelState.activeProject.ovyxBuildState="verified";window.KernelState.activeProject.ovyxBuildVerifiedAt=new Date(Date.now()+5).toISOString();this.renderPreview();return {ok:true}}};window.WebStudio.graph.files["src/pages/Home.html"].content=' + scriptJSON(home) + ';window.WebStudio.graph.files["src/pages/About.html"].content=' + scriptJSON(about) + ';window.WebStudio.graph.files["src/pages/Contact.html"].content=' + scriptJSON(contact) + ';window.WebStudio.graph.files["src/styles.css"].content=' + scriptJSON(css) + ';window.WebStudio.graph.files["src/main.js"].content=' + scriptJSON(js) + ';window.KernelState.activeProject.ovyxGraph=window.WebStudio.graph;</script></body></html>';

try {
  await page.setContent(fixture, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ path: runtimePath });
  await page.waitForFunction(() => !!window.OVYXWebStudioQuality && document.querySelector('[data-ovyx-quality-trigger]'));
  assert.equal(await page.locator('[data-ovyx-quality-trigger]').count(), 1, 'The inspector must add a Web Studio toolbar control.');
  assert.equal(await page.evaluate(() => document.querySelectorAll('#ws-preview-menu [data-ws-menu]').length), 0, 'The quality feature must not mutate the original preview-menu action list.');

  await page.locator('[data-ovyx-quality-trigger]').click();
  await page.locator('[data-quality-run]').click();
  await page.waitForFunction(() => {
    const report = window.OVYXWebStudioQuality?.getReport();
    return !!report?.finishedAt && report.browser.completed === 15;
  }, null, { timeout: 30000 });
  const first = await page.evaluate(() => window.OVYXWebStudioQuality.getReport());
  assert.equal(first.browser.total, 15, 'Three generated pages must each receive five real viewport checks.');
  assert.equal(first.browser.completed, 15, 'Every planned viewport check must report completion.');
  assert.ok(first.browser.interactions.tested >= 1, 'The inspector must actually click at least one safe stateful control in the generated page sandbox.');
  assert.ok(first.browser.interactions.responded >= 1, 'The inspector must observe a state change from the working disclosure control.');
  assert.ok(first.checks.some(item => item.title === 'Safe interactive behavior smoke test' && item.status === 'pass'), 'Responsive report must include evidence that a safe stateful control worked.');
  assert.ok(first.browser.accessibility.contrastSamples > 0, 'The mobile browser pass must sample rendered text contrast against solid backgrounds.');
  assert.ok(first.checks.some(item => item.title === 'Rendered text contrast sample' && item.status === 'pass'), 'The accessible fixture must pass the rendered contrast audit.');
  assert.ok(first.browser.accessibility.focusControls > 0, 'The mobile browser pass must inspect keyboard-focusable controls.');
  assert.ok(first.checks.some(item => item.title === 'Visible keyboard focus indicators' && item.status === 'pass'), 'The accessible fixture must report visible focus cues.');
  assert.ok(first.browser.performance.samples > 0, 'The browser matrix must collect isolated render and DOM metrics.');
  assert.ok(first.browser.performance.maxDomNodes > 0, 'The diagnostic must count rendered DOM nodes.');
  assert.ok(first.checks.some(item => item.title === 'Isolated render processing budget' && item.status === 'pass'), 'The small fixture must pass its isolated processing/DOM budget.');
  assert.ok(first.checks.some(item => item.title === 'Horizontal overflow' && item.status === 'fail'), 'The inspector must detect a real mobile horizontal-overflow defect.');
  assert.ok(first.checks.some(item => item.title === 'Live integration verification' && item.status === 'info'), 'The inspector must not claim live integrations were verified.');
  assert.equal((await page.evaluate(() => window.__qualityRepairCalls.length)), 0, 'A scan alone must not spend an AI repair attempt.');
  assert.ok(pageErrors.length === 0, 'The host page should have no unhandled runtime errors: ' + pageErrors.join('; '));

  await page.locator('[data-quality-repair]').click();
  await page.waitForFunction(() => window.__qualityRepairCalls.length === 1 && window.OVYXWebStudioQuality.getReport()?.checks.some(item => item.group === 'Automatic repair'));
  const finalReport = await page.evaluate(() => window.OVYXWebStudioQuality.getReport());
  assert.equal((await page.evaluate(() => window.__qualityRepairCalls.length)), 1, 'Only one bounded repair pass should be sent.');
  assert.ok((await page.evaluate(() => window.__qualityRepairCalls[0].prompt)).includes('OVYX QUALITY INSPECTOR REPAIR'), 'The repair must use a targeted evidence-based prompt.');
  assert.ok(finalReport.checks.some(item => item.title === 'Horizontal overflow' && item.status === 'pass'), 'The repaired project must be tested again and pass the same overflow check.');
  assert.ok(finalReport.checks.some(item => item.group === 'Automatic repair' && item.status === 'pass'), 'The inspector must record a successful re-verification only after the observed score improves.');
  assert.ok((await page.evaluate(() => window.__qualityToasts.some(item => item.kind === 'success'))), 'The UI may announce success only after the verified re-check.');
  assert.ok(pageErrors.length === 0, 'The inspector must not create host-page errors: ' + pageErrors.join('; '));
  const manualPreview = await page.evaluate(() => window.__previewPublishRecords.slice());
  assert.equal(manualPreview.length, 1, 'A manually repaired site must publish only one final preview after the passing re-check.');
  assert.ok(manualPreview[0].aboutContent.includes('width:100%;max-width:100%'), 'The visible preview must contain the repaired responsive layout, not the defect.');
  assert.equal(manualPreview[0].qualityPassed, true, 'The manual-repair preview may be released only after a clean quality report.');

  // Test the production lifecycle wrapper as well: a new, source-verified build
  // must run the quality inspector automatically, get one repair, and pass a fresh
  // responsive matrix before the wrapper reports a verified build.
  await page.evaluate(() => {
    const aboutFile = window.WebStudio.graph.files["src/pages/About.html"];
    aboutFile.content = aboutFile.content.replace("width:1100px;max-width:none", "width:100%;max-width:100%");
    window.KernelState.activeProject.ovyxBuildVerifiedAt = "2000-01-01T00:00:00.000Z";
  });
  const previewCountBeforeAutoBuild = await page.evaluate(() => window.__previewPublishRecords.length);
  const timelineCountBeforeAutoBuild = await page.evaluate(() => window.__qualityTimeline.length);
  await page.evaluate(async () => window.WebStudio.runBuildAgent("Normal generated build under automatic gate", false, 2, [], null));
  await page.waitForFunction(() => {
    const report = window.OVYXWebStudioQuality?.getReport();
    return !!report?.finishedAt && report.checks.some(item => item.group === 'Automatic build gate' && item.title === 'Post-build quality gate' && item.status === 'pass');
  }, null, { timeout: 60000 });
  const autoReport = await page.evaluate(() => window.OVYXWebStudioQuality.getReport());
  const calls = await page.evaluate(() => window.__qualityRepairCalls);
  assert.equal(calls.length, 3, 'The initial manual repair plus a normal build and one automatic repair must be the only calls.');
  assert.equal(calls[1].repair, false, 'The automatic scenario must begin with a regular new build.');
  assert.equal(calls[2].repair, true, 'The automatic quality gate must use exactly one bounded repair.');
  assert.ok(calls[2].prompt.includes('OVYX QUALITY INSPECTOR REPAIR'), 'The automatic repair must be targeted to observed findings.');
  assert.ok(autoReport.checks.some(item => item.title === 'Horizontal overflow' && item.status === 'pass'), 'The automatic build must be re-inspected after repair.');
  assert.ok(autoReport.checks.some(item => item.group === 'Automatic repair' && item.title === 'Repair verification' && item.status === 'pass'), 'The bounded repair must be evidenced in the report.');
  assert.ok(autoReport.checks.some(item => item.group === 'Automatic build gate' && item.status === 'pass'), 'The normal build may be considered verified only after the automatic quality gate passes.');
  const automaticPreview = await page.evaluate(() => window.__previewPublishRecords.slice());
  assert.equal(automaticPreview.length, previewCountBeforeAutoBuild + 1, 'The generated build must not publish its first preview before the post-build quality gate and repair/re-check finish.');
  assert.ok(automaticPreview[automaticPreview.length - 1].aboutContent.includes('width:100%;max-width:100%'), 'The only published preview must contain the verified, repaired site state.');
  assert.equal(automaticPreview[automaticPreview.length - 1].qualityPassed, true, 'The released preview must have a clean quality report.');
  assert.equal(automaticPreview[automaticPreview.length - 1].gatePassed, true, 'The automatic build preview must only be released after the build-gate pass is recorded.');
  const automaticTimeline = await page.evaluate(start => window.__qualityTimeline.slice(start), timelineCountBeforeAutoBuild);
  const gateReportIndex = automaticTimeline.findIndex(event => event.kind === 'report' && event.gatePassed);
  const publishedPreviewIndex = automaticTimeline.findIndex(event => event.kind === 'preview' && event.gatePassed);
  const buildVerifiedIndexes = automaticTimeline.map((event, index) => event.kind === 'stage' && event.stage === 'build-verified' ? index : -1).filter(index => index >= 0);
  assert.ok(gateReportIndex >= 0 && publishedPreviewIndex > gateReportIndex, 'A passing automatic build-gate report must be recorded before the preview is published.');
  assert.equal(buildVerifiedIndexes.length, 1, 'An automatic build must announce full verification exactly once.');
  assert.ok(buildVerifiedIndexes[0] > publishedPreviewIndex, 'The build-verified status must only be emitted after the verified preview is released.');
  assert.equal(await page.evaluate(() => window.WebStudio.graph.files["src/pages/About.html"].content.includes("width:1100px;max-width:none")), false, 'The automatically repaired graph must not retain the known overflow defect.');
  assert.ok(pageErrors.length === 0, 'The automatic lifecycle gate must not create browser errors: ' + pageErrors.join('; '));

  console.log('Web Studio quality browser tests passed: toolbar wiring, source, 3 routes × 5 viewport checks, safe-control interaction smoke test, manual and automatic bounded repair, post-build quality gate, verified-preview release timing, rollback-aware verification, and truthful integration status.');
} finally {
  await browser.close();
}
