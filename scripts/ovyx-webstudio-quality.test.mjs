import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtime = fs.readFileSync('assets/ovyx-webstudio-quality.js', 'utf8');
const navigationPolish = fs.readFileSync('assets/ovyx-webstudio-navigation-polish.js', 'utf8');
const projectBranding = fs.readFileSync('assets/ovyx-webstudio-project-branding.js', 'utf8');
const middleware = fs.readFileSync('functions/_middleware.js', 'utf8');
const headers = fs.readFileSync('_headers', 'utf8');
const packageJson = fs.readFileSync('package.json', 'utf8');
const appManifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const brandMark = fs.readFileSync('assets/ovyx-brand-mark.svg', 'utf8');
const prompts = fs.readFileSync('functions/_lib/prompts.js', 'utf8');
const assistant = fs.readFileSync('functions/api/ai/assistant.js', 'utf8');
const appShell = fs.readFileSync('index.html', 'utf8');

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
  'Editorial copy and placeholder text',
  'copyIssues',
  'lorem\\s+ipsum',
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
assert.ok(middleware.includes(".on('link[rel]'"), 'The app shell must inspect existing favicon declarations before setting the app-shell icon.');
assert.ok(middleware.includes("if (rel.includes('icon')) element.remove();"), 'Stale or competing browser-tab icon declarations must be removed before the brand mark is inserted.');
assert.ok(middleware.includes('href="/ovyx-tab-v7.svg?v=20261022-7">'), 'The app shell must use the versioned real OVYX brand-mark SVG as its browser-tab favicon.');
assert.ok(middleware.includes("element.prepend('<link rel="), 'The brand-mark favicon must be installed in the document head.');
assert.ok(middleware.includes('/assets/ovyx-shell-favicon-lock.js?v=20261021-3'), 'A dedicated shell favicon lock must be installed synchronously in the head before application scripts run.');
assert.ok(middleware.includes("url.pathname.toLowerCase().endsWith('/favicon.ico')"), 'The browser implicit favicon route must serve the real OVYX mark instead of any legacy icon file.');
assert.ok(middleware.includes("url.pathname === '/ovyx-tab-v7.svg'"), 'The favicon lock must use a fresh unique SVG route to avoid stale Chrome favicon cache entries.');
assert.ok(middleware.includes("ovyx-webstudio-cancel-safety.js?v=20261022-2"), 'The shell must load the browser-persistent rollback runtime version.');

assert.ok(middleware.includes("if (!contentType.includes('text/html')) return response;"), 'The favicon and application shell protections must run on HTML reloads beyond the root path.');
assert.ok(!middleware.includes("url.pathname !== '/' && url.pathname !== '/index.html'"), 'Nested app routes must not bypass favicon replacement and cache protection.');
assert.ok(middleware.includes("headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')"), 'The rewritten application shell must not restore a cached obsolete favicon reference.');
assert.ok(!middleware.includes('ovyx-app-favicon-guard.js'), 'The global favicon-enforcement script must no longer load.');
assert.ok(!headers.includes('/assets/ovyx-app-favicon-guard.js'), 'The removed favicon-enforcement script must not have a cache rule.');
assert.ok(headers.includes('/assets/ovyx-brand-mark.svg\n  Cache-Control: no-store, no-cache, must-revalidate'), 'The real brand-mark favicon must not be served stale from cache.');
assert.ok(headers.includes('/assets/ovyx-shell-favicon-lock.js\n  Cache-Control: no-store, no-cache, must-revalidate'), 'The shell favicon lock must not be served stale from cache.');
assert.ok(headers.includes('/manifest.json\n  Cache-Control: no-store, no-cache, must-revalidate'), 'The app manifest must not be served stale from cache.');
assert.ok(brandMark.startsWith('<svg xmlns=') && brandMark.includes('<title id="title">OVYX</title>'), 'The real OVYX brand-mark asset must exist as a valid SVG logo.');
assert.ok(appManifest.icons.some(icon => icon.src === '/assets/ovyx-brand-mark.svg' && icon.type === 'image/svg+xml'), 'The app manifest must use the real OVYX brand-mark asset.');
assert.ok(/\/assets\/ovyx-webstudio-navigation-polish\.js\s+Cache-Control: no-store, no-cache, must-revalidate/.test(headers), 'Navigation header behavior must not be served from a stale cache.');
assert.ok(/\/assets\/ovyx-webstudio-project-branding\.js\s+Cache-Control: no-store, no-cache, must-revalidate/.test(headers), 'Project branding correction must not be served from a stale cache.');
assert.ok(headers.includes('/assets/ovyx-webstudio-quality.js\n  Cache-Control: no-store, no-cache, must-revalidate'), 'Quality inspection code must not be served from a stale cache.');
assert.equal((headers.match(/\/assets\/ovyx-webstudio-quality\.js/g) || []).length, 1, 'Quality asset cache rules must appear exactly once.');
assert.ok(packageJson.includes('scripts/ovyx-webstudio-quality.test.mjs'), 'The quality regression contract must run in npm test.');
assert.ok(prompts.includes('ART DIRECTION AND DISTINCTIVENESS'), 'The server-side Web Studio agent must receive the premium design contract.');
assert.ok(prompts.includes('EDITORIAL COPY AND TYPOGRAPHY QUALITY GATE'), 'Web Studio must enforce mature, proofread copy across generated pages.');
assert.ok(prompts.includes('Remove awkward phrasing, AI-sounding filler'), 'Web Studio must explicitly reject generic or immature generated copy.');
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
assert.ok(multipage.includes('validateStagedSite(candidate, prompt, siteMap, explicitPagesForReconciliation)'), 'Polished files must pass the same source and prompt-requirement checks, using the unchanged user manifest or the isolated smoke manifest.');
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

