import fs from 'node:fs/promises';
import path from 'node:path';
import { findSuccessfulProductionDeployment, readCloudflareEvaluationPublicSettings, summarizeCloudflareRuntimeConfig } from './ovyx-cloudflare-runtime-config-inventory.mjs';
import { isTrustedGithubOidcRequestHostname } from './ovyx-github-oidc-url.mjs';

const REPOSITORY = 'thompsonemmanuel117-sketch/ovyx';
const AUDIENCE = 'ovyx-live-site-evaluation';
const ROUTE = '/api/internal/live-generation-eval';
const OUTPUT = path.resolve(process.env.OVYX_LIVE_EVAL_OUT || 'artifacts/webstudio-generated-sites');
const CASE_IDS = [
  'nigeria-lagos-real-estate',
  'uk-independent-restaurant',
  'us-independent-fashion',
  'japan-product-software',
];
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const DEPLOYMENT_WAIT_MS = 15 * 60 * 1000;
let cloudflareRuntimeConfigInventory = { aiProviderKeyNames: [], propertyIntegrationVariableNames: [], enquiryAndSocialVariableNames: [] };
let cloudflareRuntimePublicSettings = {};

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error('Missing required GitHub Actions setting: ' + name + '.');
  return value;
}
function timeout(ms) {
  return AbortSignal.timeout(ms);
}
async function boundedText(response, maximum = MAX_RESPONSE_BYTES) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new Error('Cloudflare generation response exceeded the evidence size limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}
async function readJsonResponse(response) {
  const text = await boundedText(response);
  try { return text ? JSON.parse(text) : {}; }
  catch { throw new Error('Cloudflare live-generation endpoint returned invalid JSON.'); }
}
async function cloudflareProjectOrigin() {
  const token = required('CLOUDFLARE_API_TOKEN');
  const accountId = required('CLOUDFLARE_ACCOUNT_ID');
  const projectName = required('CLOUDFLARE_PAGES_PROJECT');
  const url = 'https://api.cloudflare.com/client/v4/accounts/' + encodeURIComponent(accountId) +
    '/pages/projects/' + encodeURIComponent(projectName);
  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      redirect: 'error',
      signal: timeout(15_000),
    });
  } catch {
    throw new Error('Could not securely resolve the configured Cloudflare Pages project.');
  }
  const payload = await readJsonResponse(response);
  if (!response.ok || payload.success !== true || !payload.result) {
    throw new Error('Cloudflare Pages project lookup failed with HTTP ' + response.status + '. Check the existing Pages Read configuration.');
  }
  cloudflareRuntimeConfigInventory = summarizeCloudflareRuntimeConfig(payload.result);
  cloudflareRuntimePublicSettings = readCloudflareEvaluationPublicSettings(payload.result);
  console.log(JSON.stringify({
    event: 'cloudflare-runtime-config-presence',
    ...cloudflareRuntimeConfigInventory,
    publicAcceptanceSettings: {
      listingsUrlConfigured: Boolean(cloudflareRuntimePublicSettings.OVYX_EVAL_LISTINGS_PUBLIC_BROWSER_URL),
      listingsAuthorityDeclared: String(cloudflareRuntimePublicSettings.OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY || '').toLowerCase() === 'authoritative',
      enquiryUrlConfigured: Boolean(cloudflareRuntimePublicSettings.OVYX_EVAL_PUBLIC_ENQUIRY_URL),
      externalEnquiryProbeOptedIn: String(cloudflareRuntimePublicSettings.OVYX_EVAL_ENABLE_EXTERNAL_ENQUIRY_PROBE || '').toLowerCase() === 'true',
      source: 'cloudflare-production-plain-text-allow-list',
    },
  }));
  const subdomain = String(payload.result.subdomain || '').trim().toLowerCase();
  if (!subdomain || !/^[a-z0-9][a-z0-9-]*\.pages\.dev$/.test(subdomain)) {
    throw new Error('Cloudflare did not return a valid canonical Pages subdomain for this project.');
  }
  return {
    origin: 'https://' + subdomain,
    apiToken: token,
    accountId,
    projectName,
  };
}
async function waitForCurrentProductionDeployment(project, expectedCommitSha) {
  const expected = String(expectedCommitSha || '').trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(expected)) {
    throw new Error('GitHub did not provide the expected 40-character commit SHA. No generation requests were sent.');
  }
  const deploymentsUrl = 'https://api.cloudflare.com/client/v4/accounts/' +
    encodeURIComponent(project.accountId) + '/pages/projects/' +
    encodeURIComponent(project.projectName) + '/deployments?env=production&per_page=10';
  const deadline = Date.now() + DEPLOYMENT_WAIT_MS;
  let attempt = 0;
  let lastObservation = 'no matching production deployment found';
  while (Date.now() < deadline) {
    attempt += 1;
    let response;
    try {
      response = await fetch(deploymentsUrl, {
        headers: { Authorization: 'Bearer ' + project.apiToken, Accept: 'application/json' },
        redirect: 'error',
        signal: timeout(15_000),
      });
    } catch {
      lastObservation = 'Cloudflare deployment-list request failed at the transport layer';
      response = null;
    }
    if (response) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Cloudflare refused the Pages deployments read. Verify the existing CLOUDFLARE_API_TOKEN has Pages Read permission. No generation requests were sent.');
      }
      let body = {};
      try { body = await readJsonResponse(response, 100_000); }
      catch { lastObservation = 'Cloudflare deployment-list response was not valid JSON'; }
      if (response.ok && body.success === true && Array.isArray(body.result)) {
        const matched = findSuccessfulProductionDeployment(body.result, expected);
        if (matched) {
          console.log(JSON.stringify({
            event: 'cloudflare-production-deployment-verified',
            deploymentId: matched.id,
            commitSha: matched.commitSha,
            branch: matched.branch,
            environment: matched.environment,
            status: matched.status,
          }));
          return matched;
        }
        const production = body.result.find(item => item?.environment === 'production' && item?.is_skipped !== true);
        const metadata = production?.deployment_trigger?.metadata || {};
        const stage = production?.latest_stage || {};
        const safeSha = String(metadata.commit_hash || '').trim().toLowerCase();
        lastObservation = production
          ? 'latest production commit ' + ( /^[a-f0-9]{7,40}$/.test(safeSha) ? safeSha.slice(0, 12) : 'unknown') +
            ', branch ' + (/^[A-Za-z0-9._/-]{1,80}$/.test(String(metadata.branch || '')) ? String(metadata.branch) : 'unknown') +
            ', stage ' + (/^[a-z_-]{1,40}$/.test(String(stage.name || '')) ? String(stage.name) : 'unknown') +
            '/' + (/^[a-z_-]{1,40}$/.test(String(stage.status || '')) ? String(stage.status) : 'unknown')
          : 'Cloudflare returned no non-skipped production deployment';
      } else if (!response.ok && response.status < 500) {
        throw new Error('Cloudflare deployment-list verification failed with HTTP ' + response.status + '. Check the Pages project name and Pages Read permission. No generation requests were sent.');
      } else if (response.status >= 500) {
        lastObservation = 'Cloudflare deployment-list API returned HTTP ' + response.status;
      }
    }
    if (attempt % 3 === 0) {
      console.log(JSON.stringify({
        event: 'waiting-for-current-cloudflare-production-deployment',
        expectedCommitSha: expected,
        observation: lastObservation,
      }));
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(10_000, 2_000 + attempt * 500)));
  }
  throw new Error('Cloudflare production has not exposed a successful non-skipped deployment of the exact main commit ' +
    expected + ' within the deployment wait window (' + lastObservation + '). No generation requests were sent.');
}
async function getOidcToken() {
  const rawUrl = required('ACTIONS_ID_TOKEN_REQUEST_URL');
  const requestToken = required('ACTIONS_ID_TOKEN_REQUEST_TOKEN');
  let url;
  try {
    url = new URL(rawUrl);
    const protocolOk = url.protocol === 'https:';
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    const hostOk = isTrustedGithubOidcRequestHostname(hostname);
    const noCredentials = !url.username && !url.password;
    const noFragment = !url.hash;
    const standardPort = !url.port;
    const failedChecks = [
      !protocolOk && 'protocol-not-https',
      !hostOk && 'hostname-not-allowlisted',
      !noCredentials && 'url-contains-credentials',
      !noFragment && 'url-contains-fragment',
      !standardPort && 'nonstandard-port-not-allowed',
    ].filter(Boolean);
    if (failedChecks.length) {
      // Never print the complete URL, query string, or request-token value.
      console.error(JSON.stringify({
        event: 'oidc-request-url-rejected',
        protocol: url.protocol,
        hostname,
        checks: failedChecks,
        hasUsername: Boolean(url.username),
        hasPassword: Boolean(url.password),
        hasFragment: Boolean(url.hash),
      }));
      throw new Error('OIDC request URL validation failed: ' + failedChecks.join(', ') + '.');
    }
    url.searchParams.set('audience', AUDIENCE);
  } catch (error) {
    const message = String(error?.message || '');
    if (message.startsWith('OIDC request URL validation failed:')) throw error;
    // Do not echo the input URL or raw URL-parser errors.
    throw new Error('GitHub Actions did not provide a parseable trusted HTTPS OIDC request URL.');
  }
  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: 'Bearer ' + requestToken, Accept: 'application/json' },
      redirect: 'error',
      signal: timeout(15_000),
    });
  } catch {
    throw new Error('GitHub OIDC token request failed; no provider credential was requested or exposed.');
  }
  const body = await readJsonResponse(response, 100_000);
  const token = String(body.value || '').trim();
  if (!response.ok || !token || token.length > 12_000) {
    throw new Error('GitHub did not issue the expected short-lived OIDC token.');
  }
  return token;
}
async function waitForEndpoint(origin, expectedCommitSha) {
  const deadline = Date.now() + DEPLOYMENT_WAIT_MS;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const response = await fetch(origin + ROUTE, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: timeout(10_000),
      });
      const body = await readJsonResponse(response, 30_000);
      // This route deliberately answers GET with 405 before authentication. It
      // is a safe readiness probe and does not trigger a model call. If the
      // deployed function exposes its build metadata, reject stale/mismatched code.
      if (response.status === 405 && body.error === 'METHOD_NOT_ALLOWED') {
        const deployedSha = String(body.deployment?.commitSha || '').trim().toLowerCase();
        const deployedBranch = String(body.deployment?.branch || '').trim();
        // Fail closed: no generation call until the canonical URL proves it is
        // serving the exact main SHA whose successful production deploy was read
        // through Cloudflare's API. Missing metadata is not treated as a match.
        if (deployedSha === expectedCommitSha.toLowerCase() && deployedBranch === 'main') return;
      }
    } catch {
      // During a deployment the old Pages version may serve HTML/404 instead
      // of this route. Treat all readiness-probe failures as "not ready yet";
      // only the later single POST can start generation or incur model cost.
    }
    if (attempt % 6 === 0) console.log('Waiting for the current Cloudflare Pages deployment to expose the acceptance endpoint (readiness checks only).');
    await new Promise(resolve => setTimeout(resolve, Math.min(10_000, 2_000 + attempt * 500)));
  }
  throw new Error('The live-generation endpoint did not become ready on the canonical Cloudflare Pages deployment. No generation requests were sent.');
}
function safeGeneratedPath(raw) {
  const value = String(raw || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!value || value.length > 400 || value.split('/').some(part => !part || part === '.' || part === '..') ||
      /^(?:functions|node_modules|dist|build|coverage|\.git|\.env)(?:\/|$)/i.test(value)) {
    throw new Error('The Cloudflare-generated artifact included an unsafe file path.');
  }
  return value;
}
function fromCloudflareOrActions(name) {
  if (Object.prototype.hasOwnProperty.call(cloudflareRuntimePublicSettings, name)) {
    return { value: String(cloudflareRuntimePublicSettings[name] || '').trim(), source: 'cloudflare-production' };
  }
  const value = String(process.env[name] || '').trim();
  return { value, source: value ? 'github-actions-variable' : 'not-configured' };
}
function safePublicHttpsUrl(raw) {
  try {
    const url = new URL(String(raw || '').trim());
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    if ([...url.searchParams.keys()].some(key => /(?:api[-_]?key|access[-_]?key|token|secret|auth|signature|credential|password)/i.test(key))) return '';
    if (/(?:^|\.)localhost$/i.test(url.hostname) || /\.(?:local|internal)$/i.test(url.hostname)) return '';
    return url.href;
  } catch { return ''; }
}
function safeFieldPath(raw) {
  const value = String(raw || '').trim();
  return value.length <= 200 && /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/.test(value) ? value : '';
}
async function writeWorkflowOutputs(settings) {
  const target = String(process.env.GITHUB_OUTPUT || '').trim();
  if (!target) return;
  const outputs = {
    listings_url: settings.listingsUrl,
    listings_source_authority: settings.listingsAuthoritative ? 'authoritative' : '',
    listings_json_path: settings.listingJsonPath,
    listing_id_field: settings.listingIdField,
    listing_title_field: settings.listingTitleField,
    listing_location_field: settings.listingLocationField,
    listing_status_field: settings.listingStatusField,
    enquiry_url: settings.enquiryUrl,
    external_enquiry_authorized: settings.externalEnquiryAuthorized ? 'true' : 'false',
  };
  const text = Object.entries(outputs)
    .map(([key, value]) => key + '=' + String(value || '').replace(/[\r\n]/g, '') + '\n')
    .join('');
  await fs.appendFile(target, text, 'utf8');
}
function publicSettings() {
  const listingUrlSetting = fromCloudflareOrActions('OVYX_EVAL_LISTINGS_PUBLIC_BROWSER_URL');
  const enquiryUrlSetting = fromCloudflareOrActions('OVYX_EVAL_PUBLIC_ENQUIRY_URL');
  const authoritySetting = fromCloudflareOrActions('OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY');
  const probeSetting = fromCloudflareOrActions('OVYX_EVAL_ENABLE_EXTERNAL_ENQUIRY_PROBE');
  const listingsUrl = safePublicHttpsUrl(listingUrlSetting.value);
  const enquiryUrl = safePublicHttpsUrl(enquiryUrlSetting.value);
  const listingsAuthoritative = listingsUrl.length > 0 && authoritySetting.value.toLowerCase() === 'authoritative';
  const recipientConfigured = Boolean(String(process.env.OVYX_EVAL_ENQUIRY_TEST_RECIPIENT || '').trim());
  const externalEnquiryAuthorized = probeSetting.value.toLowerCase() === 'true' && recipientConfigured && Boolean(enquiryUrl);
  const field = name => safeFieldPath(fromCloudflareOrActions(name).value);
  const settings = {
    listingsUrl,
    listingsAuthoritative,
    listingJsonPath: field('OVYX_EVAL_LISTINGS_JSON_PATH'),
    listingIdField: field('OVYX_EVAL_LISTING_ID_FIELD'),
    listingTitleField: field('OVYX_EVAL_LISTING_TITLE_FIELD'),
    listingLocationField: field('OVYX_EVAL_LISTING_LOCATION_FIELD'),
    listingStatusField: field('OVYX_EVAL_LISTING_STATUS_FIELD'),
    enquiryUrl,
    externalEnquiryAuthorized,
  };
  // Pass only sanitized public URLs, field paths, and approvals to the Pages
  // route and downstream browser/integration steps. No AI keys, private feed
  // tokens, enquiry tokens, or test-recipient address are read from Cloudflare
  // project metadata or sent back to the workflow.
  console.log(JSON.stringify({
    event: 'live-acceptance-public-settings',
    listingsUrlConfigured: Boolean(listingsUrl),
    listingsUrlRejected: Boolean(listingUrlSetting.value && !listingsUrl),
    listingsAuthoritative,
    enquiryUrlConfigured: Boolean(enquiryUrl),
    enquiryUrlRejected: Boolean(enquiryUrlSetting.value && !enquiryUrl),
    externalEnquiryAuthorized,
    sources: {
      listingsUrl: listingUrlSetting.source,
      listingsAuthority: authoritySetting.source,
      enquiryUrl: enquiryUrlSetting.source,
      externalEnquiryOptIn: probeSetting.source,
    },
  }));
  return settings;
}
async function writeGeneratedSite(caseId, responseBody) {
  const files = responseBody.files;
  const metadata = responseBody.metadata;
  if (!files || typeof files !== 'object' || Array.isArray(files) ||
      !metadata || metadata.id !== caseId || metadata.provider === undefined) {
    throw new Error('Cloudflare generation response was missing the expected site artifacts or metadata for ' + caseId + '.');
  }
  const destination = path.join(OUTPUT, caseId);
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  const written = [];
  for (const [rawName, value] of Object.entries(files)) {
    const relative = safeGeneratedPath(rawName);
    if (typeof value !== 'string' || !value.trim()) continue;
    if (value.length > 120_000) throw new Error('Generated file exceeded its per-file size limit.');
    const target = path.resolve(destination, relative);
    if (!target.startsWith(destination + path.sep)) throw new Error('Generated path escaped its site output directory.');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, value, 'utf8');
    written.push(relative);
  }
  if (!written.some(file => /\.html?$/i.test(file))) {
    throw new Error('Cloudflare returned no HTML pages for ' + caseId + '.');
  }
  await fs.writeFile(path.join(destination, 'ovyx-live-generation.json'), JSON.stringify({
    ...metadata,
    generatedFiles: written,
    liveGenerationTransport: 'Cloudflare Pages runtime + short-lived GitHub OIDC',
  }, null, 2) + '\n');
  return {
    id: caseId,
    industry: metadata.industry,
    country: metadata.market?.country || null,
    provider: metadata.provider,
    model: metadata.model || null,
    pageCount: metadata.totalPages || metadata.siteMap?.pages?.length || null,
    fileCount: written.length,
    inventoryHonesty: metadata.inventoryHonesty?.status || 'unavailable',
    realListingsConfirmed: false,
    realEnquiryDeliveryConfirmed: false,
  };
}
async function generateOne(origin, provider, model, integrationSettings, caseId) {
  // Mint a fresh short-lived token immediately before each billable generation.
  const token = await getOidcToken();
  const payload = { caseId, provider, model, publicSettings: integrationSettings };
  let response;
  try {
    response = await fetch(origin + ROUTE, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      redirect: 'error',
      signal: timeout(12 * 60 * 1000),
    });
  } catch (error) {
    // Do not retry a generation POST after a transport timeout: the provider
    // may have completed and billing may already have occurred.
    throw new Error('The single generation request for ' + caseId + ' failed at the transport layer (' +
      (error?.name === 'AbortError' ? 'timeout' : 'network error') +
      '). Inspect the workflow logs before retrying to avoid duplicate billable work.');
  }
  const body = await readJsonResponse(response);
  if (!response.ok || body.ok !== true) {
    const code = String(body.error || 'LIVE_GENERATION_FAILED').slice(0, 100);
    const detail = /^[a-z0-9-]{1,80}$/.test(String(body.detail || '')) ? ', ' + body.detail : '';
    const allowedProviders = new Set(['gemini', 'claude', 'deepseek', 'openai', 'groq', 'openrouter', 'cloudflare-workers-ai']);
    const allowedKinds = new Set(['not-configured', 'authentication-rejected', 'permission-denied', 'model-or-endpoint-not-found', 'request-rejected', 'rate-limited-or-quota', 'provider-server-error', 'timeout', 'network-error', 'empty-response', 'invalid-response', 'provider-error']);
    const providerAttempts = (Array.isArray(body.providerAttempts) ? body.providerAttempts : []).slice(0, 7)
      .filter(item => allowedProviders.has(String(item?.provider || '')) && allowedKinds.has(String(item?.kind || '')))
      .map(item => ({
        provider: String(item.provider),
        kind: String(item.kind),
        ...(Number.isInteger(Number(item.status)) && Number(item.status) >= 400 && Number(item.status) <= 599 ? { status: Number(item.status) } : {}),
      }));
    if (providerAttempts.length) {
      console.error(JSON.stringify({ event: 'live-generation-provider-diagnostics', caseId, providerAttempts }));
    }
    const attempts = providerAttempts.length
      ? ', attempts=' + providerAttempts.map(item => item.provider + ':' + item.kind + (item.status ? '-http-' + item.status : '')).join('|')
      : '';
    throw new Error('Cloudflare generation for ' + caseId + ' returned HTTP ' + response.status + ' (' + code + detail + attempts + ').');
  }
  return writeGeneratedSite(caseId, body);
}
async function main() {
  await fs.mkdir(OUTPUT, { recursive: true });
  const cloudflare = await cloudflareProjectOrigin();
  const expectedCommitSha = required('GITHUB_SHA');
  await waitForCurrentProductionDeployment(cloudflare, expectedCommitSha);
  await waitForEndpoint(cloudflare.origin, expectedCommitSha);
  const provider = String(process.env.OVYX_EVAL_PROVIDER || 'automatic').trim().toLowerCase();
  const model = String(process.env.OVYX_EVAL_MODEL || '').trim();
  const settings = publicSettings();
  await writeWorkflowOutputs(settings);
  const sites = [];
  for (const caseId of CASE_IDS) {
    const site = await generateOne(cloudflare.origin, provider, model, settings, caseId);
    sites.push(site);
    console.log(JSON.stringify({ event: 'cloudflare-live-site-generated', id: site.id, industry: site.industry, country: site.country, provider: site.provider, model: site.model, pageCount: site.pageCount }));
  }
  await fs.writeFile(path.join(OUTPUT, 'live-generation-report.json'), JSON.stringify({
    schemaVersion: 1,
    status: 'generated-awaiting-browser-and-integration-audits',
    generatedAt: new Date().toISOString(),
    sites,
    realSitesGenerated: sites.length,
    cloudflareRuntimeConfigInventory,
    realListingsConfirmed: false,
    realEnquiryDeliveryConfirmed: false,
    limits: [
      'Real model generation ran through the production Cloudflare Pages runtime; no provider API key was copied to GitHub Actions.',
      'Real property records require a separate authoritative-feed check and visible active records in the rendered page.',
      'Actual enquiry delivery requires an explicitly owner-authorized destination and provider delivery receipt.',
      'Human visual and editorial review remain separate from automated browser heuristics.',
    ],
  }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'generated-awaiting-browser-and-integration-audits', realSitesGenerated: sites.length, sites: sites.map(site => site.id) }, null, 2));
}

main().catch(error => {
  // Never print request headers, OIDC tokens, or Cloudflare API response bodies.
  console.error('OVYX Cloudflare-backed live generation failed:', String(error?.message || 'Unknown failure').slice(0, 500));
  process.exitCode = 1;
});
