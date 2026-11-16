import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const runtime = read('assets/ovyx-app-studio-visual-redesign.js');
const visualRefresh = read('assets/ovyx-app-studio-visual-refresh.js');
const middleware = read('functions/_middleware.js');
const headers = read('_headers');
const workflow = read('.github/workflows/ovyx-assistant-workspace-browser.yml');
execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../assets/ovyx-app-studio-visual-redesign.js', import.meta.url))], { stdio: 'pipe' });

for (const id of ['ovyx-app-studio-experience','ovyx-app-studio-workspace-dock']) {
  assert.ok(runtime.includes(id), 'The redesign must compose existing App Studio elements: ' + id);
}
for (const id of ['ovyx-app-studio-url-analyzer-panel','ovyx-app-studio-link-builder','ovyx-app-studio-project-brain','ovyx-app-studio-release','ovyx-app-studio-brand-dna-panel','app-studio-clean-canvas']) {
  assert.ok(runtime.includes(id) || read('assets/ovyx-app-studio-premium-polish.js').includes(id), 'Existing App Studio feature must remain in the experience: ' + id);
}
assert.ok(runtime.includes('hero.after(dock)'), 'The guided flow must lead and the project overview must follow.');
assert.ok(!runtime.includes('display:flex!important'), 'The App Studio visual layer must not override the shell display state or expose a hidden view.');
assert.ok(runtime.includes('Analyze. Build. Verify. Release.'), 'The hero copy must be short and immediately scannable.');
assert.ok(visualRefresh.includes("description.textContent !== 'Analyze. Build. Verify. Release.'") && visualRefresh.includes("description.textContent = 'Analyze. Build. Verify. Release.'"), 'Both App Studio visual layers must agree on the hero copy to prevent a MutationObserver feedback loop.');
assert.ok(runtime.includes("status.textContent.trim() === 'Project status updates as you build.'"), 'Only the initial status hint may be shortened; live action feedback must be preserved.');
assert.ok(!runtime.includes("['.ovyx-as-hero__helper'"), 'The live project-aware helper copy must remain owned by Premium Polish to prevent competing MutationObservers.');
assert.ok(runtime.includes('prefers-reduced-motion:reduce'), 'The redesign must respect reduced-motion settings.');
assert.ok(runtime.includes('var(--as-text') && runtime.includes('var(--as-surface') && runtime.includes('var(--as-border'), 'Surfaces and text must use the active theme tokens.');
assert.ok(runtime.includes('color:#17140e!important'), 'Gold primary actions must retain readable dark text.');
assert.ok(!runtime.includes('fetch(') && !runtime.includes('OVYXAIService') && !runtime.includes('switchView('), 'The visual layer must not replace APIs, AI routing or application navigation.');
assert.ok(!runtime.includes('remove()') && !runtime.includes('.hidden = true'), 'The redesign must not remove or hide existing features.');
assert.ok(middleware.includes('/assets/ovyx-app-studio-visual-redesign.js?v=20261115-1'), 'The Pages shell must load the new visual layer after the existing App Studio runtimes.');
assert.ok(middleware.includes('ovyx-app-studio-visual-refresh.js?v=20261115-2"></script><script defer src="/assets/ovyx-app-studio-visual-redesign.js'), 'The existing visual refresh script tag must remain valid and load before the new layer.');
assert.ok(headers.includes('/assets/ovyx-app-studio-visual-redesign.js') && headers.includes('Cache-Control: no-store'), 'The visual asset must not be trapped behind stale caching.');
assert.ok(workflow.includes('ovyx-app-studio-visual-redesign.browser.test.mjs') && workflow.includes('ovyx-app-studio-visual-redesign.test.mjs'), 'CI must run static and desktop/mobile browser coverage.');
console.log('OVYX App Studio visual redesign source checks passed: concise hierarchy, theme tokens, reduced motion and preserved feature boundaries.');