// Regression contract for the reported desktop Code Workspace click-blocker and mobile preview backdrop.
const workspaceParityStart = appShell.indexOf('<style id="ovyx-code-workspace-interaction-preview-parity">');
assert.ok(workspaceParityStart >= 0, 'The targeted Code Workspace/mobile-preview fix must be present in the application shell.');
const workspaceParityEnd = appShell.indexOf('</style>', workspaceParityStart);
assert.ok(workspaceParityEnd > workspaceParityStart, 'The targeted interaction stylesheet must be closed.');
const workspaceParity = appShell.slice(workspaceParityStart, workspaceParityEnd);
assert.ok(workspaceParity.includes('#view-webstudio[data-ws-code-open="1"] #ws-desktop-split-toggle'), 'The split control must be scoped to the Code Workspace-open state.');
assert.ok(workspaceParity.includes('display: none !important;'), 'The split arrow must not appear over the code editor.');
assert.ok(workspaceParity.includes('pointer-events: none !important;'), 'The split arrow must not intercept code-editor clicks.');
assert.ok(workspaceParity.includes('#ws-code-workspace-host .monaco-editor .overflow-guard'), 'Monaco editing layers must retain pointer input.');
assert.ok(workspaceParity.includes('#ws-code-workspace-host #ovyx-fallback-editor'), 'The fallback textarea must retain pointer input.');
assert.ok(workspaceParity.includes('background-color: var(--app-bg, #050607) !important;'), 'The mobile preview backdrop must use the shared canvas theme background.');
assert.ok(workspaceParity.includes('linear-gradient(var(--app-border, #1B222A) 1px, transparent 1px)'), 'Mobile and desktop preview backdrops must share the canvas grid/border token.');
assert.ok(appShell.includes("const frames=[document.getElementById('ws-canvas-iframe'),document.getElementById('ws-mobile-preview-frame')].filter(Boolean)"), 'Desktop and mobile preview frames must both be included in preview refresh.');
assert.ok(appShell.includes('frames.forEach(frame=>this.setPreviewFrameDocument(frame,srcdoc))'), 'Desktop and mobile preview frames must receive the same generated page document.');
// Regression contract: the desktop editor may not hang forever if Monaco's CDN/AMD callback stalls.
const monacoMethodStart = appShell.indexOf('async loadMonacoForCode(){');
const monacoMethodEnd = appShell.indexOf('saveCodeFile(file){', monacoMethodStart);
assert.ok(monacoMethodStart >= 0 && monacoMethodEnd > monacoMethodStart, 'The production Code Workspace loader/editor methods must exist.');
const monacoMethod = appShell.slice(monacoMethodStart, monacoMethodEnd);
assert.ok(monacoMethod.includes("4200,'Monaco loader'"), 'Desktop Monaco loader requests must have a bounded timeout.');
assert.ok(monacoMethod.includes("6500,'Monaco editor module'"), 'Desktop Monaco module initialization must have a bounded timeout.');
assert.ok(monacoMethod.includes('using the editable fallback'), 'A stalled Monaco load must resolve into an editable textarea.');
assert.ok(monacoMethod.includes("fallback.style.setProperty('pointer-events','auto','important')"), 'Fallback editing must always accept pointer input.');
assert.ok(monacoMethod.includes("fallback.style.setProperty('width','100%','important')"), 'Fallback editor must fill the available editor width.');
assert.ok(appShell.includes('id="ovyx-code-dashboard-route-recovery-v1"'), 'The production shell must include route-safe dashboard recovery.');
const dashboardRecoveryStart = appShell.indexOf('<script id="ovyx-code-dashboard-route-recovery-v1">');
const dashboardRecoveryEnd = appShell.indexOf('</script>', dashboardRecoveryStart);
assert.ok(dashboardRecoveryStart >= 0 && dashboardRecoveryEnd > dashboardRecoveryStart, 'Dashboard recovery script boundaries must be valid.');
const dashboardRecoverySource = appShell.slice(dashboardRecoveryStart + '<script id="ovyx-code-dashboard-route-recovery-v1">'.length, dashboardRecoveryEnd);
assert.doesNotThrow(() => new Function(dashboardRecoverySource), 'Dashboard recovery runtime must parse as JavaScript.');
assert.ok(dashboardRecoverySource.includes("if(normalize(view)==='home')scheduleHomeReconcile()"), 'Navigating Home must trigger drawer/overlay recovery.');
assert.ok(dashboardRecoverySource.includes("document.body.style.removeProperty('overflow')"), 'A stale dashboard scroll lock must be released when no real modal remains.');
console.log('Web Studio quality contracts passed: build prompt, real source/browser checks, safe sandbox, and snapshot-protected repair.');
