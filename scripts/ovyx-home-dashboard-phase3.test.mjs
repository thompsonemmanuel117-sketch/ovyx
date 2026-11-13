import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const middleware = await readFile(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
const gallery = await readFile(new URL('../assets/ovyx-home-recent-website-gallery.js', import.meta.url), 'utf8');
const galleryCss = await readFile(new URL('../assets/css/ovyx-home-recent-website-gallery.css', import.meta.url), 'utf8');
const behavior = await readFile(new URL('../assets/ovyx-home-dashboard-behavior.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

// Keep the original Home markup and base styling authoritative. The later
// Phase 3 copy/layout layer must not be injected over the original dashboard.
assert.doesNotMatch(middleware, /ovyx-home-dashboard-phase3\\.js\\?v=/,
  'The Phase 3 copy override must stay disabled.');
assert.doesNotMatch(middleware, /ovyx-home-dashboard-phase3\\.css\\?v=/,
  'The Phase 3 layout override must stay disabled.');

// Keep only the requested Home prompt/gallery enhancements and existing
// dashboard behavior runtime active.
assert.match(middleware, /ovyx-home-recent-website-gallery\\.js\\?v=20261113-1/);
assert.match(middleware, /ovyx-home-recent-website-gallery\\.css\\?v=20261113-1/);
assert.match(middleware, /ovyx-home-dashboard-behavior\\.js\\?v=20261113-1/);
assert.match(gallery, /Describe what you want to build with OVYX/);
assert.match(gallery, /buildLabel\\.textContent = 'Build'/);
assert.match(galleryCss, /#view-home #home-projects-grid/);
assert.match(galleryCss, /aspect-ratio:\\s*16\\s*\\/\\s*9/);
assert.match(galleryCss, /min-height:\\s*104px/);
assert.match(behavior, /MODE_TO_DEPTH = \\{ fast: 1, balanced: 2, quality: 3 \\}/);
assert.match(html, /id="view-home"/);
assert.match(html, /id="prompt-home-input"/);
assert.match(html, /id="v59-ai-mode-select"/);
assert.match(html, /id="v59-build"/);

console.log('OVYX original Home presentation, prompt controls and Recent Websites gallery contracts passed.');
