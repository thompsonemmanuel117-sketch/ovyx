import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeAppStudioUrlSource, buildAppStudioLinkPrompt } from '../functions/_lib/app-studio-link-build.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const pages = Array.from({ length: 9 }, (_, index) => ({
  title: 'Page ' + index,
  url: 'https://example.com/page-' + index + '?private=token#top',
  path: '/page-' + index,
  depth: index,
  status: 'inspected',
}));
const assets = Array.from({ length: 30 }, (_, index) => ({
  type: 'image', url: 'https://cdn.example.com/asset-' + index + '.png?signature=private', alt: 'Source asset ' + index,
}));
const source = normalizeAppStudioUrlSource({
  source: { canonicalUrl: 'https://example.com/start?session=secret#hero', title: 'Example source' },
  summary: { pagesInspected: 2, internalLinksDiscovered: 25, assetsDiscovered: 30 },
  branding: {
    name: '<b>Example Homes</b>',
    confidence: 'high',
    colors: { primary: '#123456', secondary: '#ABCDEF', accent: 'red', text: '#112233' },
    logo: { url: 'https://cdn.example.com/logo.png?signature=secret', alt: 'Logo' },
    faviconUrl: 'javascript:alert(1)',
  },
  siteMap: { pages },
  assets: { items: assets },
});

assert.ok(source);
assert.equal(source.source.canonicalUrl, 'https://example.com/start');
assert.equal(source.source.hostname, 'example.com');
assert.equal(source.branding.name, 'Example Homes');
assert.deepEqual(source.branding.colors, { primary: '#123456', secondary: '#ABCDEF', text: '#112233' });
assert.equal(source.branding.logoUrl, 'https://cdn.example.com/logo.png');
assert.equal(source.branding.faviconUrl, '');
assert.equal(source.pages.length, 6);
assert.equal(source.assets.length, 20);
assert.ok(source.pages.every(page => !page.url.includes('?') && !page.url.includes('#')));
assert.ok(source.assets.every(asset => !asset.url.includes('signature')));
assert.equal(normalizeAppStudioUrlSource({ source: { canonicalUrl: 'javascript:alert(1)' } }), null);
assert.equal(normalizeAppStudioUrlSource({ source: { canonicalUrl: 'https://user:password@example.com' } }), null);
assert.equal(normalizeAppStudioUrlSource({ source: { canonicalUrl: 'http://127.0.0.1/admin' } }), null);

const prompt = buildAppStudioLinkPrompt('Create a home page', source);
assert.match(prompt, /exactly ONE single-page/i);
assert.match(prompt, /src\/pages\/Home\.html/);
assert.match(prompt, /src\/styles\.css/);
assert.match(prompt, /src\/main\.js/);
assert.match(prompt, /working in-page navigation anchors/i);
assert.match(prompt, /untrusted factual reference data/i);
assert.match(prompt, /https:\/\/example\.com\/start/);

const gateway = read('functions/api/ai/gateway.js');
assert.match(gateway, /isAppStudioLinkBuild/);
assert.match(gateway, /normalizeAppStudioUrlSource/);
assert.match(gateway, /validateOrRepairSinglePageBuild/);
assert.match(gateway, /structuredFields\.files\s*=\s*result\.files/);
const runtime = read('assets/ovyx-app-studio-link-builder.js');
assert.match(runtime, /__OVYX_URL_ANALYZER_LAST_REPORT__/);
assert.match(runtime, /OVYXAIService\.generate/);
assert.match(runtime, /appStudioLinkBuild:\s*true/);
assert.match(runtime, /renderPreview/);
assert.match(runtime, /ws-canvas-iframe/);
assert.match(runtime, /ovyx\.appstudio\.link-build/);
const middleware = read('functions/_middleware.js');
assert.match(middleware, /ovyx-app-studio-link-builder\.js/);
console.log('OVYX App Studio link-build contract tests passed: URL/data bounds, one-page contract, source safety, generator wiring and live-preview transfer.');
