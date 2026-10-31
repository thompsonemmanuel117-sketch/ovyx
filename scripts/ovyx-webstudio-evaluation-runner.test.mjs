import assert from 'node:assert/strict';
import { evaluateSiteFiles } from './ovyx-webstudio-evaluation-runner.mjs';
import fs from 'node:fs';
import path from 'node:path';

const suite = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/ovyx-webstudio-evaluation-cases.json'), 'utf8'));
const category = suite.siteCategories.find(item => item.id === 'agency');
assert.ok(category, 'An evaluation category must be available.');

const goodFiles = {
  'index.html': '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Northstar Studio</title><meta name="description" content="Independent creative studio."><meta property="og:title" content="Northstar Studio"><link rel="stylesheet" href="assets/site.css"></head><body><nav aria-label="Main"><a href="/about/">About the studio</a><a href="/about/#team">Meet the team</a><a href="#approach">Our approach</a></nav><main><h1>Ideas made tangible</h1><section id="approach"><p>We create digital experiences with care.</p><img src="assets/mark.svg" srcset="assets/mark.svg 1x" alt="Northstar Studio mark"><a href="/about/">Meet the studio</a></section></main></body></html>',
  'about/index.html': '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>About Northstar Studio</title><meta name="description" content="Learn about Northstar Studio."><meta property="og:title" content="About Northstar Studio"><link rel="stylesheet" href="../assets/site.css"></head><body><nav aria-label="Main"><a href="/">Home</a></nav><main><h1>About the studio</h1><section id="team"><p>A small team building considered products.</p></section></main></body></html>',
  'assets/site.css': 'html{font-family:system-ui,sans-serif}body{margin:0;color:#111;background:#fff}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}',
  'assets/mark.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>',
};
const good = evaluateSiteFiles(goodFiles, category);
assert.equal(good.status, 'pass', JSON.stringify(good.findings));
assert.equal(good.counts.htmlPages, 2);
assert.ok(good.technicalReadinessScore >= 95);
assert.equal(good.qualityScoreV2.version, 2);
assert.equal(good.qualityScoreV2.evidenceCoveragePercent, 100);
assert.ok(good.qualityScoreV2.overallScore >= 80);
assert.ok(good.qualityScoreV2.dimensions.design.score >= 0);
assert.ok(good.qualityScoreV2.dimensions.functionality.score >= 0);
assert.ok(good.qualityScoreV2.dimensions.accessibility.score >= 0);
assert.ok(good.qualityScoreV2.dimensions.performance.score >= 0);
assert.equal(good.qualityScoreV2.releaseDecision.certifiedProductionReady, false);
assert.equal(good.qualityScoreV2.releaseDecision.browserBehaviorVerificationRequired, true);
assert.equal(good.qualityScoreV2.releaseDecision.liveIntegrationVerificationRequired, true);
assert.equal(good.performanceEvidence.runtimeMeasurements.coreWebVitalsMeasured, false);
assert.equal(good.deploymentIntelligence.framework.name, 'Static HTML/CSS/JavaScript');
assert.equal(good.deploymentIntelligence.runtimeProfile, 'static-site');
assert.equal(good.deploymentIntelligence.staticOnlyCompatible, true);
assert.equal(good.productionReadiness.readyForProduction, false);
assert.equal(good.productionReadiness.gates.browserAcceptance, 'not-verified');
assert.ok(good.integrationReadiness.every(item => item.verified === false));


assert.equal(good.qualityScoreV2.dimensionAssessmentCoveragePercent, 100);
assert.match(good.qualityScoreV2.coverageDefinition, /not requirement coverage/i);
assert.equal(good.qualityScoreV2.functionalRequirementEvidence.missingSourceEvidenceCount, 4);
assert.equal(good.qualityScoreV2.releaseDecision.automatedSourceGate, 'fail');
assert.equal(good.productionReadiness.gates.sourceValidation, 'needs-attention');
assert.equal(good.functionalAcceptance.find(item => item.requirement === 'contact validation').assessment, 'missing-source-evidence');

const unassessedRequirement = evaluateSiteFiles(goodFiles, {
  ...category, mustExercise: ['a third-party live itinerary sync with supplier confirmation'],
});
assert.equal(unassessedRequirement.qualityScoreV2.functionalRequirementEvidence.notAssessableCount, 1);
assert.equal(unassessedRequirement.qualityScoreV2.releaseDecision.automatedSourceGate, 'needs-review');
assert.equal(unassessedRequirement.productionReadiness.gates.sourceValidation, 'needs-review');

