import fs from 'node:fs/promises';
import path from 'node:path';

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
  const subdomain = String(payload.result.subdomain || '').trim().toLowerCase();
  if (!subdomain || !/^[a-z0-9][a-z0-9-]*\.pages\.dev$/.test(subdomain)) {
    throw new Error('Cloudflare did not return a valid canonical Pages subdomain for this project.');
  }
  return 'https://' + subdomain;
}
async function getOidcToken() {
  const rawUrl = required('ACTIONS_ID_TOKEN_REQUEST_URL');
  const requestToken = required('ACTIONS_ID_TOKEN_REQUEST_TOKEN');
  let url;
  try {
    url = new URL(rawUrl);
    url.searchParams.set('audience', AUDIENCE);
  } catch {
    throw new Error('GitHub Actions did not provide a valid OIDC request URL.');
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
async function waitForEndpoint(origin) {
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
      // is a safe readiness probe and does not trigger a model call.
      if (response.status === 405 && body.error === 'METHOD_NOT_ALLOWED') return;
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
function publicSettings() {
  const listingsUrl = String(process.env.OVYX_EVAL_LISTINGS_PUBLIC_BROWSER_URL || '').trim();
  const enquiryUrl = String(process.env.OVYX_EVAL_PUBLIC_ENQUIRY_URL || '').trim();
  const listingsAuthoritative = String(process.env.OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY || '').trim().toLowerCase() === 'authoritative';
  const externalEnquiryAuthorized = String(process.env.OVYX_EVAL_ENABLE_EXTERNAL_ENQUIRY_PROBE || '').trim().toLowerCase() === 'true' &&
    Boolean(String(process.env.OVYX_EVAL_ENQUIRY_TEST_RECIPIENT || '').trim());
  // Only public, browser-safe URLs and boolean approvals are sent to Cloudflare.
  // Private feed tokens, enquiry tokens, provider keys, and recipient addresses stay out of this request.
  return {
    listingsUrl,
    listingsAuthoritative,
    enquiryUrl,
    externalEnquiryAuthorized,
  };
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
    throw new Error('Cloudflare generation for ' + caseId + ' returned HTTP ' + response.status + ' (' + code + ').');
  }
  return writeGeneratedSite(caseId, body);
}
async function main() {
  await fs.mkdir(OUTPUT, { recursive: true });
  const origin = await cloudflareProjectOrigin();
  await waitForEndpoint(origin);
  const provider = String(process.env.OVYX_EVAL_PROVIDER || 'automatic').trim().toLowerCase();
  const model = String(process.env.OVYX_EVAL_MODEL || '').trim();
  const settings = publicSettings();
  const sites = [];
  for (const caseId of CASE_IDS) {
    const site = await generateOne(origin, provider, model, settings, caseId);
    sites.push(site);
    console.log(JSON.stringify({ event: 'cloudflare-live-site-generated', id: site.id, industry: site.industry, country: site.country, provider: site.provider, model: site.model, pageCount: site.pageCount }));
  }
  await fs.writeFile(path.join(OUTPUT, 'live-generation-report.json'), JSON.stringify({
    schemaVersion: 1,
    status: 'generated-awaiting-browser-and-integration-audits',
    generatedAt: new Date().toISOString(),
    sites,
    realSitesGenerated: sites.length,
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
