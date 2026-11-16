import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const premium = read('assets/ovyx-app-studio-premium-polish.js');
const workspace = read('assets/ovyx-app-studio-workspace.js');
const middleware = read('functions/_middleware.js');
const headers = read('_headers');
const workflow = read('.github/workflows/ovyx-assistant-workspace-browser.yml');
execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../assets/ovyx-app-studio-premium-polish.js', import.meta.url))], { stdio: 'pipe' });
execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../assets/ovyx-app-studio-workspace.js', import.meta.url))], { stdio: 'pipe' });

assert.ok(premium.includes("root.classList.add('ovyx-as-visual-redesign')"), 'The stable Premium Polish owner must apply the workbench class.');
assert.ok(premium.includes("ovyx-app-studio-workbench-style"), 'The workbench stylesheet must be installed by the single Premium Polish owner.');
assert.ok(premium.includes('grid-template-columns:repeat(4,minmax(0,1fr))!important'), 'The mobile workbench must use the compact four-step rail.');
assert.ok(premium.includes('.ovyx-as-stage-meta__title{display:none!important}'), 'Duplicate stage titles must be removed from the compact stage headers.');
assert.ok(premium.includes('var(--as-text') && premium.includes('var(--as-surface') && premium.includes('var(--as-border') && premium.includes('::placeholder'), 'Theme-aware surfaces, text, borders and placeholders must remain readable.');
assert.ok(premium.includes('padding-bottom:max(12px,env(safe-area-inset-bottom))'), 'The workbench must preserve only safe-area bottom clearance.');
assert.ok(premium.includes('prefers-reduced-motion:reduce'), 'The integrated workbench must respect reduced motion.');
assert.ok(workspace.includes("const hero = root.querySelector('#ovyx-app-studio-experience')") && workspace.includes('if (hero) hero.after(dock)'), 'The workspace dock must mount after the guided hero, not compete for first position.');
assert.ok(!middleware.includes('ovyx-app-studio-visual-redesign.js'), 'The competing standalone redesign observer must not be injected by the Pages shell.');
assert.ok(middleware.includes('ovyx-app-studio-premium-polish.js') && middleware.includes('ovyx-app-studio-workspace.js'), 'The established feature owners must remain loaded.');
assert.ok(headers.includes('Cache-Control: no-store'), 'The app shell must retain no-store caching.');
assert.ok(workflow.includes('ovyx-app-studio-premium-polish.browser.test.mjs') && workflow.includes('ovyx-app-studio-visual-redesign.test.mjs'), 'CI must run integrated desktop/mobile and static regression coverage.');
console.log('OVYX App Studio runtime ownership checks passed: one layout owner, stable dock placement, theme-aware compact workbench and preserved feature runtimes.');
