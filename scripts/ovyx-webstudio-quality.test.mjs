import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtime = fs.readFileSync('assets/ovyx-webstudio-quality.js', 'utf8');
const navigationPolish = fs.readFileSync('assets/ovyx-webstudio-navigation-polish.js', 'utf8');
const projectBranding = fs.readFileSync('assets/ovyx-webstudio-project-branding.js', 'utf8');
const middleware = fs.readFileSync('functions/_middleware.js', 'utf8');
const headers = fs.readFileSync('_headers', 'utf8');
const packageJson = fs.readFileSync('package.json', 'utf8');
const appManifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const appFavicon = fs.readFileSync('assets/ovyx-app-favicon.svg', 'utf8');
const prompts = fs.readFileSync('functions/_lib/prompts.js', 'utf8');
const assistant = fs.readFileSync('functions/api/ai/assistant.js', 'utf8');

// Parsing this script does not execute it; browser behavior is exercised separately.
assert.doesNotThrow(() => new Function(runtime), 'The Web Studio quality runtime must parse as valid JavaScript.');
assert.doesNotThrow(() => new Function(navigationPolish), 'The Web Studio navigation header runtime must parse as valid JavaScript.');
assert.doesNotThrow(() => new Function(projectBranding), 'The project favicon branding runtime must parse as valid JavaScript.');
assert.ok(projectBranding.includes('async function findBrandHref(graph, project, paths, first)'), 'Favicon correction must discover the active project’s own logo in its source graph and uploaded assets.');
assert.ok(projectBranding.includes('Project graph paths are served by the generated site, not the OVYX app shell.'), 'A binary image path must not be mistaken for an image hosted on the OVYX application origin.');
assert.ok(!projectBranding.includes("return '/' + resolved.replace(/^public\\//, '');"), 'Binary project assets must resolve through project asset metadata rather than an OVYX-root-relative path.');
assert.ok(projectBranding.includes('if (!href) return false;'), 'If no project logo is found, the OVYX application browser tab is not changed.');
assert.ok(projectBranding.includes('window.OVYXAssetStore?.url'), 'Project logos stored outside the text file graph must be resolved through the asset store.');
assert.ok(projectBranding.includes('function rankedProjectLogoAssets(project, supplementalAssets)'), 'The favicon correction must consider explicitly named project logo/icon assets from the project graph and store.');
assert.ok(projectBranding.includes('async function loadProjectAssets(project)'), 'The favicon correction must query uploaded asset metadata that may not be copied into the local project object.');
assert.ok(projectBranding.includes('function sourceLogoCandidates(graph, project, supplementalAssets)'), 'Framework component imports must be searched when the logo is not present in index.html.');
assert.ok(projectBranding.includes('function livePreviewBrandCandidates(graph, project, first, supplementalAssets)'), 'The favicon resolver must inspect the live preview logo when it is absent from stored HTML.');
assert.ok(projectBranding.includes("'ovyx:preview-updated'"), 'The project favicon must be retried after the live preview changes.');
assert.ok(projectBranding.includes('function graphAssetPath(fromPath, reference, files)'), 'The favicon resolver must support common public paths and source aliases.');
assert.ok(projectBranding.includes("['ovyx:view-changed', 'ovyx:project-activated', 'ovyx:project-loaded', 'ovyx:project-saved',"), 'Project favicon correction must follow project activation and save lifecycle events.');
assert.ok(projectBranding.includes("'ovyx:webstudio-initial-site-built', 'ovyx:webstudio-quality-report',"), 'Project favicon correction must follow site-build and quality-report events.');
assert.ok(!runtime.includes('<span data-ovyx-quality-label>Quality</span>'), 'The quality panel must not create a duplicate Quality toolbar button.');
assert.ok(runtime.includes("open: function () { setOverlay(true); return true; }"), 'Code tools must be able to open the shared inspector without a header trigger.');
assert.ok(navigationPolish.includes('body.ovyx-webstudio-active.ovyx-ws-mobile-nav-open #mobile-drawer'), 'The mobile navigation drawer must cover the viewport without a 54px offset.');
assert.ok(!navigationPolish.includes('.ovyx-ws-header{visibility:hidden'), 'The Web Studio toolbar must remain visible instead of hiding its arrow and Preview controls.');
assert.ok(!navigationPolish.includes("header.style.setProperty('visibility'"), 'The navigation polish must never mutate header visibility.');
assert.ok(!navigationPolish.includes("header.inert ="), 'The navigation polish must never make the arrow and Preview toolbar inert.');
assert.ok(navigationPolish.includes('removeMobileOverlayOverrides'), 'Mobile drawer overrides must be removed when navigation closes.');
assert.ok(navigationPolish.includes("target.closest('#ovyx-desktop-sidebar-close')"), 'The existing desktop sidebar close control must also close the Web Studio drawer.');
assert.ok(navigationPolish.includes('window.__OVYX_WS_NAV_HEADER_POLISH_V4__ = true'), 'The navigation runtime must use a matching V4 idempotence guard.');
assert.ok(projectBranding.includes('window.__OVYX_WS_PROJECT_BRANDING_V11__ = true'), 'The project branding runtime must use a matching V11 idempotence guard.');
assert.ok(projectBranding.includes('ovyx-app-favicon'), 'The OVYX app favicon must never be mistaken for a project-owned logo.');
assert.ok(projectBranding.includes('function renderedCssBrandCandidates(doc, first, files)'), 'Favicon detection must inspect CSS backgrounds and pseudo-elements on brand-labelled preview nodes.');
assert.ok(projectBranding.includes('function renderedPreviewIconCandidates(doc, first, files, project, supplementalAssets)'), 'A declared favicon from the live project preview must take priority over inferred logo candidates.');
assert.ok(projectBranding.includes('fromExplicitPreviewIcon: true'), 'Explicit project favicon discovery must be marked as the highest-confidence candidate.');
assert.ok(projectBranding.includes("split(/\\s+/).filter(Boolean)"), 'Favicon rel parsing must split multi-token values like shortcut icon without a MutationObserver loop.');
assert.ok(projectBranding.includes('function renderedPreviewIconCandidates(doc, first, files, project, supplementalAssets)'), 'A declared favicon from the live project preview must be preferred to inferred logo candidates.');
assert.ok(projectBranding.includes('fromExplicitPreviewIcon: true'), 'An explicit project favicon must carry a high-confidence candidate marker.');
assert.ok(projectBranding.includes('split(/\\s+/).filter(Boolean)'), 'Favicon rel parsing must correctly split multi-token values such as shortcut icon without creating a mutation loop.');
assert.ok(!projectBranding.includes('syncTabFavicon('), 'Project logo detection must not replace the OVYX application tab favicon.');
assert.ok(!projectBranding.includes('restoreTabFavicon('), 'Project branding must not mutate/restore application favicon links.');
assert.ok(projectBranding.includes('function patchProjectGraph(context, href, paths)'), 'Project favicon changes remain scoped to generated website HTML.');

