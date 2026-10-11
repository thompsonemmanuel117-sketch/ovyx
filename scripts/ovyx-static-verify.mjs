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
  !/not available right now\. Please try again later, or connect your own AI Brain in Universal Connections to continue building/i.test(providerRouterSource)
) {
  errors.push('functions/_lib/providers.js: an explicitly selected provider must use its own provider route and show a helpful unavailable message instead of silently switching.');
}

const automaticRouterSource = fs.existsSync(providerRouterPath)
  ? fs.readFileSync(providerRouterPath, 'utf8')
  : '';
if (
  !/function automaticTaskPreference\\(options = \\{\\}\\)/.test(automaticRouterSource) ||
  !/isProviderConfigured\\(env, provider\\)/.test(automaticRouterSource) ||
  !/No AI provider is connected right now[\\s\\S]*?connect your own AI Brain in Universal Connections/i.test(automaticRouterSource)
) {
  errors.push('functions/_lib/providers.js: OVYX Auto must choose by task, skip unconfigured providers, and explain how to connect a brain when none are available.');
}

const quotaRoutePaths = [
  path.join(root, 'functions/api/ai/gateway.js'),
  path.join(root, 'functions/api/ai/assistant.js'),
];
for (const routePath of quotaRoutePaths) {
  if (!fs.existsSync(routePath)) {
    errors.push(`${path.relative(root, routePath)}: AI request route is missing.`);
    continue;
  }
  const routeSource = fs.readFileSync(routePath, 'utf8');
  if (!/beginAIQuota/.test(routeSource) || !/finalizeAIQuota/.test(routeSource) || !/refundDailyPrompt/.test(routeSource)) {
    errors.push(`${path.relative(root, routePath)}: AI generation must enforce server-side quota and safely refund failed daily-ration requests.`);
  }
}
const quotaHelperPath = path.join(root, 'functions/_lib/token-quota.js');
if (fs.existsSync(quotaHelperPath)) {
  const quotaHelper = fs.readFileSync(quotaHelperPath, 'utf8');
  if (!/current\\.daily_prompts_allowance <= 0/.test(quotaHelper) || !/DAILY_RATION_EXHAUSTED/.test(quotaHelper) || !/DAILY_RATION_MESSAGE/.test(quotaHelper)) {
    errors.push('functions/_lib/token-quota.js: exhausted token balance and daily ration must be blocked on the server.');
  }
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
  const toastSource = text.match(/function showToast\\(msg, type = ['"]info['"]\\) \\{([\\s\\S]*?)\\n    \\}/);
  if (
    !toastSource ||
    !toastSource[1].includes('message.textContent = String(msg == null ? \'\' : msg)') ||
    !text.includes('id="ovyx-toast-motion-v2"') ||
    !text.includes('ovyxToastEnterV2') ||
    !text.includes('.ovyx-toast--success') ||
    !text.includes('.ovyx-toast--error')
  ) {
    errors.push('index.html: success/error notifications must be animated, accessible, and render their text safely.');
  }
  if (
    !text.includes("bar.setAttribute('aria-valuemax',String(quotaMax))") ||
    !text.includes("bar.setAttribute('aria-valuenow',String(quotaNow))")
  ) {
    errors.push('index.html: the live token meter must expose the current remaining quota and plan/daily limit.');
  }
  const providerChoiceRouter = text.match(/function patchAIBrain\(\)\{([\s\S]*?)\n  function mountGemini\(\)\{\}/);
  if (
    !providerChoiceRouter ||
    !providerChoiceRouter[1].includes('failoverUsed:false') ||
    !providerChoiceRouter[1].includes('Please try again later, or connect your own AI Brain in Universal Connections to continue building.') ||
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

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log('OVYX static verification passed.');
