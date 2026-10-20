import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const upgrade = await readFile(new URL('../assets/ovyx-webstudio-fullstack-upgrade.js', import.meta.url), 'utf8');
const research = await readFile(new URL('../assets/ovyx-webstudio-research.js', import.meta.url), 'utf8');
const middleware = await readFile(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
const headers = await readFile(new URL('../_headers', import.meta.url), 'utf8');

assert.match(upgrade, /Your design is the beginning\. Want the working system behind it\?/);
assert.match(upgrade, /Yes — upgrade my website/);
assert.match(upgrade, /Not now/);
assert.match(upgrade, /data-ovyx-fullstack-upgrade/);
assert.match(upgrade, /ovyx-ws-fullstack-upgrade-overlay/);
assert.match(upgrade, /studio\.runBuildAgent\(buildPrompt\(\), true/);
assert.match(upgrade, /FULL_STACK_SETUP\.md/);
assert.match(upgrade, /server-side API endpoints/);
assert.match(upgrade, /authentication and server-side authorization/);
assert.match(upgrade, /Never claim the website is fully connected/);
assert.match(upgrade, /The previous project snapshot was restored/);
assert.match(upgrade, /testResult\.ok === false/);
assert.match(upgrade, /prefers-reduced-motion/);
assert.match(upgrade, /role', 'dialog'/);
assert.match(upgrade, /aria-modal', 'true'/);
assert.match(upgrade, /window\.OVYXWebStudioFullStackUpgrade =/);
assert.match(upgrade, /event\.key !== 'Tab'/);
assert.match(upgrade, /ovyx\.webstudio\.fullstack\.upgrade\.v1\./);

assert.match(research, /function hasMeaningfulWebsite\(files\)/);
assert.match(research, /isInitialWebsiteBuild: isInitialWebsiteBuild/);
assert.match(research, /ovyx:webstudio-initial-site-built/);
assert.match(research, /sourceTestsPassed: true/);
assert.match(middleware, /\/assets\/ovyx-webstudio-fullstack-upgrade\.js\?v=20261020-1/);
assert.match(headers, /\/assets\/ovyx-webstudio-fullstack-upgrade\.js\n  Cache-Control: no-store, no-cache, must-revalidate/);
assert.doesNotThrow(() => new Function(upgrade), 'The full-stack upgrade browser runtime must parse as valid JavaScript.');
assert.doesNotThrow(() => new Function(research), 'The Web Studio research runtime must parse as valid JavaScript.');

console.log('OVYX Web Studio full-stack upgrade offer, implementation contract, rollback safeguards, and first-build trigger tests passed.');
