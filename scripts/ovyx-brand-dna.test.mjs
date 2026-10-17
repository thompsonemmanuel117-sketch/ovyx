import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeBrandDNA, buildBrandDNAInstructions, applyBrandDNAToHtml, applyBrandDNAToGeneratedOutput, brandContrastRatio } from '../functions/_lib/brand-dna.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const gateway = read('functions/api/ai/gateway.js');
const mobileBuild = read('functions/api/mobile/build.js');
const packageJson = JSON.parse(read('package.json'));

const logoDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/g6sAAAAASUVORK5CYII=';
const profile = {
  logoDataUrl,
  colors: {
    primaryColor: '#D81B60',
    secondaryColor: '#302060',
    accentColor: '#00A6A6',
    backgroundColor: '#FFF9FC',
    textColor: '#17121A',
    mutedText: '#5D4B56'
  },
  layoutRules: ['Keep a generous clear space around the logo.', 'Use rounded cards and quiet dividers.'],
  version: 4
};
const dna = normalizeBrandDNA(profile, { appName: 'Velora Homes' });
assert.equal(dna.active, true, 'An explicit logo/palette must enable Brand DNA.');
assert.equal(dna.hasLogo, true, 'The full-colour PNG asset must be preserved.');
assert.equal(dna.logoDataUrl, logoDataUrl, 'The source logo data URL must not be recoloured or rewritten.');
assert.equal(dna.palette.primary, '#D81B60');
assert.equal(dna.palette.secondary, '#302060');
assert.equal(dna.palette.accent, '#00A6A6');
assert.ok(brandContrastRatio(dna.palette.onPrimary, dna.palette.primary) >= 4.5, 'Primary controls must pick a WCAG-readable foreground.');
assert.ok(brandContrastRatio(dna.palette.link, dna.palette.background) >= 4.5, 'Links must use a readable variant when a background color is configured.');

const html = '<!doctype html><html><head><meta charset="utf-8"><title>Velora Homes</title></head><body><header><a href="/" aria-label="home"><img class="brand-logo" src="/old-logo.svg" alt="Old logo"><span>Velora</span></a><nav><a href="/properties">Properties</a></nav></header><main><img class="hero-photo" src="/media/property.jpg" alt="Modern house"><button class="btn-primary" type="submit">Request a viewing</button><p>Find your next home.</p></main></body></html>';
const brandedHtml = applyBrandDNAToHtml(html, dna, { appName: 'Velora Homes' });
assert.ok(brandedHtml.includes(logoDataUrl), 'Generated HTML must display the original full-colour uploaded logo.');
assert.ok(brandedHtml.includes('data-ovyx-brand-logo="true"'), 'The injected logo must be marked for reliable repeat application.');
assert.ok(brandedHtml.includes('--ovyx-brand-primary:#D81B60'), 'The HTML page must carry the app primary token.');
assert.ok(brandedHtml.includes('--ovyx-brand-background:#FFF9FC'), 'The HTML page must carry its own configured background.');
assert.ok(brandedHtml.includes('rel="icon" type="image/svg+xml"'), 'The page must contain a branded SVG favicon.');
assert.ok(brandedHtml.includes('rel="apple-touch-icon"'), 'The page must expose an app icon for touch devices.');
assert.ok(brandedHtml.includes('src="/media/property.jpg"'), 'Ordinary content photos must not be mistaken for the brand logo.');
assert.ok(brandedHtml.indexOf('id="ovyx-brand-dna"') < brandedHtml.indexOf('</head>'), 'Brand tokens must be installed in the document head.');
assert.equal((brandedHtml.match(/id="ovyx-brand-dna"/g) || []).length, 1, 'A single application pass must inject one token block.');