const mappedRequirementsPresent = evaluateSiteFiles(richFiles, {
  ...category, mustExercise: ['service page', 'case-study navigation'], integrationTruth: [],
});
assert.equal(mappedRequirementsPresent.qualityScoreV2.releaseDecision.automatedSourceGate, 'no-static-blockers');
assert.equal(mappedRequirementsPresent.qualityScoreV2.releaseDecision.missingRequirementEvidenceCount, 0);

const monorepo = evaluateSiteFiles({
  'apps/web/package.json': JSON.stringify({ name: 'web-app', dependencies: { vite: 'latest' }, scripts: { build: 'vite build' } }),
  'package-lock.json': '{}',
  'package.json': JSON.stringify({ name: 'workspace-root', scripts: { build: 'npm run build --workspace apps/web' }, dependencies: { next: 'latest', react: 'latest' }, workspaces: ['apps/*'] }),
  'apps/api/package.json': JSON.stringify({ name: 'api-app', dependencies: { fastify: 'latest', stripe: 'latest' } }),
  'apps/web/next.config.js': 'module.exports = {};',
  'apps/web/app/page.tsx': 'export default function Page(){return <main><h1>Web</h1></main>}',
}, { ...category, mustExercise: [], integrationTruth: [] });
assert.equal(monorepo.deploymentIntelligence.framework.name, 'Next.js');
assert.equal(monorepo.deploymentIntelligence.framework.packageName, 'workspace-root');
assert.equal(monorepo.deploymentIntelligence.framework.packageManifestCount, 3);
assert.equal(monorepo.deploymentIntelligence.packageScripts.buildCommand, 'npm run build --workspace apps/web');
assert.equal(monorepo.deploymentIntelligence.packageManager, 'npm');
assert.ok(monorepo.deploymentIntelligence.detectedIntegrations.some(item => item.capability === 'payments'));

const ambiguousWorkspace = evaluateSiteFiles({
  'apps/web/package.json': JSON.stringify({ dependencies: { next: 'latest' } }),
  'apps/admin/package.json': JSON.stringify({ dependencies: { vite: 'latest' } }),
  'apps/web/index.html': '<html lang="en"><head><title>Web</title></head><body><main><h1>Web</h1></main></body></html>',
}, { ...category, mustExercise: [], integrationTruth: [] });
assert.equal(ambiguousWorkspace.deploymentIntelligence.framework.packageManifestAmbiguous, true);
assert.equal(ambiguousWorkspace.deploymentIntelligence.framework.name, 'Unknown');
assert.equal(ambiguousWorkspace.deploymentIntelligence.packageManager, 'workspace-root-ambiguous');
assert.equal(ambiguousWorkspace.productionReadiness.gates.hostingCompatibility, 'ambiguous-workspace');

const remix = evaluateSiteFiles({
  'package.json': JSON.stringify({ name: 'remix-app', dependencies: { '@remix-run/react': 'latest', '@remix-run/dev': 'latest' }, scripts: { build: 'remix vite:build' } }),
  'app/routes/_index.tsx': 'export default function Index(){return <main><h1>Remix</h1></main>}',
}, { ...category, mustExercise: [], integrationTruth: [] });
assert.equal(remix.deploymentIntelligence.framework.name, 'Remix');
assert.equal(remix.deploymentIntelligence.requiresServerRuntime, true);
assert.equal(remix.deploymentIntelligence.runtimeProfile, 'full-stack-server-runtime');

