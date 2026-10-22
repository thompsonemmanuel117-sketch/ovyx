import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const errors = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// OVYX is a Cloudflare Pages Git-integrated project. Pages configuration and
// production variables/secrets are managed in the Cloudflare dashboard.
// A Wrangler config in this repository would become a second source of truth
// and can overwrite dashboard-managed Pages variables on deployment.
for (const configName of ['wrangler.toml', 'wrangler.json', 'wrangler.jsonc']) {
  if (fs.existsSync(path.join(root, configName))) {
    errors.push(`${configName}: must not be committed to OVYX; Cloudflare Pages configuration is dashboard-managed to protect existing variables and secrets.`);
  }
}

for (const file of walk(path.join(root, 'functions'))) {
  if (!/\.(js|mjs|cjs)$/.test(file)) continue;
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    errors.push(`${path.relative(root, file)}: ${String(error.stderr || error.stdout || error.message).trim()}`);
  }
}

// Runtime contract checks for the incidents OVYX is repairing. Syntax alone
// does not detect an AI route that can wait forever or a missing API handler.
const providerRouterPath = path.join(root, 'functions/_lib/providers.js');
if (fs.existsSync(providerRouterPath)) {
  const providerRouter = fs.readFileSync(providerRouterPath, 'utf8');
  if (!/function fetchWithTimeout\(/.test(providerRouter)) {
    errors.push('functions/_lib/providers.js: AI provider requests need an explicit timeout.');
  }
  if (!/withTimeout\(\s*getActiveBrainConnectionId/.test(providerRouter)) {
    errors.push('functions/_lib/providers.js: Universal Connection lookup needs a deadline.');
  }
  if (
    !/if\s*\(options\.authUser\s*&&\s*!\/\^connection:\/i\.test\(requestedRaw\)\)/.test(providerRouter) ||
    !/UNIVERSAL_CONNECTION_SELECTION_FAILED/.test(providerRouter) ||
    !/selected Universal Connection AI Brain failed[\s\S]*?did not switch to another AI provider/i.test(providerRouter)
  ) {
    errors.push('functions/_lib/providers.js: a saved Universal Connection must override platform provider choices and fail closed instead of routing silently to platform keys.');
  }
  const rawFetches = (providerRouter.match(/\bawait fetch\s*\(/g) || []).length;
  if (rawFetches !== 1 || !/return await fetch\(url,\s*\{ \.\.\.options, signal: controller\.signal \}\)/.test(providerRouter)) {
    errors.push('functions/_lib/providers.js: provider network calls must pass through the timeout wrapper.');
  }
}

const providerRouterSource = fs.existsSync(providerRouterPath)
  ? fs.readFileSync(providerRouterPath, 'utf8')
  : '';
if (
  /OVYX_AI_BASE_URL|sharedGateway|sharedKeyPreference|resolveOpenAICompatibleConfig/.test(providerRouterSource) ||
  !/if\s*\(requested\s*!==\s*['"]automatic['"]\s*&&\s*!requested\.startsWith\(['"]connection:/.test(providerRouterSource) ||
  !/is not available right now\. Try OVYX Auto or choose another available AI option/i.test(providerRouterSource)
) {
  errors.push('functions/_lib/providers.js: an explicitly selected provider must use its own provider route and show a helpful unavailable message instead of silently switching.');
}

if (
  !providerRouterSource.includes('function isProviderConfigured(env, provider)') ||
  !providerRouterSource.includes('AI_PROVIDER_NOT_CONFIGURED') ||
  !providerRouterSource.includes('const availableProviders = providerOrder(')
) {
  errors.push('functions/_lib/providers.js: Automatic mode must skip unconfigured providers and fail clearly when no provider is usable.');
}

const aiStatusPath = path.join(root, 'functions/api/ai/status.js');
if (fs.existsSync(aiStatusPath)) {
  const aiStatus = fs.readFileSync(aiStatusPath, 'utf8');
  if (/generativelanguage\.googleapis\.com\/v1beta\/models[^\x60]*[?&]key=/i.test(aiStatus)) {
    errors.push('functions/api/ai/status.js: Gemini API keys must not be placed in request URLs.');
  }
  if (!/['"]x-goog-api-key['"]\s*:\s*key/.test(aiStatus)) {
    errors.push('functions/api/ai/status.js: Gemini health checks must send the key in the x-goog-api-key header.');
  }
}


const cloudflareDiagnosticsPath = path.join(root, 'scripts/ovyx-cloudflare-diagnostics.mjs');
const cloudflareShellSmokePath = path.join(root, 'scripts/cloudflare-application-shell.mjs');
if (!fs.existsSync(cloudflareShellSmokePath)) {
  errors.push('scripts/cloudflare-application-shell.mjs: live deployment diagnostics need a safe public application-shell probe.');
} else {
  const shellSmoke = fs.readFileSync(cloudflareShellSmokePath, 'utf8');
  if (
    !shellSmoke.includes('qualityRuntimeInjected') ||
    !shellSmoke.includes('qualityRuntimeSignaturePresent') ||
    !shellSmoke.includes('function auditSources') ||
    !shellSmoke.includes('cross-page fragment link')
  ) {
    errors.push('scripts/cloudflare-application-shell.mjs: verify the production shell and actual Web Studio QA runtime signatures before declaring it healthy.');
  }
}
if (fs.existsSync(cloudflareDiagnosticsPath)) {
  const cloudflareDiagnostics = fs.readFileSync(cloudflareDiagnosticsPath, 'utf8');
  if (!cloudflareDiagnostics.includes("probeApplicationShell(origin)") || !cloudflareDiagnostics.includes('applicationShell.ok')) {
    errors.push('scripts/ovyx-cloudflare-diagnostics.mjs: production health must include a real application-shell/quality-runtime smoke test, not only API health.');
  }
}

const deploymentRoutePath = path.join(root, 'functions/api/deploy.js');
if (!fs.existsSync(deploymentRoutePath)) {
  errors.push('functions/api/deploy.js: secure publishing route is missing.');
} else {
  const deploymentRoute = fs.readFileSync(deploymentRoutePath, 'utf8');
  if (
    !/const\s+canDeploy\s*=\s*await\s+hasCloudflareDeployCapability\s*\(/.test(deploymentRoute) ||
    !/if\s*\(\s*!canDeploy\s*\)/.test(deploymentRoute)
  ) {
    errors.push('functions/api/deploy.js: publishing must await the server-side entitlement check and deny deployment when not allowed.');
  }
}

const agentQuotaRoutePath = path.join(root, 'functions/api/generate.js');
if (fs.existsSync(agentQuotaRoutePath)) {
  const agentRoute = fs.readFileSync(agentQuotaRoutePath, 'utf8');
  if (
    !agentRoute.includes('beginAIQuota(context.env, user)') ||
    !agentRoute.includes('finalizeAIQuota(') ||
    !agentRoute.includes('quotaUsage') ||
    !agentRoute.includes('refundDailyPrompt') ||
    !agentRoute.includes('onUsage')
  ) {
    errors.push('functions/api/generate.js: Agent builds must enforce quota before generation, aggregate each model call, settle usage, and refund a daily prompt when a build fails.');
  }
}

const orchestratorQuotaPath = path.join(root, 'functions/_lib/orchestrator.js');
if (fs.existsSync(orchestratorQuotaPath)) {
  const orchestrator = fs.readFileSync(orchestratorQuotaPath, 'utf8');
  const runAgentStart = orchestrator.indexOf('export async function runAgent({');
  const runAgentEnd = runAgentStart < 0 ? -1 : orchestrator.indexOf('}) {', runAgentStart);
  const runAgentHeader = runAgentEnd < 0 ? '' : orchestrator.slice(runAgentStart, runAgentEnd + 4);
  if (
    !runAgentHeader.includes('onUsage = () => {}') ||
    !orchestrator.includes('onUsage,')
  ) {
    errors.push('functions/_lib/orchestrator.js: runAgent must accept a safe AI usage callback before registering usage handlers for each model phase.');
  }
}

const agentRouteQuotaPath = path.join(root, 'functions/api/generate.js');
if (fs.existsSync(agentRouteQuotaPath)) {
  const agentRoute = fs.readFileSync(agentRouteQuotaPath, 'utf8');
  if (
    !agentRoute.includes('if (Number(quotaUsage.total_tokens) > 0)') ||
    !agentRoute.includes('OVYX AGENT QUOTA ACCOUNTING')
  ) {
    errors.push('functions/api/generate.js: failed Agent runs must account for partial AI usage instead of bypassing quota accounting.');
  }
}

const adminUsersQuotaPath = path.join(root, 'functions/api/admin/users.js');
if (fs.existsSync(adminUsersQuotaPath)) {
  const adminUsers = fs.readFileSync(adminUsersQuotaPath, 'utf8');
  if (
    !adminUsers.includes('QUOTA_PLANS') ||
    !adminUsers.includes('monthlyUsagePercent') ||
    !adminUsers.includes('dailyPromptsRemaining') ||
    !adminUsers.includes("authority: 'SERVER'")
  ) {
    errors.push('functions/api/admin/users.js: admin user rows must expose server-authoritative monthly and daily AI usage.');
  }
}

const launchPolishPath = path.join(root, 'assets/ovyx-launch-polish.js');
if (!fs.existsSync(launchPolishPath)) {
  errors.push('assets/ovyx-launch-polish.js: shared animated notification and quota meter runtime is missing.');
} else {
  const launchPolish = fs.readFileSync(launchPolishPath, 'utf8');
  if (
    !launchPolish.includes('function launchToast(') ||
    !launchPolish.includes('function loadAdminQuota(') ||
    !launchPolish.includes('view-admin-users') ||
    !launchPolish.includes('sidebar-token-bar') ||
    !launchPolish.includes('textContent')
  ) {
    errors.push('assets/ovyx-launch-polish.js: the animated notification or server-backed quota meter contract is incomplete.');
  }
}

const shellMiddlewarePath = path.join(root, 'functions/_middleware.js');
if (fs.existsSync(shellMiddlewarePath)) {
  const shellMiddleware = fs.readFileSync(shellMiddlewarePath, 'utf8');
  if (
    !shellMiddleware.includes("assets/ovyx-launch-polish.js") ||
    !shellMiddleware.includes('new HTMLRewriter()') ||
    !shellMiddleware.includes("url.pathname.toLowerCase().endsWith('/favicon.ico')") ||
    !shellMiddleware.includes("url.pathname === '/ovyx-tab-v6.svg'") ||
    !shellMiddleware.includes("if (!contentType.includes('text/html')) return response;") ||
    !shellMiddleware.includes("headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')") ||
    shellMiddleware.includes("url.pathname !== '/' && url.pathname !== '/index.html'")
  ) {
    errors.push('functions/_middleware.js: the OVYX shell must enforce the canonical favicon, handle the browser favicon fallback, and rewrite uncached HTML routes without a root-only bypass.');
  }
} else {
  errors.push('functions/_middleware.js: application-shell launch runtime middleware is missing.');
}

const indexHtmlPath = path.join(root, 'index.html');
if (fs.existsSync(indexHtmlPath)) {
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  const firebaseLoaderStart = indexHtml.indexOf('<script id="ovyx-firebase-runtime-loader">');
  const firebaseAppCompatLoad = indexHtml.indexOf("await load(base+'firebase-app-compat.js',6000)", firebaseLoaderStart);
  const firebaseDefaultAppInit = indexHtml.indexOf('firebase.initializeApp(config)', firebaseAppCompatLoad);
  const firebaseAuthCompatLoad = indexHtml.indexOf("load(base+'firebase-auth-compat.js',6000)", firebaseAppCompatLoad);
  if (
    firebaseLoaderStart < 0 ||
    firebaseAppCompatLoad < 0 ||
    firebaseDefaultAppInit <= firebaseAppCompatLoad ||
    firebaseAuthCompatLoad <= firebaseDefaultAppInit
  ) {
    errors.push('index.html: Firebase must initialize the default app immediately after firebase-app-compat loads, before auth/firestore/storage compat scripts load, so early shell handlers cannot throw app-compat/no-app errors.');
  }
}
const scopedRollbackPath = path.join(root, 'assets/ovyx-scoped-rollback.js');
if (!fs.existsSync(scopedRollbackPath)) {
  errors.push('assets/ovyx-scoped-rollback.js: app-wide scoped Cancel and modal rollback protection is missing.');
} else {
  const scopedRollback = fs.readFileSync(scopedRollbackPath, 'utf8');
  if (
    !scopedRollback.includes('__OVYX_SCOPED_ROLLBACK_V1__') ||
    !scopedRollback.includes('window.OVYXScopedRollback') ||
    !scopedRollback.includes('function restoreProject(snapshot)') ||
    !scopedRollback.includes('function closeLocalSurfaceForBack()') ||
    !scopedRollback.includes('function cancelStudioTaskSafely()') ||
    !scopedRollback.includes('restoreScheduled') ||
    !scopedRollback.includes('projectSaveResult === false') ||
    !scopedRollback.includes('projectsBeforeSave = state.projects') ||
    !scopedRollback.includes('projectList: projects.map') ||
    !scopedRollback.includes('.ovyx-ws-plan-modal') ||
    !scopedRollback.includes('__OVYXV665_SUPPRESS_HISTORY') ||
    !scopedRollback.includes('duplicate-route-entry-skipped') ||
    !scopedRollback.includes('function isHistoryOverlayScope(scope)') ||
    !scopedRollback.includes('function pushOverlayHistoryEntry()') ||
    !scopedRollback.includes('if (openedBackableOverlayByClick && !overlayHistoryOpen) overlayHistoryOpen = pushOverlayHistoryEntry()') ||
    !scopedRollback.includes('if (!hasBackableOverlay) overlayHistoryOpen = false') ||
    !scopedRollback.includes('function topOpenScope()') ||
    !scopedRollback.includes('function shouldRestoreProjectScope(scope)') ||
    !scopedRollback.includes('function shouldCaptureProjectBeforeOpen(button)') ||
    !scopedRollback.includes('function scheduleScan()') ||
    !scopedRollback.includes('function mutationNeedsScan(mutation)') ||
    !scopedRollback.includes('project: projectOverride !== undefined') ||
    !scopedRollback.includes('if (mutations.some(mutationNeedsScan)) scheduleScan()') ||
    !scopedRollback.includes('performance: () => ({') ||
    !scopedRollback.includes('if (restoreProjectCheckpoint) restoreProject(record.project)')
  ) {
    errors.push('assets/ovyx-scoped-rollback.js: shared rollback must restore only the active scope and preserve unrelated projects.');
  }
}
if (fs.existsSync(shellMiddlewarePath)) {
  const shellMiddleware = fs.readFileSync(shellMiddlewarePath, 'utf8');
  if (!shellMiddleware.includes('ovyx-scoped-rollback.js?v=20261022-12')) {
    errors.push('functions/_middleware.js: every application-shell HTML response must inject the app-wide scoped rollback runtime.');
  }
}
const shellHeadersPath = path.join(root, '_headers');
if (fs.existsSync(shellHeadersPath)) {
  const shellHeaders = fs.readFileSync(shellHeadersPath, 'utf8');
  if (!/\/assets\/ovyx-scoped-rollback\.js\s+Cache-Control:\s*no-store, no-cache, must-revalidate/.test(shellHeaders)) {
    errors.push('_headers: the app-wide scoped rollback asset must not be cached during rollout.');
  }
}

const multiPageHelperPath = path.join(root, 'functions/_lib/multi-page.js');
const multiPageOrchestratorPath = path.join(root, 'functions/_lib/orchestrator.js');
const multiPagePromptsPath = path.join(root, 'functions/_lib/prompts.js');
if (fs.existsSync(multiPageHelperPath) && fs.existsSync(multiPageOrchestratorPath) && fs.existsSync(multiPagePromptsPath)) {
  const helper = fs.readFileSync(multiPageHelperPath, 'utf8');
  const orchestrator = fs.readFileSync(multiPageOrchestratorPath, 'utf8');
  const prompts = fs.readFileSync(multiPagePromptsPath, 'utf8');
  if (
    !helper.includes('export function createSiteBuildBatches') ||
    !helper.includes('export function mergeStagedChanges') ||
    !orchestrator.includes('createSiteBuildBatches(siteMap, maxChangedFiles)') ||
    !orchestrator.includes('existingChanges: changes') ||
    !orchestrator.includes('SITE_MAP_BATCH_INCOMPLETE') ||
    !helper.includes('FULL WEBSITE ROUTE MANIFEST') ||
    !prompts.includes('siteMap')
  ) {
    errors.push('OVYX multi-page generation: scalable page batching, staged-file reuse, route planning or missing-page protection is incomplete.');
  }
} else {
  errors.push('OVYX multi-page generation: site batching helper, orchestration or sitemap prompts are missing.');
}

const studioMultiPagePath = path.join(root, 'functions/_lib/studio-multipage.js');
const studioAssistantPath = path.join(root, 'functions/api/ai/assistant.js');
const studioGatewayPath = path.join(root, 'functions/api/ai/gateway.js');
if (!fs.existsSync(studioMultiPagePath) || !fs.existsSync(studioAssistantPath) || !fs.existsSync(studioGatewayPath)) {
  errors.push('OVYX Web Studio: multi-page build helper or one of the authenticated AI endpoints is missing.');
} else {
  const studioMultiPage = fs.readFileSync(studioMultiPagePath, 'utf8');
  const studioAssistant = fs.readFileSync(studioAssistantPath, 'utf8');
  const studioGateway = fs.readFileSync(studioGatewayPath, 'utf8');
  if (
    !studioMultiPage.includes('createSiteBuildBatches') ||
    !studioMultiPage.includes('WEBSTUDIO_BATCH_MISSING_FILES') ||
    !studioAssistant.includes('buildStudioMultiPage') ||
    !studioAssistant.includes('multiPageBuild') ||
    !studioGateway.includes('buildStudioMultiPage') ||
    !studioGateway.includes('multiPageBuild')
  ) {
    errors.push('OVYX Web Studio: real AI assistant/gateway routes must use verified multi-page batches and refuse incomplete output.');
  }
}

const webStudioShellPath = path.join(root, 'index.html');
if (fs.existsSync(webStudioShellPath)) {
  const webStudioShell = fs.readFileSync(webStudioShellPath, 'utf8');
  if (
    !webStudioShell.includes("mode:payload.mode||'assistant'") ||
    !webStudioShell.includes('send("ovxNavigateTo"') ||
    !webStudioShell.includes('this.navigatePreviewRoute(event.data.ovxNavigateTo.path)') ||
    !webStudioShell.includes('navigatePreviewRoute(rawPath)')
  ) {
    errors.push('OVYX Web Studio: provider-specific builds must preserve operation mode and internal multi-page preview links must navigate to the matching page.');
  }
}

// Web Studio Stage 3: explicit prompt contracts, readiness questions, and
// required-page recovery are backend-enforced and covered by the standard test suite.
const promptContractPath = path.join(root, 'functions/_lib/prompt-contract.js');
const promptContractTestPath = path.join(root, 'scripts/prompt-contract.test.mjs');
const packageJsonPath = path.join(root, 'package.json');
if (!fs.existsSync(promptContractPath) || !fs.existsSync(promptContractTestPath)) {
  errors.push('OVYX Web Studio: prompt contract enforcement or its regression tests are missing.');
} else {
  const promptContract = fs.readFileSync(promptContractPath, 'utf8');
  const promptContractTest = fs.readFileSync(promptContractTestPath, 'utf8');
  const promptGateway = fs.existsSync(studioGatewayPath) ? fs.readFileSync(studioGatewayPath, 'utf8') : '';
  const promptMultiPage = fs.existsSync(studioMultiPagePath) ? fs.readFileSync(studioMultiPagePath, 'utf8') : '';
  const packageJson = fs.existsSync(packageJsonPath) ? fs.readFileSync(packageJsonPath, 'utf8') : '';
  if (
    !promptGateway.includes('buildPromptContract') ||
    !promptGateway.includes('getWebStudioBuildClarification') ||
    !promptGateway.includes('PROMPT REQUIREMENT CONTRACT') ||
    !promptMultiPage.includes('verifyPromptContractOutput') ||
    !promptMultiPage.includes('promptContract.explicitPages') ||
    !promptContractTest.includes('CONTACT_FORM_MISSING') ||
    !packageJson.includes('scripts/prompt-contract.test.mjs')
  ) {
    errors.push('OVYX Web Studio: prompt fidelity, build-readiness handling, explicit-page recovery, or required regression coverage is incomplete.');
  }
}

// Web Studio Stage 3 request-level trace: it must be loaded only with the app shell,
// monitor build/fix requests without changing fetch responses, and have regression tests.
const studioTracePath = path.join(root, 'assets/ovyx-studio-trace.js');
const studioTraceTestPath = path.join(root, 'scripts/ovyx-studio-trace.test.mjs');
const middlewarePath = path.join(root, 'functions/_middleware.js');
if (!fs.existsSync(studioTracePath) || !fs.existsSync(studioTraceTestPath) || !fs.existsSync(middlewarePath)) {
  errors.push('OVYX Web Studio: trace UI, regression tests, or app-shell script injection is missing.');
} else {
  const studioTrace = fs.readFileSync(studioTracePath, 'utf8');
  const studioTraceTest = fs.readFileSync(studioTraceTestPath, 'utf8');
  const middleware = fs.readFileSync(middlewarePath, 'utf8');
  const packageJson = fs.existsSync(packageJsonPath) ? fs.readFileSync(packageJsonPath, 'utf8') : '';
  if (
    !studioTrace.includes('window.__OVYX_STUDIO_TRACE__') ||
    !studioTrace.includes('(?:gateway|assistant)') ||
    !studioTrace.includes('requirementVerification') ||
    !studioTrace.includes('without displaying the full prompt or your app contents') ||
    !studioTraceTest.includes('Normal assistant chat should not open') ||
    !studioTraceTest.includes('network disconnected') ||
    !middleware.includes('/assets/ovyx-studio-trace.js?v=20261018-3') ||
    !packageJson.includes('scripts/ovyx-studio-trace.test.mjs')
  ) {
    errors.push('OVYX Web Studio: request trace, privacy guard, response checks, or runtime regression coverage is incomplete.');
  }
}

// OVYX-native workspace assistant: the chat drawer must use the Cloudflare AI
// binding directly, not the third-party provider/API-key router.
const nativeAssistantPath = path.join(root, 'functions/_lib/ovyx-native-ai.js');
const nativeAssistantRoutePath = path.join(root, 'functions/api/ai/ovyx.js');
const nativeAssistantClientPath = path.join(root, 'assets/ovyx-assistant-workspace.js');
if (!fs.existsSync(nativeAssistantPath) || !fs.existsSync(nativeAssistantRoutePath) || !fs.existsSync(nativeAssistantClientPath)) {
  errors.push('OVYX native assistant: native AI adapter, authenticated endpoint or workspace client is missing.');
} else {
  const nativeAssistant = fs.readFileSync(nativeAssistantPath, 'utf8');
  const nativeRoute = fs.readFileSync(nativeAssistantRoutePath, 'utf8');
  const nativeClient = fs.readFileSync(nativeAssistantClientPath, 'utf8');
  const shellMiddleware = fs.readFileSync(shellMiddlewarePath, 'utf8');
  const workspaceToolsPath = path.join(root, 'functions/api/ai/workspace-tools.js');
  const workspaceToolsTestPath = path.join(root, 'scripts/ovyx-workspace-tools.test.mjs');
  const workspaceToolsIntegrationTestPath = path.join(root, 'scripts/ovyx-workspace-tools.integration.test.mjs');
  const workspaceTools = fs.existsSync(workspaceToolsPath) ? fs.readFileSync(workspaceToolsPath, 'utf8') : '';
  const workspaceToolsTest = fs.existsSync(workspaceToolsTestPath) ? fs.readFileSync(workspaceToolsTestPath, 'utf8') : '';
  const workspaceToolsIntegrationTest = fs.existsSync(workspaceToolsIntegrationTestPath) ? fs.readFileSync(workspaceToolsIntegrationTestPath, 'utf8') : '';
  if (
    !nativeAssistant.includes('env.AI.run') ||
    !nativeAssistant.includes('@cf/meta/llama-3.3-70b-instruct-fp8-fast') ||
    !nativeAssistant.includes('nativeActions') ||
    !nativeRoute.includes('generateOvyxNativeAI') ||
    !nativeRoute.includes('beginAIQuota(context.env, user)') ||
    !nativeRoute.includes('finalizeAIQuota(') ||
    !nativeRoute.includes('OVYX_NATIVE_AI_NOT_CONFIGURED') ||
    !nativeClient.includes('/api/ai/ovyx') ||
    !nativeClient.includes('data-ovyx-native-more') ||
    !nativeClient.includes('workspace-copilot-native') ||
    !nativeAssistant.includes('workspace_read_file') ||
    !nativeAssistant.includes('workspace_search') ||
    !nativeAssistant.includes('workspace_inspect') ||
    !nativeAssistant.includes('workspace_diagnose') ||
    !nativeClient.includes('READ_ONLY_WORKSPACE_ACTIONS') ||
    !nativeClient.includes('executeWorkspaceReadAction') ||
    !nativeClient.includes('workspaceToolResults') ||
    !nativeClient.includes('while (toolRounds < 4)') ||
    !nativeClient.includes('const remaining = 6 - toolCallCount') ||
    !nativeClient.includes('const ASSISTANT_ACTIVITY_LABELS') ||
    !nativeClient.includes('function beginAssistantActivity') ||
    !nativeClient.includes('function describeWorkspaceToolOutcome') ||
    !nativeClient.includes('Searching saved project source for') ||
    !nativeClient.includes('payload.queries = action.queries') ||
    !workspaceTools.includes('export function searchProjectSource') ||
    !workspaceTools.includes('MAX_SEARCHABLE_PROJECT_FILES = 2_000') ||
    !workspaceToolsTest.includes('Deep search must scan the saved source inventory beyond the previous 120-file limit') ||
    !workspaceToolsTest.includes('A capped scan must explicitly disclose incomplete inventory coverage.') ||
    !nativeClient.includes('snapshotAssets') ||
    !nativeClient.includes('snapshotConnections') ||
    !nativeClient.includes('snapshotRelevantSettings') ||
    !nativeClient.includes('snapshotSelectedElement') ||
    !nativeClient.includes('contentState: dirtyState') ||
    !nativeClient.includes('No source edit was applied') ||
    !nativeClient.includes('runActions') ||
    !nativeClient.includes("operation: 'prepare_restore'") ||
    !nativeClient.includes("operation: 'restore_revision'") ||
    !nativeClient.includes("type === 'workspace_undo'") ||
    !nativeClient.includes('data-ovyx-native-action="undo-last-ai-edit"') ||
    !nativeClient.includes('data-ovyx-native-action="review-ai-edits"') ||
    !nativeClient.includes("running: 'Working'") ||
    !nativeClient.includes('I inspected the saved project') ||
    !nativeClient.includes('saved-project scan was unavailable') ||
    !nativeClient.includes("approval: 'Approval needed'") ||
    !nativeClient.includes("applied: 'Changes saved and verified'") ||
    !workspaceTools.includes("operation === 'read_file'") ||
    !workspaceTools.includes("operation === 'prepare_restore'") ||
    !workspaceTools.includes("operation === 'restore_revision'") ||
    !workspaceTools.includes('RESTORE_APPROVAL_REQUIRED') ||
    !workspaceTools.includes('RESTORE_VERIFY_FAILED') ||
    !fs.readFileSync(nativeAssistantPath, 'utf8').includes("'workspace_undo'") ||
    !workspaceToolsIntegrationTest.includes("operation: 'read_file'") ||
    !workspaceToolsTest.includes('Recovery must have a distinct preview operation.') ||
    !shellMiddleware.includes('assets/ovyx-assistant-workspace.js?v=20261019-1')
  ) {
    errors.push('OVYX native assistant: safe recovery, review-before-write, truthful progress states, tests or cache-busted shell injection is incomplete.');
  }
  try {
    execFileSync(process.execPath, ['--check', nativeAssistantClientPath], { stdio: 'pipe' });
  } catch (error) {
    errors.push(`assets/ovyx-assistant-workspace.js: ${String(error.stderr || error.stdout || error.message).trim()}`);
  }
}
if (!fs.existsSync(path.join(root, 'scripts/ovyx-native-ai.test.mjs')) ||
    !fs.readFileSync(path.join(root, 'package.json'), 'utf8').includes('scripts/ovyx-native-ai.test.mjs')) {
  errors.push('OVYX native assistant: native engine routing tests must run in the standard npm test suite.');
}
if (!fs.existsSync(path.join(root, 'scripts/ovyx-workspace-tools.integration.test.mjs')) ||
    !fs.readFileSync(path.join(root, 'package.json'), 'utf8').includes('scripts/ovyx-workspace-tools.integration.test.mjs') ||
    !fs.existsSync(path.join(root, 'scripts/ovyx-assistant-workspace.browser.test.mjs')) ||
    !fs.existsSync(path.join(root, '.github/workflows/ovyx-assistant-workspace-browser.yml'))) {
  errors.push('OVYX assistant Stage 6: workspace persistence integration tests and desktop/mobile browser test workflow must be present.');
}

const routeConfigPath = path.join(root, '_routes.json');
const misplacedRouteConfigPath = path.join(root, 'functions/_routes.json');
if (!fs.existsSync(routeConfigPath)) {
  errors.push('_routes.json: Cloudflare Pages routing config must exist at the project build-output root so favicon and shell middleware routes are actually deployed.');
} else {
  const routeConfig = JSON.parse(fs.readFileSync(routeConfigPath, 'utf8'));
  if (
    Number(routeConfig.version) !== 1 ||
    !Array.isArray(routeConfig.include) ||
    !routeConfig.include.includes('/*') ||
    !Array.isArray(routeConfig.exclude) ||
    !routeConfig.exclude.includes('/assets/*') ||
    !routeConfig.exclude.includes('/manifest.json') ||
    routeConfig.exclude.includes('/favicon.ico') ||
    routeConfig.exclude.includes('/ovyx-tab-v6.svg')
  ) {
    errors.push('_routes.json: include the shell, favicon, nested HTML and API paths; exclude static asset files only so the canonical favicon handler can run.');
  }
}
if (fs.existsSync(misplacedRouteConfigPath)) {
  errors.push('functions/_routes.json: Pages routing rules belong in the root build-output directory as _routes.json, not inside functions/.');
}

const entitlementRoutePath = path.join(root, 'functions/api/entitlements.js');
if (fs.existsSync(entitlementRoutePath)) {
  const entitlementRoute = fs.readFileSync(entitlementRoutePath, 'utf8');
  if (!/export async function onRequestGet\s*\(/.test(entitlementRoute)) {
    errors.push('functions/api/entitlements.js: authenticated GET route is missing; owner/admin visibility cannot be verified.');
  }
  if (!/role\s*,[\s\S]*owner:\s*root[\s\S]*admin:\s*root/.test(entitlementRoute)) {
    errors.push('functions/api/entitlements.js: server-authoritative owner/admin fields are missing from the response contract.');
  }
}

const healthRoutePath = path.join(root, 'functions/api/health.js');
if (fs.existsSync(healthRoutePath)) {
  const healthRoute = fs.readFileSync(healthRoutePath, 'utf8');
  if (
    !healthRoute.includes("'FIREBASE_SERVICE_ACCOUNT_JSON'") ||
    !healthRoute.includes("state: 'invalid_json'") ||
    !healthRoute.includes("state: 'invalid_private_key'") ||
    !healthRoute.includes("state: 'project_mismatch'") ||
    !healthRoute.includes('emptyRequiredEnvironment') ||
    !healthRoute.includes('unavailableRequiredEnvironment') ||
    !healthRoute.includes('invalidRequiredEnvironment') ||
    !healthRoute.includes('must_be_at_least_32_characters') ||
    !healthRoute.includes('credentialAuthentication')
  ) {
    errors.push('functions/api/health.js: health checks must distinguish absent, empty, malformed, and structurally valid runtime secrets without exposing secret values.');
  }
} else {
  errors.push('functions/api/health.js: runtime secret health checks are missing.');
}

for (const file of walk(root).filter(x => /\.json$/.test(x))) {
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`${path.relative(root, file)}: invalid JSON: ${error.message}`);
  }
}

for (const file of [
  path.join(root, 'scripts/ovyx-pages-build.mjs'),
  path.join(root, 'scripts/ovyx-cloudflare-diagnostics.mjs'),
  path.join(root, 'assets/ovyx-launch-polish.js'),
  path.join(root, 'assets/ovyx-scoped-rollback.js'),
  path.join(root, 'functions/_lib/multi-page.js'),
  path.join(root, 'functions/_lib/orchestrator.js'),
  path.join(root, 'functions/_lib/prompts.js'),
]) {
  if (!fs.existsSync(file)) continue;
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    errors.push(`${path.relative(root, file)}: ${String(error.stderr || error.stdout || error.message).trim()}`);
  }
}

const html = path.join(root, 'index.html');
if (fs.existsSync(html)) {
  const text = fs.readFileSync(html, 'utf8');
  if (!/^\s*<!doctype html>/i.test(text)) errors.push('index.html: missing doctype');
  if (!/<html\b/i.test(text) || !/<\/html>\s*$/i.test(text)) errors.push('index.html: document shell is incomplete');
  if (!/<script\b/i.test(text) || !/<\/script>/i.test(text)) errors.push('index.html: script structure is incomplete');
  if ((text.match(/id="view-webstudio"/gi) || []).length !== 1) errors.push('index.html: expected exactly one Web Studio view');
  if (!/id="app-sidebar"/i.test(text) || !/id="mobile-drawer"/i.test(text)) errors.push('index.html: main navigation shell is missing');
  if (/Agent is starting/i.test(text)) errors.push('index.html: stale Web Studio agent-starting copy detected');
  if (!text.includes('window.__OVYX_SPLASH_FAILSAFE__') || !text.includes('function releaseSplash(reason,event)') || !text.includes("document.readyState==='complete'")) {
    errors.push('index.html: splash must wait for full page load and use a bounded failsafe instead of a short fixed timer.');
  }
  const toastStart = text.indexOf("function showToast(msg, type = 'info') {");
  const toastSource = toastStart >= 0 ? text.slice(toastStart, toastStart + 1900) : '';
  if (
    !toastSource ||
    !toastSource.includes("message.textContent = String(msg == null ? '' : msg)") ||
    !text.includes('id="ovyx-toast-motion-v2"') ||
    !text.includes('ovyxToastEnterV2') ||
    !text.includes('.ovyx-toast--success') ||
    !text.includes('.ovyx-toast--error')
  ) {
    errors.push('index.html: notifications must use safe text rendering and accessible, animated status styles.');
  }
  if (
    !text.includes("bar.setAttribute('aria-valuemax',String(quotaMax))") ||
    !text.includes("bar.setAttribute('aria-valuenow',String(quotaNow))")
  ) {
    errors.push('index.html: the live quota meter must expose remaining and maximum values accessibly.');
  }
  const providerChoiceRouter = text.match(/function patchAIBrain\(\)\{([\s\S]*?)\n  function mountGemini\(\)\{\}/);
  if (
    !providerChoiceRouter ||
    !providerChoiceRouter[1].includes('failoverUsed:false') ||
    !providerChoiceRouter[1].includes('Try OVYX Auto or choose another available AI option.') ||
    /for\s*\(const provider of order\)/.test(providerChoiceRouter[1])
  ) {
    errors.push('index.html: explicitly selected AI providers must not silently fail over, and must explain how to continue when unavailable.');
  }
  if (!text.includes('id="deep-conn-clear-ai"') || !text.includes('id="ovyx-v91-clear-brain"')) {
    errors.push('index.html: both Universal Connections screens must expose an explicit Clear AI Brain control.');
  }
  if (!/panel\.querySelectorAll\('\[data-conn-use-ai\]'\)[\s\S]{0,1800}action:'use-ai'/.test(text)) {
    errors.push('index.html: the legacy Use as Brain action must persist the selection through the backend.');
  }
  if ((text.match(/action:'clear-ai'/g) || []).length < 2) {
    errors.push('index.html: both Universal Connections screens must support clearing the selected Brain through the backend.');
  }

  const inlineScriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let inlineIndex = 0;

  for (const match of text.matchAll(inlineScriptPattern)) {
    inlineIndex += 1;

    const attrs = String(match[1] || '');
    const body = String(match[2] || '');

    if (!body.trim()) continue;
    if (/\bsrc\s*=\s*/i.test(attrs)) continue;

    const typeMatch = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i);
    const type = String(typeMatch?.[1] || '').trim().toLowerCase();

    if (
      type &&
      type !== 'module' &&
      !type.includes('javascript') &&
      type !== 'text/ecmascript' &&
      type !== 'application/ecmascript'
    ) {
      continue;
    }

    try {
      execFileSync(
        process.execPath,
        ['--check'],
        {
          input: body,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );
    } catch (error) {
      errors.push(
        `index.html inline script #${inlineIndex}: ${String(
          error.stderr ||
          error.stdout ||
          error.message
        ).trim()}`
      );
    }
  }

  const studioMatch = text.match(/<script id="ovyx-webstudio-v2-runtime">([\s\S]*?)<\/script>/i);
  if (studioMatch) {
    try {
      execFileSync(process.execPath, ['--check'], { input: String(studioMatch[1] || ''), encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
    } catch (error) {
      errors.push(`index.html Web Studio runtime: ${String(error.stderr || error.stdout || error.message).trim()}`);
    }
  }
}

const sentinelEnginePath = path.join(root, 'functions/_lib/ovyx-sentinel.js');
const sentinelApiPath = path.join(root, 'functions/api/admin/sentinel.js');
const sentinelDiagnosisApiPath = path.join(root, 'functions/api/admin/sentinel-diagnose.js');
const sentinelCIPath = path.join(root, 'functions/_lib/ovyx-sentinel-ci.js');
const sentinelClientPath = path.join(root, 'assets/ovyx-sentinel.js');
const sentinelUnitTestPath = path.join(root, 'scripts/ovyx-sentinel.test.mjs');
const sentinelBrowserTestPath = path.join(root, 'scripts/ovyx-sentinel.browser.test.mjs');
const sentinelEndpointTestPath = path.join(root, 'scripts/ovyx-sentinel.endpoint.test.mjs');
const sentinelDiagnosisTestPath = path.join(root, 'scripts/ovyx-sentinel-diagnose.test.mjs');
const sentinelCompanionApiPath = path.join(root, 'functions/api/admin/sentinel-companion.js');
const sentinelCompanionTestPath = path.join(root, 'scripts/ovyx-sentinel-companion.test.mjs');
const sentinelMiddlewarePath = path.join(root, 'functions/_middleware.js');
if (
  !fs.existsSync(sentinelEnginePath) ||
  !fs.existsSync(sentinelApiPath) ||
  !fs.existsSync(sentinelDiagnosisApiPath) ||
  !fs.existsSync(sentinelCIPath) ||
  !fs.existsSync(sentinelClientPath) ||
  !fs.existsSync(sentinelUnitTestPath) ||
  !fs.existsSync(sentinelEndpointTestPath) ||
  !fs.existsSync(sentinelDiagnosisTestPath) ||
  !fs.existsSync(sentinelCompanionApiPath) ||
  !fs.existsSync(sentinelCompanionTestPath) ||
  !fs.existsSync(sentinelBrowserTestPath)
) {
  errors.push('OVYX Sentinel: the operational check engine, guarded admin API, browser companion, and unit/browser tests must all be present.');
} else {
  const sentinelEngine = fs.readFileSync(sentinelEnginePath, 'utf8');
  const sentinelApi = fs.readFileSync(sentinelApiPath, 'utf8');
  const sentinelDiagnosisApi = fs.readFileSync(sentinelDiagnosisApiPath, 'utf8');
  const sentinelCompanionApi = fs.readFileSync(sentinelCompanionApiPath, 'utf8');
  const sentinelCI = fs.readFileSync(sentinelCIPath, 'utf8');
  const sentinelClient = fs.readFileSync(sentinelClientPath, 'utf8');
  try {
    execFileSync(process.execPath, ['--check'], { input: sentinelClient, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    errors.push('assets/ovyx-sentinel.js: JavaScript syntax check failed: ' + String(error.stderr || error.stdout || error.message).trim());
  }
  const sentinelMiddleware = fs.existsSync(sentinelMiddlewarePath) ? fs.readFileSync(sentinelMiddlewarePath, 'utf8') : '';
  const headersPath = path.join(root, '_headers');
  const headers = fs.existsSync(headersPath) ? fs.readFileSync(headersPath, 'utf8') : '';
  if (
    !sentinelEngine.includes('collectSentinelChecks') ||
    !sentinelEngine.includes('export function createSentinelFixPlan') ||
    !sentinelApi.includes('fixPlan: createSentinelFixPlan(latestReport)') ||
    !sentinelClient.includes('data-ovsx="plan"') ||
    !sentinelClient.includes('data-ovsx="diagnose"') ||
    !sentinelDiagnosisApi.includes('buildSentinelDiagnosticInput') ||
    !sentinelDiagnosisApi.includes('verifyFirebaseIdToken') ||
    !sentinelDiagnosisApi.includes('isSentinelAdmin') ||
    !sentinelDiagnosisApi.includes('changesApplied: false') ||
    !sentinelDiagnosisApi.includes('historySaved') ||
    !sentinelDiagnosisApi.includes('MAX_DIAGNOSIS_HISTORY = 25') ||
    !sentinelDiagnosisApi.includes('deleteFirestoreDocumentAtPath') ||
    !sentinelDiagnosisApi.includes('slice(MAX_DIAGNOSIS_HISTORY)') ||
    !sentinelApi.includes('function publicDiagnosisRecord(value, fallbackId = \'\')') ||
    !sentinelApi.includes("'diagnoses'") ||
    !sentinelApi.includes('latestDiagnosis') ||
    !sentinelClient.includes('function renderDiagnosisHistory(items)') ||
    !sentinelClient.includes('data-ovsx-history-id') ||
    !sentinelClient.includes('if (data.historySaved && data.id)') ||
    !fs.readFileSync(sentinelEndpointTestPath, 'utf8').includes('publicDiagnosisRecord') ||
    !sentinelDiagnosisApi.includes('collectSentinelCIMetadata({ env })') ||
    !sentinelCI.includes('collectSentinelCIMetadata') ||
    !sentinelCI.includes('MAX_FAILED_WORKFLOWS') ||
    !sentinelCI.includes('Only workflow/job/step metadata is included') ||
    !fs.readFileSync(sentinelDiagnosisTestPath, 'utf8').includes('collectSentinelCIMetadata') ||
    !sentinelClient.includes('function renderFixPlan(plan)') ||
    !sentinelEngine.includes('automaticChanges: false') ||
    !sentinelEngine.includes('OVYX_SENTINEL_GITHUB_TOKEN') ||
    !sentinelEngine.includes("Authorization: 'Bearer '") ||
    !sentinelApi.includes('isSentinelAdmin') ||
    !sentinelApi.includes('SENTINEL_CRON_AUTH_FAILED') ||
    !sentinelApi.includes('administratorOnly: true') ||
    !sentinelClient.includes('ADMIN_EMAIL') ||
    !sentinelClient.includes('onAuthStateChanged') ||
    !sentinelClient.includes('window.SpeechRecognition') ||
    !sentinelClient.includes('window.webkitSpeechRecognition') ||
    !sentinelClient.includes('disableWake') ||
    !sentinelClient.includes('textContent') ||
    !sentinelClient.includes('data-ovsx-chat-form') ||
    !sentinelClient.includes('function goToSleep(') ||
    !sentinelClient.includes('function openFromVoice(') ||
    !sentinelClient.includes('window.OVYXAdminWorkspace') ||
    !sentinelClient.includes('adminWorkspace.isAuthorized() !== true') ||
    !sentinelClient.includes('function askCompanion(') ||
    !sentinelCompanionApi.includes('isSentinelAdmin') ||
    !sentinelCompanionApi.includes('sourceInspectionUnavailable') ||
    !sentinelCompanionApi.includes('historySaved: false') ||
    !fs.readFileSync(sentinelCompanionTestPath, 'utf8').includes('historySaved') ||
    !sentinelMiddleware.includes('/assets/ovyx-sentinel.js?v=20261018-4') ||
    !headers.includes('microphone=(self)') ||
    !headers.includes('camera=()') ||
    !fs.readFileSync(path.join(root, 'package.json'), 'utf8').includes('scripts/ovyx-sentinel.test.mjs') ||
    !fs.readFileSync(path.join(root, 'package.json'), 'utf8').includes('scripts/ovyx-sentinel.endpoint.test.mjs') ||
    !fs.readFileSync(path.join(root, 'package.json'), 'utf8').includes('scripts/ovyx-sentinel-diagnose.test.mjs') ||
    !fs.readFileSync(path.join(root, 'package.json'), 'utf8').includes('scripts/ovyx-sentinel-companion.test.mjs')
  ) {
    errors.push('OVYX Guardian: owner-only reports and chat, guarded Cron access, privacy-safe conversation handling, 3D voice presentation, wake/sleep controls, safe navigation, or automated test wiring is incomplete.');
  }
}
const sentinelWorkerPath = path.join(root, 'sentinel-worker/index.js');
const sentinelWorkerConfigPath = path.join(root, 'sentinel-worker/wrangler.toml');
if (!fs.existsSync(sentinelWorkerPath) || !fs.existsSync(sentinelWorkerConfigPath)) {
  errors.push('OVYX Sentinel: the separately configured scheduled Worker and Cron Trigger configuration must be present.');
} else {
  const worker = fs.readFileSync(sentinelWorkerPath, 'utf8');
  const workerConfig = fs.readFileSync(sentinelWorkerConfigPath, 'utf8');
  if (
    !worker.includes('OVYX_SENTINEL_BASE_URL') ||
    !worker.includes('OVYX_SENTINEL_CRON_SECRET') ||
    !workerConfig.includes('name = "ovyx-sentinel-scheduler"') ||
    !workerConfig.includes('crons = ["*/30 * * * *"]') ||
    /(?:ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|-----BEGIN PRIVATE KEY-----)/.test(worker + workerConfig)
  ) {
    errors.push('OVYX Sentinel: separate Worker configuration is incomplete or contains a credential-like value.');
  }
}

const providerAvailabilityPath = path.join(root, 'functions/api/ai/provider-availability.js');
const providerAvailabilityTestPath = path.join(root, 'scripts/provider-availability.test.mjs');
const providerAvailabilityClientPath = path.join(root, 'assets/ovyx-provider-availability.js');
const providerAvailabilityBrowserTestPath = path.join(root, 'scripts/ovyx-provider-availability.browser.test.mjs');
if (
  !fs.existsSync(providerAvailabilityPath) ||
  !fs.existsSync(providerAvailabilityTestPath) ||
  !fs.existsSync(providerAvailabilityClientPath) ||
  !fs.existsSync(providerAvailabilityBrowserTestPath)
) {
  errors.push('OVYX provider availability: authenticated endpoint, safe selector runtime and unit/browser tests must be present.');
} else {
  const endpoint = fs.readFileSync(providerAvailabilityPath, 'utf8');
  const client = fs.readFileSync(providerAvailabilityClientPath, 'utf8');
  const shellMiddleware = fs.existsSync(shellMiddlewarePath) ? fs.readFileSync(shellMiddlewarePath, 'utf8') : '';
  const headersPath = path.join(root, '_headers');
  const headers = fs.existsSync(headersPath) ? fs.readFileSync(headersPath, 'utf8') : '';
  if (
    !endpoint.includes('assertAuthenticated(context.data?.user)') ||
    !endpoint.includes("'x-goog-api-key'") ||
    !endpoint.includes("'x-api-key'") ||
    !endpoint.includes('NOT_CONFIGURED') ||
    !endpoint.includes('AbortController') ||
    !endpoint.includes('Cache-Control') ||
    !endpoint.includes('Try OVYX Auto or choose another available AI option.') ||
    endpoint.includes('console.log(key)') ||
    !client.includes("select.id !== 'v59-model-select'") ||
    !client.includes("'/api/ai/provider-availability?provider='") ||
    !client.includes("credentials: 'same-origin'") ||
    !client.includes("cache: 'no-store'") ||
    !client.includes('activeChecks') ||
    !shellMiddleware.includes('/assets/ovyx-provider-availability.js?v=20261018-2') ||
    !headers.includes('/assets/ovyx-provider-availability.js') ||
    !fs.readFileSync(path.join(root, 'package.json'), 'utf8').includes('scripts/provider-availability.test.mjs')
  ) {
    errors.push('OVYX provider availability: checks must be authenticated, time-bounded, no-store, secret-safe, same-origin and connected to the provider selector.');
  }
}

const webStudioReliabilityPath = path.join(root, 'assets/ovyx-webstudio-reliability.js');
const webStudioFeedbackPath = path.join(root, 'functions/api/ai/feedback.js');
if (!fs.existsSync(webStudioReliabilityPath) || !fs.existsSync(webStudioFeedbackPath)) {
  errors.push('Web Studio reliability: response feedback and AI-generated preview validation must be present.');
} else {
  const reliability = fs.readFileSync(webStudioReliabilityPath, 'utf8');
  const feedbackApi = fs.readFileSync(webStudioFeedbackPath, 'utf8');
  const shell = fs.existsSync(shellMiddlewarePath) ? fs.readFileSync(shellMiddlewarePath, 'utf8') : '';
  const headerRules = fs.existsSync(path.join(root, '_headers')) ? fs.readFileSync(path.join(root, '_headers'), 'utf8') : '';
  const mainHtml = fs.existsSync(path.join(root, 'index.html')) ? fs.readFileSync(path.join(root, 'index.html'), 'utf8') : '';
  if (
    !reliability.includes('/api/ai/feedback') ||
    !reliability.includes('data-ovyx-feedback-vote') ||
    !reliability.includes('waitForHelpForm') ||
    !reliability.includes('A website draft was not ready for preview.') ||
    !reliability.includes('The website draft was not updated.') ||
    !feedbackApi.includes('assertAuthenticated(context.data?.user)') ||
    !feedbackApi.includes('enforceSameOrigin(request)') ||
    !feedbackApi.includes("['ai_response_feedback', documentId]") ||
    !shell.includes('/assets/ovyx-webstudio-reliability.js?v=20261019-2') ||
    !headerRules.includes('/assets/ovyx-webstudio-reliability.js') ||
    !mainHtml.includes('AI_BUILD_NO_ARTIFACTS') ||
    !mainHtml.includes("ovyxBuildState='verified'")
  ) {
    errors.push('Web Studio reliability: feedback must be authenticated, preview generation must require actual changed website files, and the runtime must be injected with no-store caching.');
  }
}

const webStudioQualityPath = path.join(root, 'assets/ovyx-webstudio-quality.js');
const webStudioQualityTestPath = path.join(root, 'scripts/ovyx-webstudio-quality.test.mjs');
const webStudioQualityBrowserTestPath = path.join(root, 'scripts/ovyx-webstudio-quality.browser.test.mjs');
const webStudioQualityWorkflowPath = path.join(root, '.github/workflows/ovyx-webstudio-quality-browser.yml');
const webStudioEvaluationCasesPath = path.join(root, 'scripts/ovyx-webstudio-evaluation-cases.json');
const webStudioEvaluationTestPath = path.join(root, 'scripts/ovyx-webstudio-evaluation.test.mjs');
if (
  !fs.existsSync(webStudioQualityPath) ||
  !fs.existsSync(webStudioQualityTestPath) ||
  !fs.existsSync(webStudioQualityBrowserTestPath) ||
  !fs.existsSync(webStudioQualityWorkflowPath) ||
  !fs.existsSync(webStudioEvaluationCasesPath) ||
  !fs.existsSync(webStudioEvaluationTestPath)
) {
  errors.push('Web Studio quality inspector: the runtime, source/browser regression tests and dedicated browser-test workflow must all be present.');
} else {
  const quality = fs.readFileSync(webStudioQualityPath, 'utf8');
  const qualityTest = fs.readFileSync(webStudioQualityTestPath, 'utf8');
  const qualityBrowserTest = fs.readFileSync(webStudioQualityBrowserTestPath, 'utf8');
  const middleware = fs.existsSync(shellMiddlewarePath) ? fs.readFileSync(shellMiddlewarePath, 'utf8') : '';
  const headerRules = fs.existsSync(path.join(root, '_headers')) ? fs.readFileSync(path.join(root, '_headers'), 'utf8') : '';
  const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  const excellencePrompts = fs.readFileSync(path.join(root, 'functions/_lib/prompts.js'), 'utf8');
  const qualityWorkflow = fs.readFileSync(webStudioQualityWorkflowPath, 'utf8');
  const evaluationCases = fs.readFileSync(webStudioEvaluationCasesPath, 'utf8');
  const evaluationTest = fs.readFileSync(webStudioEvaluationTestPath, 'utf8');
  if (
    !quality.includes('OVYX WEB STUDIO QUALITY CONTRACT') ||
    !quality.includes('WIDTHS = [320, 390, 768, 1024, 1440]') ||
    !quality.includes("setAttribute('sandbox', 'allow-scripts')") ||
    !quality.includes("connect-src 'none'") ||
    !quality.includes("form-action 'none'") ||
    !quality.includes("img-src data: blob:") ||
    !quality.includes("media-src data: blob:") ||
    !quality.includes('restoreSnapshot(studio, snapshot)') ||
    !quality.includes('OVYX QUALITY INSPECTOR REPAIR') ||
    !quality.includes('ovyx:webstudio-build-stage') ||
    !qualityTest.includes('Live integration verification') ||
    !qualityBrowserTest.includes('Horizontal overflow') ||
    !qualityBrowserTest.includes('runBuildAgent') ||
    !excellencePrompts.includes('ART DIRECTION AND DISTINCTIVENESS') ||
    !excellencePrompts.includes('Make at most one bounded targeted repair pass') ||
    !middleware.includes('/assets/ovyx-webstudio-quality.js?v=20261021-1') ||
    !headerRules.includes('/assets/ovyx-webstudio-quality.js') ||
    !packageJson.includes('scripts/ovyx-webstudio-quality.test.mjs') ||
    !packageJson.includes('scripts/ovyx-webstudio-evaluation.test.mjs') ||
    !evaluationCases.includes('luxury-real-estate') ||
    !evaluationCases.includes('data-dashboard') ||
    !evaluationCases.includes('provider-failure') ||
    !evaluationCases.includes('interrupted-build') ||
    !evaluationCases.includes('missing-integration') ||
    !evaluationCases.includes('secret-exposure') ||
    !evaluationTest.includes('nine site categories') ||
    !qualityWorkflow.includes('npx playwright install --with-deps chromium') ||
    !qualityWorkflow.includes('scripts/ovyx-webstudio-quality.browser.test.mjs')
  ) {
    errors.push('Web Studio quality inspector: actual responsive checks, isolated execution, snapshot-protected bounded repair, truthful build events, premium design rules, cache policy or browser-test wiring is incomplete.');
  }
}

const guardianPatchApiPath = path.join(root, 'functions/api/admin/guardian-patch.js');
const guardianPatchHelperPath = path.join(root, 'functions/_lib/ovyx-guardian-patch.js');
const guardianPatchTestPath = path.join(root, 'scripts/ovyx-guardian-patch.test.mjs');
if (!fs.existsSync(guardianPatchApiPath) || !fs.existsSync(guardianPatchHelperPath) || !fs.existsSync(guardianPatchTestPath)) {
  errors.push('OVYX Guardian patch workflow: the owner-only patch API, guarded helper, and security tests must be present.');
} else {
  const guardianPatchApi = fs.readFileSync(guardianPatchApiPath, 'utf8');
  const guardianPatchHelper = fs.readFileSync(guardianPatchHelperPath, 'utf8');
  const guardianClient = fs.readFileSync(path.join(root, 'assets/ovyx-sentinel.js'), 'utf8');
  const guardianMiddleware = fs.existsSync(shellMiddlewarePath) ? fs.readFileSync(shellMiddlewarePath, 'utf8') : '';
  if (
    !guardianPatchApi.includes('verifyFirebaseIdToken') ||
    !guardianPatchApi.includes('isSentinelAdmin') ||
    !guardianPatchApi.includes('CREATE_PULL_REQUEST') ||
    !guardianPatchApi.includes('directMainWritesEnabled: false') ||
    !guardianPatchApi.includes('proposalStorageConfigured: proposalStorage') ||
    !guardianPatchApi.includes('GUARDIAN_PATCH_STORAGE_NOT_CONFIGURED') ||
    !guardianPatchHelper.includes('OVYX_GUARDIAN_GITHUB_WRITE_TOKEN') ||
    !guardianPatchHelper.includes('ovyx/guardian/fix-') ||
    !guardianPatchHelper.includes('GUARDIAN_PATCH_STALE') ||
    !guardianPatchHelper.includes('mainBranchChanged: false') ||
    !guardianClient.includes('data-ovsx-patch-tools') ||
    !guardianClient.includes("button.dataset.ovsx === 'patch-apply'") ||
    !guardianClient.includes('function invalidatePatchProposal()') ||
    !guardianMiddleware.includes('/assets/ovyx-sentinel.js?v=20261018-4') ||
    !fs.readFileSync(path.join(root, 'package.json'), 'utf8').includes('scripts/ovyx-guardian-patch.test.mjs')
  ) {
    errors.push('OVYX Guardian patch workflow: code changes must be owner-only, stale-safe, branch-only, explicitly confirmed, tested, and never auto-merged/deployed.');
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log('OVYX static verification passed.');