for (const token of [
  'OVYX WEB STUDIO QUALITY CONTRACT',
  "WIDTHS = [320, 390, 768, 1024, 1440]",
  "setAttribute('sandbox', 'allow-scripts')",
  "connect-src 'none'",
  "form-action 'none'",
  "img-src data: blob:",
  "media-src data: blob:",
  "restoreSnapshot(studio, snapshot)",
  'OVYX QUALITY INSPECTOR REPAIR',
  'ovyx:webstudio-build-stage',
  'Automatic build gate',
  'quality-auto-repair',
  'deferredPreviewRefresh',
  'publishVerifiedPreview',
  'Your previous verified preview remains available',
  'rejectBuildForQuality',
  'Horizontal overflow',
  'Page runtime errors',
  'function probeControls()',
  'function probeAccessibility()',
  'Page loading performance',
  'CORE_BROWSER_ROUTE_COUNT = 3',
  'ADDITIONAL_ROUTE_WIDTHS = [390, 1440]',
  'MAX_SAFE_CONTROLS_PER_ROUTE = 8',
  'interactions.skipped=Math.max',
  'Safe control interaction sampling',
  'No controls matched the inspector’s conservative safe-click criteria',
  'safeControlSampling',
  'var routePlan = []',
  'report.browser.pagesTested += 1',
  'initialRenderMs',
  'domNodes',
  'Rendered text contrast sample',
  'Visible keyboard focus indicators',
  'Safe interactive behavior smoke test',
  'payload.probeInteractions = width === 390;',
  'Live integration verification',
  'function auditAssetReference(fromPath, reference, kind)',
  'function auditAssetSrcset(fromPath, value, kind)',
  'CSS url() asset',
  'External asset reachability',
  'data-quality-export',
  'data-quality-copy-summary',
  'function shareableReport(report)',
  'function clientSummary(report)',
  'function downloadQualityReport(report)',
  'function copyClientSummary()',
  'projectIdIncluded: false',
  'sourceFileContentsIncluded: false',
]) {
  assert.ok(runtime.includes(token), 'Quality runtime is missing: ' + token);
}