const fullStackCategory = {
  ...category,
  integrationTruth: ['Real payment provider checkout', 'Persistent database records', 'Real email delivery'],
};
const fullStack = evaluateSiteFiles({
  'package.json': JSON.stringify({
    name: 'northstar-platform',
    scripts: { build: 'next build', start: 'next start' },
    dependencies: { next: 'latest', react: 'latest', 'react-dom': 'latest', prisma: 'latest', stripe: 'latest' },
  }),
  'app/page.tsx': 'export default function Page(){return <main><h1>Northstar</h1></main>}',
  'app/api/checkout/route.ts': 'export async function POST(){ return Response.json({ status: "pending" }); }',
  'prisma/schema.prisma': 'datasource db { provider = "postgresql" }',
}, fullStackCategory);
assert.equal(fullStack.deploymentIntelligence.framework.name, 'Next.js');
assert.equal(fullStack.deploymentIntelligence.runtimeProfile, 'full-stack-server-runtime');
assert.equal(fullStack.deploymentIntelligence.staticOnlyCompatible, false);
assert.equal(fullStack.deploymentIntelligence.packageScripts.buildDetected, true);
assert.ok(fullStack.deploymentIntelligence.detectedIntegrations.some(item => item.capability === 'payments'));
assert.equal(fullStack.integrationReadiness[0].sourceReference, 'detected');
assert.equal(fullStack.integrationReadiness[0].verified, false);
assert.equal(fullStack.productionReadiness.readyForProduction, false);
assert.ok(good.functionalAcceptance.length > 0);
assert.ok(good.functionalAcceptance.every(item => ['source-evidence-present-behavior-unverified', 'no-matching-static-evidence'].includes(item.status)));
assert.ok(good.functionalAcceptance.every(item => item.browserBehaviorVerified === false && item.integrationVerified === false));
assert.ok(good.functionalAcceptance.some(item => item.requirement === 'responsive editorial layout' && item.status === 'source-evidence-present-behavior-unverified'));
assert.ok(good.functionalAcceptance.some(item => item.requirement === 'contact validation' && item.status === 'no-matching-static-evidence'));
assert.equal(good.designEvidence.visualOriginalityVerified, false);
assert.ok(good.designEvidence.signalCountAvailable >= 7);
assert.equal(good.designEvidence.signals.categorySpecificDirection.status, 'source-evidence-present');
assert.ok(good.integrationTruth.every(item => item.status.includes('unverified')));
assert.equal(good.counts.fragmentLinks, 2, 'Valid same-page and cross-page fragment links should be counted.');
assert.equal(good.counts.srcsetCandidates, 1, 'Responsive image candidates should be counted.');
assert.ok(!good.findings.some(item => ['ORPHAN_FRAGMENT', 'BROKEN_ROUTE_FRAGMENT', 'IMAGE_SRCSET_UNRESOLVED'].includes(item.code)));

const routeAssetFailures = evaluateSiteFiles({
  ...goodFiles,
  'index.html': goodFiles['index.html']
    .replace('href="/about/#team"', 'href="/about/#missing-team"')
    .replace('href="#approach"', 'href="#missing-approach"')
    .replace('srcset="assets/mark.svg 1x"', 'srcset="assets/missing-2x.webp 2x"'),
}, category);
assert.ok(routeAssetFailures.findings.some(item => item.code === 'BROKEN_ROUTE_FRAGMENT'), 'The evaluator must find broken fragments targeting known pages.');
assert.ok(routeAssetFailures.findings.some(item => item.code === 'ORPHAN_FRAGMENT'), 'The evaluator must find broken same-page fragments.');
assert.ok(routeAssetFailures.findings.some(item => item.code === 'IMAGE_SRCSET_UNRESOLVED'), 'The evaluator must find missing responsive-image candidates.');

const accessibleReferenceFailures = evaluateSiteFiles({
  ...goodFiles,
  'index.html': goodFiles['index.html'].replace(
    '</main>',
    '<label for="missing-email-control">Email</label><input id="unlabelled-email" name="email"><button aria-labelledby="missing-button-name">Save</button><p aria-describedby="missing-help-copy">Help text</p></main>',
  ),
}, category);
assert.ok(accessibleReferenceFailures.findings.some(item => item.code === 'LABEL_TARGET_MISSING'), 'The evaluator must detect labels that target absent controls.');
assert.ok(accessibleReferenceFailures.findings.some(item => item.code === 'ARIA_REFERENCE_TARGET_MISSING'), 'The evaluator must detect aria-labelledby/aria-describedby references with missing ids.');
assert.ok(accessibleReferenceFailures.findings.some(item => item.code === 'FORM_CONTROL_LABEL_MISSING'), 'A missing aria-labelledby target must not count as a valid form control label.');

const dataSrcset = evaluateSiteFiles({
  ...goodFiles,
  'index.html': goodFiles['index.html'].replace('srcset="assets/mark.svg 1x"', 'srcset="data:image/svg+xml,%3Csvg%3E 1x"'),
}, category);
assert.ok(!dataSrcset.findings.some(item => item.code === 'IMAGE_SRCSET_UNRESOLVED'), 'Data URLs must not create false responsive-image findings.');


