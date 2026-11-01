import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtime = await readFile(new URL('../assets/ovyx-webstudio-quality.js', import.meta.url), 'utf8');
const integrity = await readFile(new URL('../functions/_lib/site-integrity.js', import.meta.url), 'utf8');
const validator = await readFile(new URL('../functions/_lib/validator.js', import.meta.url), 'utf8');
const singlePage = await readFile(new URL('../functions/_lib/studio-singlepage.js', import.meta.url), 'utf8');
const multiPage = await readFile(new URL('../functions/_lib/studio-multipage.js', import.meta.url), 'utf8');
const evaluationRunner = await readFile(new URL('./ovyx-webstudio-evaluation-runner.mjs', import.meta.url), 'utf8');
const acceptanceAudit = await readFile(new URL('./ovyx-webstudio-acceptance-audit.mjs', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const backendRuntime = await readFile(new URL('./ovyx-generated-backend-runtime-eval.mjs', import.meta.url), 'utf8');
const autonomousQa = await readFile(new URL('../functions/_lib/autonomous-qa.js', import.meta.url), 'utf8');
const backendWorkflow = await readFile(new URL('../.github/workflows/ovyx-stage5-backend-runtime.yml', import.meta.url), 'utf8');
const backendRepairRoute = await readFile(new URL('../functions/api/internal/live-generation-eval.js', import.meta.url), 'utf8');
const backendRepairClient = await readFile(new URL('./ovyx-cloudflare-backend-repair-client.mjs', import.meta.url), 'utf8');

// The preview inspector must run the complete source as valid JavaScript and
// keep executable project files inside the existing isolated iframe contract.
assert.doesNotThrow(() => new Function(runtime), 'Web Studio quality runtime must parse.');
assert.match(runtime, /frame\.setAttribute\('sandbox', 'allow-scripts'\)/);
assert.match(runtime, /connect-src 'none'; form-action 'none'/,
  'Sandboxed browser previews must not submit forms or make network connections.');
assert.match(runtime, /function safeSandboxPayload\(page, files, token\)/);
assert.match(runtime, /function auditSources\(report, pages, files, project\)/);
assert.match(runtime, /function readProjectQaPlan\(files\)/);
assert.match(runtime, /function journeysForPage\(plan, page\)/);
assert.match(runtime, /async function probeJourneys\(\)/);
assert.match(runtime, /Requirement-derived user journeys/);
assert.match(runtime, /journeys\.failed/);
assert.match(runtime, /unmatchedJourneys/);
assert.match(runtime, /normalizeJourneyRoute/);
assert.match(runtime, /FRAME_TIMEOUT_MS = 15000/);
assert.match(runtime, /The in-editor preview intentionally blocks all network connections/);
assert.match(runtime, /ovyx-qa-plan\.json/);
assert.match(runtime, /backendRequired/);
assert.match(runtime, /backendChecks/);
assert.match(runtime, /fetch\('\/api\/webstudio\/backend-runtime'/, 'Web Studio must call the isolated per-project backend runtime.');
assert.match(runtime, /Disposable backend, database and authorization tests/);
assert.match(runtime, /disposable-backend API check/);
assert.match(autonomousQa, /QA_BACKEND_PLAN_INVALID/);
assert.match(autonomousQa, /QA_BACKEND_CHECK_UNSAFE/);
assert.match(backendRuntime, /networkMode === 'cloudflare-sandbox-no-egress'/);\nassert.match(backendRuntime, /networkMode === 'docker-none'/);
assert.match(backendRuntime, /isLoopbackOnlyNetworkNamespace/);
assert.match(backendRuntime, /pages', 'dev'/);
assert.match(backendRuntime, /--persist-to/);
assert.match(backendWorkflow, /--network none/);
assert.match(backendWorkflow, /--cap-drop=ALL/);
assert.match(backendWorkflow, /--read-only/);
assert.match(backendRepairRoute, /operation === 'repair-backend'/);
assert.match(backendRepairRoute, /performBackendRuntimeRepair/);
assert.match(backendRepairRoute, /verifyGithubOidcToken\(match\[1\], options\)/);
assert.match(backendRepairClient, /--restore/);
assert.match(backendRepairClient, /changedPaths/);
assert.match(backendRuntime, /third-party-package-import-requires-pinned-isolated-dependency-adapter/);
assert.match(runtime, /var routePlan = \[\]/);
assert.match(runtime, /WIDTHS = \[320, 360, 375, 390, 430, 540, 640, 768, 820, 1024, 1280, 1440, 1920\]/);
assert.match(runtime, /function rejectBuildForQuality\(studio, snapshot, reason\)/);
assert.match(runtime, /restoreSnapshot\(studio, snapshot\)/);
assert.match(runtime, /qualityGateActive = true/);
assert.match(runtime, /await performInspection\(\)/);
assert.match(runtime, /issueScore\(report\) > 0/);

// Stage 6 addition: test built-in form constraints against the rendered form
// without dispatching a submit event or sending a user enquiry.
const probeStart = runtime.indexOf('function probeForms()');
assert.ok(probeStart >= 0, 'The isolated preview must test form-validation constraints.');
const probeEnd = runtime.indexOf('if(p.probeInteractions){setTimeout(probeAccessibility', probeStart);
assert.ok(probeEnd > probeStart, 'The form probe must be wired into the normal mobile browser sample.');
const probe = runtime.slice(probeStart, probeEnd);
assert.match(probe, /form\.checkValidity\(\)/);
assert.match(probe, /forms\.invalidRejected\+\+/);
assert.match(probe, /forms\.invalidAccepted\.push/);
assert.match(probe, /savedValue/);
assert.match(probe, /savedChecked/);
assert.match(probe, /savedSelected/);
assert.match(probe, /noNativeValidation/);
assert.doesNotMatch(probe, /requestSubmit\s*\(|\.submit\s*\(/,
  'The automated form probe must never submit a form, including in a preview.');
assert.match(runtime, /Safe form validation smoke test/);
assert.match(runtime, /No submit event was dispatched and outbound network requests are blocked/);
assert.match(runtime, /real form delivery/);
assert.match(runtime, /browserResult\.forms/);
assert.match(runtime, /report\.browser\.forms/);

// Generated builds need deterministic path, secret, requirement, and link
// validation before the browser quality gate can call them ready.
assert.match(validator, /SECRET_RE/);
assert.match(validator, /PLACEHOLDER_RE/);
assert.match(validator, /export function validateChanges/);
assert.match(integrity, /export function auditWebsiteIntegrity/);
assert.match(integrity, /LINK_DESTINATION_MISSING/);
assert.match(integrity, /LOCAL_SRCSET_ASSET_MISSING/);
assert.match(integrity, /ARIA_REFERENCE_TARGET_MISSING/);
assert.match(singlePage, /validateOrRepairSinglePageBuild/);
assert.match(singlePage, /qualityVerification/);
assert.match(singlePage, /siteIntegrity/);
assert.match(multiPage, /auditWebsiteIntegrity/);
assert.match(multiPage, /verifyPromptContractOutput/);
assert.match(multiPage, /WEBSTUDIO_SITE_VALIDATION_FAILED/);
assert.match(multiPage, /_ovyxGenerationRecoveryAttempt/);

// Standalone artifact evaluation and acceptance audit must distinguish source
// evidence, browser tests, human review, and real external integration proof.
assert.match(evaluationRunner, /export function evaluateSiteFiles/);
assert.match(evaluationRunner, /BROKEN_ROUTE_FRAGMENT|DEAD_LINK/);
assert.match(evaluationRunner, /browser behavior/i);
assert.match(acceptanceAudit, /browserByName/);
assert.match(acceptanceAudit, /humanVisualReviewCompleted:false/);
assert.match(acceptanceAudit, /realEnquiryDeliveryConfirmed/);
assert.match(acceptanceAudit, /needs-attention/);
assert.match(packageJson.scripts.test, /ovyx-stage6-webstudio-verification\.test\.mjs/);

console.log('OVYX Stage 6 Web Studio verification contract passed: source gates, isolated responsive previews, link/asset checks, safe form constraints, and honest acceptance reporting.');