assert.ok(middleware.includes('/assets/ovyx-webstudio-quality.js?v=20261021-1'), 'The quality inspector must load from the application-shell middleware.');
assert.equal((middleware.match(/\/assets\/ovyx-webstudio-quality\.js\?v=20261021-1/g) || []).length, 1, 'The quality inspector must be injected exactly once per application shell.');
assert.ok(middleware.includes('/assets/ovyx-webstudio-navigation-polish.js?v=20261021-4'), 'Navigation header behavior must load from the application shell with the updated cache key.');
assert.ok(middleware.includes('/assets/ovyx-webstudio-project-branding.js?v=20261021-11'), 'Project branding correction must load from the application shell with the refreshed V11 resolver cache key.');
assert.ok(middleware.includes(".on('link[rel]'"), 'The app shell must inspect existing favicon declarations before setting the canonical app icon.');
assert.ok(middleware.includes("if (rel.includes('icon')) element.remove();"), 'Conflicting browser-tab icon declarations must be removed before the OVYX favicon is appended.');
assert.ok(middleware.includes('<link rel="icon" type="image/svg+xml" href="/assets/ovyx-app-favicon.svg?v=20261021-1">'), 'The app shell must declare its dedicated OVYX browser-tab favicon with a fresh cache-busting URL.');
assert.ok(appFavicon.startsWith('<svg xmlns=') && appFavicon.includes('<title id="title">OVYX</title>'), 'The dedicated OVYX favicon asset must exist as a valid SVG brand mark.');
assert.ok(appManifest.icons.some(icon => icon.src === '/assets/ovyx-app-favicon.svg' && icon.type === 'image/svg+xml'), 'The app manifest must use the same dedicated OVYX favicon asset.');
assert.ok(/\/assets\/ovyx-webstudio-navigation-polish\.js\s+Cache-Control: no-store, no-cache, must-revalidate/.test(headers), 'Navigation header behavior must not be served from a stale cache.');
assert.ok(/\/assets\/ovyx-webstudio-project-branding\.js\s+Cache-Control: no-store, no-cache, must-revalidate/.test(headers), 'Project branding correction must not be served from a stale cache.');
assert.ok(headers.includes('/assets/ovyx-webstudio-quality.js\n  Cache-Control: no-store, no-cache, must-revalidate'), 'Quality inspection code must not be served from a stale cache.');
assert.equal((headers.match(/\/assets\/ovyx-webstudio-quality\.js/g) || []).length, 1, 'Quality asset cache rules must appear exactly once.');
assert.ok(packageJson.includes('scripts/ovyx-webstudio-quality.test.mjs'), 'The quality regression contract must run in npm test.');
assert.ok(prompts.includes('ART DIRECTION AND DISTINCTIVENESS'), 'The server-side Web Studio agent must receive the premium design contract.');
assert.ok(prompts.includes('project-specific favicon'), 'Web Studio must keep browser-tab icons aligned to the generated project logo.');
assert.ok(prompts.includes('Never reuse the OVYX platform splash/sidebar mark as the website favicon unless the brief explicitly requests that brand'), 'Generated websites must not inherit the OVYX platform mark as their favicon by default.');
assert.ok(prompts.includes('Make at most one bounded targeted repair pass'), 'The server-side Web Studio agent must use bounded repair passes.');
assert.ok(prompts.includes('appropriate aria-expanded, aria-controls, aria-selected or aria-pressed state'), 'Web Studio prompts must require accessible state that browser checks can exercise.');
assert.ok(prompts.includes('4.5:1 for normal text and 3:1 for large/bold text'), 'The generation contract must state readable text-contrast targets.');
assert.ok(prompts.includes('project-specific favicon'), 'Web Studio must keep browser-tab icons aligned to the generated project logo.');
assert.ok(prompts.includes('Never reuse the OVYX platform splash/sidebar mark as the website favicon unless the brief explicitly requests that brand'), 'Generated websites must not inherit the OVYX platform mark as their favicon by default.');
assert.ok(assistant.includes('qualityContract: WEB_STUDIO_EXCELLENCE'), 'The real Web Studio route must pass its premium quality contract into the multi-page builder.');
assert.ok(assistant.includes("validateOrRepairSinglePageBuild"), 'Single-page Web Studio builds must run the deterministic source/requirement checks.');
assert.ok(assistant.includes('structuredFields[key] = result[key]'), 'Unparseable or file-less single-page responses must still expose an explicit not-evaluated QA status.');
assert.ok(assistant.includes("mode === 'build' && !multiPageBuild"), 'Single-page QA must not be applied over the separately validated multi-page builder path.');
assert.ok(assistant.includes("'qualityVerification', 'siteIntegrity', 'requirementRepair'"), 'The API should surface single-page QA status in the structured response.');
assert.ok(/WEB_STUDIO_SYSTEM_PROMPT\s*\+\s*'\\n\\n'\s*\+\s*WEB_STUDIO_EXCELLENCE/.test(assistant), 'Single-page Web Studio system instructions must use real line breaks between the core prompt and the premium quality contract.');
assert.ok(/'\\n\\nEXPERIENCE INTELLIGENCE:\\n'/.test(assistant), 'The experience brief must be separated with real line breaks for the model.');
assert.ok(/'\\n\\nCLIENT STUDIO INSTRUCTIONS:\\n'/.test(assistant), 'Client studio instructions must be separated with real line breaks for the model.');
assert.ok(/'\\n\\nAuthenticated user UID: '/.test(assistant), 'The authenticated-user context must be appended using real line breaks.');
const multipage = fs.readFileSync('functions/_lib/studio-multipage.js', 'utf8');
const integrity = fs.readFileSync('functions/_lib/site-integrity.js', 'utf8');
assert.ok(multipage.includes('OVYX WEB STUDIO BOUNDED WEBSITE POLISH PHASE'), 'Multi-page builds must receive a bounded final design-polish pass.');
assert.ok(multipage.includes('selectBoundedPolishTargets'), 'Polish context must be budgeted to protect large builds and provider limits.');
assert.ok(multipage.includes('allowedPolishPaths'), 'Polish output must be restricted to an explicit file allowlist.');
assert.ok(multipage.includes('validateStagedSite(candidate, prompt, siteMap)'), 'Polished files must pass the same source and prompt-requirement checks as the baseline.');
assert.ok(multipage.includes('const baselineStaged = staged.map(item => ({ ...item }));'), 'A valid baseline must be retained so a failed polish cannot destroy a good build.');
assert.ok(multipage.includes('auditWebsiteIntegrity(outputFilesByPath, siteMap)'), 'Multi-page builds must audit internal routes and local assets before accepting a polish result.');
assert.ok(multipage.includes('hasNewIntegrityFindings(integrityBefore, candidateChecks.integrity)'), 'A polish result must not introduce new source-level link or asset defects.');
assert.ok(multipage.includes('integrityPreferredPaths'), 'Files with integrity findings must be prioritized for the bounded repair pass.');
assert.ok(multipage.includes('External resource availability and live integrations were not verified by this static audit.'), 'The build summary must clearly separate static integrity checks from live verification.');
assert.ok(integrity.includes('INTERNAL_ROUTE_UNMAPPED'), 'The integrity audit must detect links outside the approved page route manifest.');
assert.ok(integrity.includes('LOCAL_CSS_ASSET_MISSING'), 'The integrity audit must detect missing CSS assets.');
assert.ok(integrity.includes('LOCAL_SRCSET_ASSET_MISSING'), 'The integrity audit must detect missing responsive-image srcset assets.');
assert.ok(integrity.includes('IMAGE_ALT_MISSING'), 'The integrity audit must detect images that omit an alt attribute.');
assert.ok(integrity.includes('DUPLICATE_HTML_ID'), 'The integrity audit must detect duplicate HTML ids.');
assert.ok(integrity.includes('FORM_CONTROL_LABEL_MISSING'), 'The integrity audit must detect form controls without detectable labels.');
assert.ok(integrity.includes('LABEL_TARGET_MISSING'), 'The integrity audit must detect labels that point to missing controls.');
assert.ok(integrity.includes('ARIA_REFERENCE_TARGET_MISSING'), 'The integrity audit must detect missing source targets for aria-labelledby/describedby references.');
assert.ok(integrity.includes('ORPHAN_FRAGMENT'), 'The integrity audit must detect broken same-page anchors.');
assert.ok(integrity.includes('BROKEN_ROUTE_FRAGMENT'), 'The source integrity audit must detect anchors that point to missing ids on another page.');
assert.ok(runtime.includes('label references a missing control id'), 'The browser source audit must detect labels pointing to missing form controls.');
assert.ok(runtime.includes("attributeName + ' references a missing id.'"), 'The browser source audit must detect unresolved aria-labelledby and aria-describedby references.');