const richFiles = {
  ...goodFiles,
  'index.html': '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Northstar Studio</title><meta name="description" content="Independent creative studio."><meta property="og:title" content="Northstar Studio"><link rel="stylesheet" href="assets/site.css"></head><body><nav><a href="/work/">Selected work</a><a href="/services/">Services</a></nav><main><h1>Ideas made tangible</h1><section id="approach"><p>We create digital experiences with care.</p><img src="assets/mark.svg" srcset="assets/mark.svg 1x" alt="Northstar Studio mark"><a href="/work/project-one/">Read case study</a><button type="button">Contact our team</button></section></main></body></html>',
  'assets/site.css': ':root{--ink:#111;--paper:#fff;--space:1rem;--radius:1rem}body{font-family:Inter,sans-serif;color:var(--ink)}h1{font-family:Georgia,serif;font-size:clamp(2rem,5vw,5rem)}main{display:grid;grid-template-columns:1fr 1fr;gap:2rem}.visual{aspect-ratio:4/3;object-position:center}@media(max-width:800px){main{display:flex;flex-direction:column}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}',
  'work/project-one/index.html': '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Project One</title><meta name="description" content="A selected case study."></head><body><nav><a href="/">Home</a></nav><main><h1>Project One</h1><p>Our work and process.</p></main></body></html>',
};
const rich = evaluateSiteFiles(richFiles, category);
assert.equal(rich.designEvidence.signals.designSystemTokens.status, 'present');
assert.equal(rich.designEvidence.signals.fluidTypography.status, 'present');
assert.equal(rich.designEvidence.signals.layoutComposition.status, 'present');
assert.equal(rich.designEvidence.signals.responsiveBreakpoints.status, 'present');
assert.equal(rich.designEvidence.signals.reducedMotionSupport.status, 'present');
assert.equal(rich.designEvidence.signals.categorySpecificDirection.status, 'source-evidence-present');
assert.ok(rich.functionalAcceptance.some(item => item.requirement === 'case-study navigation' && item.status === 'source-evidence-present-behavior-unverified'));
assert.ok(rich.functionalAcceptance.every(item => item.browserBehaviorVerified === false));

const secret = 'sk-abcdefghijklmnopqrstuvwxyz123456';
const badFiles = {
  'index.html': '<html><body><h1>Replace this with your company name</h1><a href="#">Click</a><img src="missing.png"><script src="missing.js"></script><main></main></body></html>',
  'app.js': 'const apiKey = "' + secret + '";',
};
const bad = evaluateSiteFiles(badFiles, category);
assert.equal(bad.status, 'needs-attention');
assert.ok(bad.qualityScoreV2.overallScore < good.qualityScoreV2.overallScore,
  'The v2 quality score must penalize structural, content and security defects.');
assert.equal(bad.qualityScoreV2.releaseDecision.automatedSourceGate, 'fail');
assert.ok(bad.findings.some(item => item.code === 'PLACEHOLDER_COPY'));
assert.ok(bad.findings.some(item => item.code === 'CLIENT_SECRET_PATTERN'));
assert.ok(bad.findings.some(item => item.code === 'PLACEHOLDER_LINK'));
assert.ok(bad.findings.every(item => !item.message.includes(secret)), 'Reports must not echo secret values.');
assert.ok(bad.findings.some(item => item.code === 'SCRIPT_UNRESOLVED'));

const securityReview = evaluateSiteFiles({
  'index.html': '<!doctype html><html lang="en"><head><title>Security review</title><script src="https://cdn.example.test/library.js"></script><script src="http://cdn.example.test/insecure.js"></script></head><body><main><h1>Security review</h1></main></body></html>',
  'assets/runtime.js': 'const dynamic = eval(userInput); element.innerHTML = userInput; window.parent.postMessage({ready:true}, "*");',
}, category);
assert.ok(securityReview.findings.some(item => item.code === 'DANGEROUS_DYNAMIC_CODE'));
assert.ok(securityReview.findings.some(item => item.code === 'UNSAFE_HTML_SINK'));
assert.ok(securityReview.findings.some(item => item.code === 'INSECURE_HTTP_RESOURCE'));
assert.ok(securityReview.findings.some(item => item.code === 'WILDCARD_POSTMESSAGE'));
assert.ok(securityReview.findings.some(item => item.code === 'EXTERNAL_SCRIPT_NO_SRI'));
assert.ok(securityReview.qualityScoreV2.dimensions.security.score < 100,
  'The security dimension must reflect unsafe source evidence.');

console.log('Web Studio artifact evaluator tests passed: requirement evidence gates, dimension coverage semantics, monorepo/root package detection, Remix hosting, security, route integrity and unverified integration boundaries.');
