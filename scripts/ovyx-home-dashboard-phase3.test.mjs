import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const middleware = await readFile(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
const gallery = await readFile(new URL('../assets/ovyx-home-recent-website-gallery.js', import.meta.url), 'utf8');
const galleryCss = await readFile(new URL('../assets/css/ovyx-home-recent-website-gallery.css', import.meta.url), 'utf8');
const behavior = await readFile(new URL('../assets/ovyx-home-dashboard-behavior.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

// Keep the original Home markup and base styling authoritative. The later
// Phase 3 copy/layout layer must not be injected over the original dashboard.
assert.ok(!middleware.includes('ovyx-home-dashboard-phase3.js?v=20261113-1'),
  'The Phase 3 copy override must stay disabled.');
assert.ok(!middleware.includes('ovyx-home-dashboard-phase3.css?v=20261113-1'),
  'The Phase 3 layout override must stay disabled.');

// Keep the requested Home prompt/gallery enhancements and existing behavior.
assert.ok(middleware.includes('ovyx-home-recent-website-gallery.js?v=20261114-2'));
assert.ok(middleware.includes('ovyx-home-recent-website-gallery.css?v=20261114-2'));
assert.ok(middleware.includes('ovyx-home-dashboard-behavior.js?v=20261114-1'));
assert.ok(gallery.includes('Describe what you want to build with OVYX'));
assert.ok(gallery.includes("buildLabel.textContent = 'Build'"));
assert.ok(galleryCss.includes('#view-home #home-projects-grid'));
assert.ok(galleryCss.includes('aspect-ratio: 16 / 9'));
assert.ok(galleryCss.includes('min-height: 104px'));
assert.ok(behavior.includes('MODE_TO_DEPTH = { fast: 1, balanced: 2, quality: 3 }'));
assert.ok(html.includes('id="view-home"'));
assert.ok(html.includes('id="prompt-home-input"'));
assert.ok(html.includes('id="v59-ai-mode-select"'));
assert.ok(html.includes('id="v59-build"'));

console.log('OVYX original Home presentation, prompt controls and Recent Websites gallery contracts passed.');