assert.ok(integrity.includes('runtimeBehaviorVerified: false'), 'Static checks must not be presented as proof that runtime behavior works.');
assert.ok(prompts.includes('visible :focus/:focus-visible indicators'), 'The generation contract must require visible keyboard focus cues.');
assert.ok(prompts.includes('1,800 rendered elements per route'), 'The generation contract must provide a concrete DOM-size budget.');
assert.ok(!runtime.includes('MAX_BROWSER_PAGES'), 'Responsive browser smoke checks must not silently exclude routes past a fixed route cap.');
assert.ok(runtime.includes('ovyx-webstudio-qa-'), 'The inspector must name exported QA reports with a recognizable prefix.');
assert.ok(runtime.includes('getClientSummary: function ()'), 'The quality runtime must expose its client summary for review and integration.');
assert.ok(runtime.includes('No missing or unresolved local asset references were found.'), 'The inspector must report local image/media/font/CSS URL reference validation.');
assert.ok(runtime.includes('Their availability, licensing, latency and rendering were not verified'), 'The inspector must not claim external assets were tested when network access is blocked.');
assert.ok(!runtime.includes('runBuildAgent(prompt, false'), 'Quality repairs must not start an unbounded normal build loop.');

console.log('Web Studio quality contracts passed: build prompt, real source/browser checks, safe sandbox, and snapshot-protected repair.');