const secondPage = '<!doctype html><html><head><title>Velora Homes Properties</title></head><body><header><nav>Properties</nav></header><main><h1>Available homes</h1></main></body></html>';
const output = {
  project: { name: 'Velora Homes' },
  files: {
    'index.html': html,
    'src/pages/Properties.html': secondPage,
    'src/styles.css': '.property-card { border-radius: 16px; }'
  }
};
const transformed = applyBrandDNAToGeneratedOutput(JSON.stringify(output), dna, { appName: 'Velora Homes' });
const app = JSON.parse(transformed);
assert.ok(app.files['index.html'].includes(logoDataUrl), 'The generated home page must carry the real uploaded logo.');
assert.ok(app.files['src/pages/Properties.html'].includes(logoDataUrl), 'Each generated HTML screen must carry the real logo.');
assert.ok(app.files['src/pages/Properties.html'].includes('ovyx-brand-lockup'), 'Pages without a detected logo slot must receive a branded header lockup.');
assert.ok(app.files['src/styles.css'].includes('--ovyx-brand-primary:#D81B60'), 'Shared app styles must receive the same theme tokens.');
assert.ok(app.files['public/brand/app-icon.svg'].content.includes('<svg'), 'A usable SVG app-icon asset must be emitted.');
assert.ok(app.files['public/brand/app-icon.svg'].content.includes('#D81B60'), 'The app icon must use the requested brand palette.');
const manifest = JSON.parse(app.files['public/brand/brand-manifest.json'].content);
assert.equal(manifest.name, 'Velora Homes');
assert.equal(manifest.theme_color, '#D81B60');
assert.equal(manifest.icons[0].src, '/brand/app-icon.svg');

const secondDNA = normalizeBrandDNA({
  colors: { primaryColor: '#1769AA', secondaryColor: '#F9A826' },
  logoDataUrl: 'data:image/png;base64,AA=='
}, { appName: 'Nova Health' });
const secondHtml = applyBrandDNAToHtml(secondPage, secondDNA, { appName: 'Nova Health' });
assert.ok(secondHtml.includes('--ovyx-brand-primary:#1769AA'), 'A second app must keep its own request-scoped palette.');
assert.ok(!secondHtml.includes('--ovyx-brand-primary:#D81B60'), 'One app must never inherit another app request palette.');

const responseText = 'I can help plan the app. Before code generation, tell me which sign-in provider you use.';
assert.equal(applyBrandDNAToGeneratedOutput(responseText, dna), responseText, 'Brand enforcement must not inject HTML into ordinary conversation text.');
const unbranded = normalizeBrandDNA(null, { appName: 'Nova Health' });
assert.equal(unbranded.active, false, 'No saved logo or configured colors must not silently activate a global theme.');
assert.ok(buildBrandDNAInstructions(unbranded).includes('distinctive visual identity'), 'Apps without an uploaded logo still need a unique identity, not the OVYX studio theme.');

assert.ok(gateway.includes("payload.context?.appBrand") && gateway.includes("payload.context?.brandDNA") && gateway.includes("payload.context?.brandConfig"), 'Request-level brand identity must override the saved default.');
assert.ok(gateway.includes("(isAppStudio || (isWebStudio && mode === 'build'))"), 'App Studio must resolve saved Brand Identity settings automatically.');
assert.ok(gateway.includes("['users', userEmail, 'brand_profile', 'config']"), 'The profile lookup must use the canonical Firestore path.');
assert.ok(gateway.includes('applyBrandDNAToGeneratedOutput'), 'App Studio HTML/file outputs must be branded after generation.');
assert.ok(gateway.includes('brandDNA: isAppStudio ? brandDNAClientSummary(brandDNA) : null'), 'The response must expose the resolved, non-secret brand status.');
assert.ok(mobileBuild.includes("['users', userEmail, 'brand_profile', 'config']"), 'The mobile build handoff must continue to carry the canonical saved brand profile.');
assert.ok(packageJson.scripts.test.startsWith('node scripts/ovyx-brand-dna.test.mjs && '), 'Brand DNA regression must run in the normal test pipeline.');

console.log('OVYX App Studio Brand DNA: logo, per-app palette, multi-page tokens, app icon, manifest and contrast checks passed.');
