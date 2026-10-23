import { buildStudioMultiPage } from '../../_lib/studio-multipage.js';
import { callModel } from '../../_lib/providers.js';
import { buildExperienceBrief } from '../../_lib/experience.js';
import { WEB_STUDIO_EXCELLENCE } from '../../_lib/prompts.js';
import { getProductionIntegrationState } from '../../_lib/integration-state.js';

const EXPECTED_ISSUER = 'https://token.actions.githubusercontent.com';
const EXPECTED_AUDIENCE = 'ovyx-live-site-evaluation';
const EXPECTED_REPOSITORY = 'thompsonemmanuel117-sketch/ovyx';
const EXPECTED_REPOSITORY_ID = '1333698814';
const EXPECTED_OWNER = 'thompsonemmanuel117-sketch';
const EXPECTED_WORKFLOW = EXPECTED_REPOSITORY + '/.github/workflows/ovyx-webstudio-live-generation.yml@refs/heads/main';
const JWKS_URL = 'https://token.actions.githubusercontent.com/.well-known/jwks';
const MAX_BODY_BYTES = 24_000;
const MAX_TOKEN_LENGTH = 12_000;
const MAX_TOKEN_LIFETIME_SECONDS = 15 * 60;
const QA_ENDPOINT = '/.well-known/ovyx-qa-enquiry';
const REPO_ALLOWED_EVENTS = new Set(['push', 'workflow_dispatch']);
let jwksCache = null;
let jwksCacheExpiresAt = 0;

const CASES = Object.freeze({
  'nigeria-lagos-real-estate': {
    id: 'nigeria-lagos-real-estate',
    industry: 'real-estate',
    market: { country: 'Nigeria', locale: 'en-NG', currency: 'NGN', language: 'en', timeZone: 'Africa/Lagos' },
    title: 'Lagos property advisory',
    prompt: 'Create a four-page multi-page website for a thoughtful, design-led Lagos property advisory: Home, Property Listings, About, Contact. Audience: home buyers and renters in Lagos, Nigeria. Market rules: English (Nigeria), NGN / ₦, Africa/Lagos. Art direction: calm architectural editorial, strong serif/sans contrast, warm stone and dark ink, asymmetrical composition, refined real-estate photography treatment and a clear one-thumb mobile enquiry journey. No real property inventory feed or client contact details are supplied. Do not invent real property addresses, listing prices, availability, agents, testimonials, coordinates or verification badges. Show a clear honest live-inventory-not-connected empty state, or only visibly labelled illustrative sample cards.',
  },
  'uk-independent-restaurant': {
    id: 'uk-independent-restaurant',
    industry: 'restaurant',
    market: { country: 'United Kingdom', locale: 'en-GB', currency: 'GBP', language: 'en', timeZone: 'Europe/London' },
    title: 'Independent neighbourhood restaurant',
    prompt: 'Create a four-page multi-page website for an independent neighbourhood restaurant in the United Kingdom: Home, Menu, Our Story, Contact. Market: English (UK), GBP / £, Europe/London. Art direction: tactile food-editorial, oversized culinary typography, warm natural-light visual language, a strong menu hierarchy and quick mobile visit/enquiry path; avoid generic three-card template styling. No actual restaurant address, opening hours, menu, booking system, social profile or client contact is supplied. Do not invent these as business facts; clearly label illustrative menu content and use honest setup states where details are missing.',
  },
  'us-independent-fashion': {
    id: 'us-independent-fashion',
    industry: 'fashion',
    market: { country: 'United States', locale: 'en-US', currency: 'USD', language: 'en', timeZone: 'America/New_York' },
    title: 'Independent fashion label',
    prompt: 'Create a four-page multi-page website for an independent contemporary fashion label: Home, Collection, Materials & Fit, Contact. Market: United States, English (US), USD / $, America/New_York. Art direction: confident fashion-editorial, deliberately art-directed campaign composition, generous whitespace, distinctive type scale, image-led collection discovery, accessible size/fit information and subtle purposeful transitions. No actual product feed, inventory, prices, shipping policy, social accounts or business contact is supplied. Do not invent live stock or claim checkout is connected; clearly label any illustrative products.',
  },
  'japan-product-software': {
    id: 'japan-product-software',
    industry: 'saas',
    market: { country: 'Japan', locale: 'ja-JP', currency: 'JPY', language: 'ja', timeZone: 'Asia/Tokyo' },
    title: 'Japanese workflow software',
    prompt: 'Create a four-page multi-page website for a new workflow software product serving teams in Japan: Home, Product, How It Works, Contact. Market: Japanese language (ja-JP), JPY / ¥, Asia/Tokyo. Art direction: precise editorial technology, disciplined grid, high typographic craft, purposeful product-interface illustrations made locally in HTML/CSS/SVG, calm interaction design and a clear product story. No verified customer logos, testimonials, integrations, pricing, business contact or product metrics are supplied. Do not invent these as facts; mark any illustrative product UI as a demonstration. All user-facing copy should be natural Japanese, not a machine-translated English shell.',
  },
});

const QA_CONTRACT = [
  'QA-ONLY EVALUATION CONTRACT (this generated artifact will be tested on a local isolated server and is NOT a publishable client site):',
  '1. Include one clearly labelled QA-only enquiry form on the Contact page, with properly associated labels and required-field validation.',
  '2. Use method="post" and action="/.well-known/ovyx-qa-enquiry". Prevent default navigation and submit with fetch to that exact relative path. Disable submit while pending. Parse the response and show success only for response.ok; keep values and show an error state otherwise. This isolated form does not send email, WhatsApp, social messages, or real customer leads.',
  '3. Clearly mark this as an isolated QA artifact, not for publication. Never treat the .well-known endpoint as a real integration.',
  '4. Do not load remote images, fonts, stylesheets, scripts, analytics or icon libraries. Use authored local CSS/SVG or self-contained HTML.',
  '5. Every visible navigation link and CTA needs a meaningful destination or visible behavior. No href="#", javascript: links, dead buttons, placeholders, or fabricated live business data.',
  '6. Provide semantic HTML, market-matched language metadata, title, meta description, viewport, accessible contrast, visible keyboard focus, responsive design and prefers-reduced-motion support.',
].join('\n');

function decodeBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function decodeJsonPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}
function jwksFailure(code) {
  return Object.assign(new Error('GitHub OIDC signing keys are unavailable.'), { code });
}

function trustedJwksResponseUrl(rawUrl) {
  let url;
  try { url = new URL(String(rawUrl || JWKS_URL)); } catch { return false; }
  return url.protocol === 'https:' &&
    url.hostname.toLowerCase().replace(/\.$/, '') === 'token.actions.githubusercontent.com' &&
    !url.username && !url.password && !url.port;
}

function safeJwksFailureDetail(error) {
  const code = String(error?.code || '');
  if (/^jwks-http-[1-5]\d\d$/.test(code)) return code;
  if (['jwks-fetch-failed', 'jwks-final-url-untrusted', 'jwks-invalid-json', 'jwks-empty-key-set'].includes(code)) return code;
  return 'jwks-fetch-failed';
}

async function getGithubJwks(fetchImpl, nowSeconds) {
  if (jwksCache && jwksCacheExpiresAt > nowSeconds) return jwksCache;
  let response;
  try {
    // Some network edges redirect this public metadata request. Follow HTTPS
    // redirects, but accept keys only if the final response still comes from
    // GitHub's exact OIDC issuer host. No bearer token is sent to this endpoint.
    response = await fetchImpl(JWKS_URL, {
      headers: { Accept: 'application/json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw jwksFailure('jwks-fetch-failed');
  }
  if (!trustedJwksResponseUrl(response.url || JWKS_URL)) throw jwksFailure('jwks-final-url-untrusted');
  if (!response.ok) throw jwksFailure('jwks-http-' + String(response.status));
  let data;
  try { data = await response.json(); }
  catch { throw jwksFailure('jwks-invalid-json'); }
  if (!Array.isArray(data?.keys) || !data.keys.length) throw jwksFailure('jwks-empty-key-set');
  jwksCache = data.keys;
  jwksCacheExpiresAt = nowSeconds + 10 * 60;
  return jwksCache;
}

export async function verifyGithubOidcToken(token, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const nowSeconds = Number.isFinite(options.nowSeconds) ? options.nowSeconds : Math.floor(Date.now() / 1000);
  const raw = String(token || '').trim();
  if (!raw || raw.length > MAX_TOKEN_LENGTH) return { ok: false, reason: 'token-size-invalid' };
  const parts = raw.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'token-shape-invalid' };

  let header, claims;
  try {
    header = decodeJsonPart(parts[0]);
    claims = decodeJsonPart(parts[1]);
  } catch {
    return { ok: false, reason: 'token-encoding-invalid' };
  }
  if (header?.alg !== 'RS256' || typeof header?.kid !== 'string' || !header.kid) {
    return { ok: false, reason: 'token-algorithm-invalid' };
  }
  const audienceMatches = claims?.aud === EXPECTED_AUDIENCE ||
    (Array.isArray(claims?.aud) && claims.aud.length === 1 && claims.aud[0] === EXPECTED_AUDIENCE);
  if (claims?.iss !== EXPECTED_ISSUER || !audienceMatches) return { ok: false, reason: 'issuer-or-audience-invalid' };

  const issued = Number(claims.iat), expires = Number(claims.exp);
  const hasNotBefore = claims.nbf !== undefined && claims.nbf !== null;
  const notBefore = hasNotBefore ? Number(claims.nbf) : null;
  if (!Number.isFinite(issued) || !Number.isFinite(expires) ||
      issued > nowSeconds + 60 || expires <= nowSeconds ||
      expires <= issued || expires - issued > MAX_TOKEN_LIFETIME_SECONDS ||
      (hasNotBefore && (!Number.isFinite(notBefore) || notBefore > nowSeconds + 60))) {
    return { ok: false, reason: 'token-time-invalid' };
  }
  if (
    String(claims.repository || '') !== EXPECTED_REPOSITORY ||
    String(claims.repository_id || '') !== EXPECTED_REPOSITORY_ID ||
    String(claims.repository_owner || '') !== EXPECTED_OWNER ||
    String(claims.ref || '') !== 'refs/heads/main' ||
    String(claims.workflow_ref || '') !== EXPECTED_WORKFLOW ||
    !REPO_ALLOWED_EVENTS.has(String(claims.event_name || '')) ||
    !String(claims.jti || '')
  ) {
    return { ok: false, reason: 'workflow-identity-not-authorized' };
  }

  let jwks;
  try {
    jwks = await getGithubJwks(fetchImpl, nowSeconds);
  } catch (error) {
    return { ok: false, reason: 'jwks-unavailable', detail: safeJwksFailureDetail(error) };
  }
  let jwk = jwks.find(item => item?.kid === header.kid && item?.kty === 'RSA' && item?.use !== 'enc');
  if (!jwk) {
    // GitHub may rotate signing keys while this isolate still has a cached JWKS.
    jwksCache = null;
    jwksCacheExpiresAt = 0;
    try {
      jwks = await getGithubJwks(fetchImpl, nowSeconds);
      jwk = jwks.find(item => item?.kid === header.kid && item?.kty === 'RSA' && item?.use !== 'enc');
    } catch (error) { return { ok: false, reason: 'jwks-unavailable', detail: safeJwksFailureDetail(error) }; }
  }
  if (!jwk) return { ok: false, reason: 'signing-key-not-found' };

  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const signedData = new TextEncoder().encode(parts[0] + '.' + parts[1]);
    const signature = decodeBase64Url(parts[2]);
    const valid = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      signature,
      signedData,
    );
    if (!valid) return { ok: false, reason: 'signature-invalid' };
  } catch {
    return { ok: false, reason: 'signature-invalid' };
  }
  return {
    ok: true,
    claims: {
      repository: EXPECTED_REPOSITORY,
      ref: 'refs/heads/main',
      workflow: EXPECTED_WORKFLOW,
      eventName: String(claims.event_name),
      runId: String(claims.run_id || '').slice(0, 40),
    },
  };
}

function safePublicHttpsUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if ([...url.searchParams.keys()].some(key => /(?:api[-_]?key|access[-_]?key|token|secret|auth|signature|credential|password)/i.test(key))) return null;
    if (/(?:^|\.)localhost$/i.test(url.hostname) || /\.(?:local|internal)$/i.test(url.hostname)) return null;
    return url;
  } catch { return null; }
}
function settingsFromRequest(raw) {
  const settings = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const listed = safePublicHttpsUrl(settings.listingsUrl);
  const enquiry = safePublicHttpsUrl(settings.enquiryUrl);
  return {
    listingsUrl: settings.listingsAuthoritative === true ? listed : null,
    enquiryUrl: settings.externalEnquiryAuthorized === true ? enquiry : null,
  };
}
export function chooseProvider(env, requested) {
  const aliases = { anthropic: 'claude', claude: 'claude', chatgpt: 'openai', gpt: 'openai', cloudflare: 'cloudflare-workers-ai', 'workers-ai': 'cloudflare-workers-ai' };
  const canonical = value => aliases[String(value || '').trim().toLowerCase()] || String(value || '').trim().toLowerCase();
  const configured = provider => {
    switch (provider) {
      case 'gemini': return Boolean(String(env.GEMINI_API_KEY || '').trim());
      case 'deepseek': return Boolean(String(env.DEEPSEEK_API_KEY || '').trim());
      case 'claude': return Boolean(String(env.ANTHROPIC_API_KEY || '').trim());
      case 'openai': return Boolean(String(env.OPENAI_API_KEY || '').trim());
      case 'groq': return Boolean(String(env.GROQ_API_KEY || '').trim());
      case 'openrouter': return Boolean(String(env.OPENROUTER_API_KEY || '').trim());
      case 'cloudflare-workers-ai': return Boolean(env.AI && typeof env.AI.run === 'function');
      default: return false;
    }
  };
  const provider = canonical(requested || 'automatic');
  if (provider !== 'automatic') return configured(provider) ? provider : null;
  // Let OVYX's established provider router choose and fall back among configured
  // Cloudflare runtime providers, instead of pinning the request to the first
  // non-empty secret and failing when that provider is temporarily unavailable.
  return ['gemini', 'deepseek', 'claude', 'openai', 'groq', 'openrouter', 'cloudflare-workers-ai'].some(configured)
    ? 'automatic'
    : null;
}
function safePath(value) {
  const path = String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!path || path.length > 400 || path.split('/').some(part => !part || part === '.' || part === '..') ||
      path.startsWith('functions/') || /^(?:node_modules|dist|build|coverage|\.git|\.env)(?:\/|$)/i.test(path)) {
    throw new Error('Generated file path was rejected by the live-evaluation safety check.');
  }
  return path;
}
function inventoryHonesty(caseItem, files, listingsConfigured) {
  if (caseItem.industry !== 'real-estate') return { status: 'not-applicable', passesHonestyGate: true, realListingsConfirmed: false };
  const source = Object.values(files).map(String).join('\n');
  const emptyState = /(?:live inventory|listing feed|property feed|inventory feed).{0,100}(?:not connected|not configured|connect|unavailable|not yet)|(?:connect|configure).{0,100}(?:listing|property|inventory).{0,100}(?:feed|source|api)|no live (?:property )?listings/i.test(source);
  const examples = /(?:illustrative sample|sample propert|sample listing|demo listing|example listing|not live inventory|sample data|demo data)/i.test(source);
  const listingLanguage = /\b(?:property listings?|real estate|bedrooms?|rental properties|properties for sale)\b/i.test(source);
  const fabricated = !listingsConfigured && /\b(?:verified listing|live listings?|available now|real-time listings?|current inventory)\b/i.test(source) && !/\b(?:not connected|not configured|sample|demo|illustrative)\b/i.test(source);
  return {
    status: fabricated ? 'fail-unverified-live-inventory-claim'
      : listingLanguage && !listingsConfigured && !(emptyState || examples) ? 'fail-inventory-provenance-missing'
      : listingsConfigured && listingLanguage ? 'public-feed-configured-inventory-awaiting-live-integration-proof'
      : emptyState ? 'honest-empty-state-live-feed-not-configured'
      : examples ? 'illustrative-data-labelled'
      : 'no-live-inventory-evidence',
    passesHonestyGate: !fabricated && (listingsConfigured || !listingLanguage || emptyState || examples),
    realListingsConfirmed: false,
  };
}
async function readBoundedJson(request) {
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error('Request body is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(merged));
}

const SAFE_PROVIDER_FAILURE_KINDS = new Set([
  'not-configured',
  'authentication-rejected',
  'permission-denied',
  'model-or-endpoint-not-found',
  'request-rejected',
  'rate-limited-or-quota',
  'provider-server-error',
  'timeout',
  'network-error',
  'empty-response',
  'invalid-response',
  'provider-error',
]);

export function safeLiveGenerationProviderAttempts(error) {
  const allowedProviders = new Set(['gemini', 'claude', 'deepseek', 'openai', 'groq', 'openrouter', 'cloudflare-workers-ai']);
  const input = Array.isArray(error?.providerAttempts) ? error.providerAttempts : [];
  const result = [];
  for (const item of input.slice(0, 7)) {
    const provider = String(item?.provider || '');
    const kind = String(item?.kind || '');
    const status = Number(item?.status);
    if (!allowedProviders.has(provider) || !SAFE_PROVIDER_FAILURE_KINDS.has(kind)) continue;
    result.push({
      provider,
      kind,
      ...(Number.isInteger(status) && status >= 400 && status <= 599 ? { status } : {}),
    });
  }
  return result;
}

export function safeLiveGenerationFailureDetail(error) {
  const code = String(error?.code || '').toUpperCase();
  const status = Number(error?.status);
  const hasHttpStatus = Number.isInteger(status) && status >= 400 && status <= 599;
  if (code === 'AI_PROVIDER_REQUEST_FAILED') {
    return 'ai-provider-request-failed' + (hasHttpStatus ? '-http-' + status : '');
  }
  if (code === 'AI_PROVIDER_NOT_CONFIGURED') return 'ai-provider-not-configured';
  if (code === 'AI_PROVIDER_UNSUPPORTED') return 'ai-provider-unsupported';
  if (code === 'AI_PROVIDER_UNAVAILABLE') return 'ai-provider-unavailable';
  if (code === 'PROMPT_REQUIRED') return 'prompt-required';
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return 'upstream-timeout';
  if (error?.name === 'TypeError') return 'upstream-network-error';
  return 'generation-error';
}

export async function handleLiveGenerationRequest(request, env, options = {}) {
  if (request.method !== 'POST') {
    return Response.json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ ok: false, error: 'ORIGIN_REJECTED' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return Response.json({ ok: false, error: 'AUTH_REQUIRED' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const verified = await verifyGithubOidcToken(match[1], options);
  if (!verified.ok) {
    return Response.json({
      ok: false,
      error: verified.reason === 'jwks-unavailable' ? 'AUTH_VERIFIER_UNAVAILABLE' : 'AUTH_NOT_AUTHORIZED',
      ...(verified.reason === 'jwks-unavailable' && verified.detail ? { detail: verified.detail } : {}),
    }, {
      status: verified.reason === 'jwks-unavailable' ? 503 : 403,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: 'BODY_TOO_LARGE' }, { status: 413, headers: { 'Cache-Control': 'no-store' } });
  }
  let payload;
  try {
    payload = await readBoundedJson(request);
  } catch {
    return Response.json({ ok: false, error: 'INVALID_JSON_OR_BODY_TOO_LARGE' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      Object.keys(payload).some(key => !['caseId', 'provider', 'model', 'publicSettings'].includes(key)) ||
      !Object.hasOwn(CASES, String(payload.caseId || ''))) {
    return Response.json({ ok: false, error: 'EVALUATION_CASE_NOT_ALLOWED' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  const caseItem = CASES[payload.caseId];
  let integrationState;
  try {
    integrationState = await getProductionIntegrationState(env);
  } catch {
    return Response.json({ ok: false, error: 'INTEGRATION_STATE_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  if (integrationState?.live !== true) {
    return Response.json({ ok: false, error: 'PRODUCTION_INTEGRATIONS_PAUSED' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const provider = chooseProvider(env, payload.provider || 'automatic');
  if (!provider) {
    return Response.json({ ok: false, error: 'NO_CONFIGURED_AI_PROVIDER' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const publicSettings = settingsFromRequest(payload.publicSettings);
  const qaContract = publicSettings.enquiryUrl
    ? QA_CONTRACT + '\n\nPUBLIC CONTACT FORM SEPARATION: The primary customer form must target the exact owner-approved public endpoint supplied for this isolated QA run. The separate QA-only form targets only ' + QA_ENDPOINT + '. Do not include secrets in any generated file. All test requests to the public endpoint must use source:"OVYX QA", test:true and dryRun:false. Only an explicit delivery receipt counts as delivered.'
    : QA_CONTRACT + '\n\nNO PUBLIC ENQUIRY ENDPOINT IS CONFIGURED. Do not invent or infer a destination. Include an honest setup state for real enquiries. Test the isolated QA-only form locally; it is not a client-contact integration.';
  // Keep the same QA-only form requirements in the main brief and the production
  // quality contract so requirement planning and generation agree about them.
  const prompt = buildEvaluationPrompt(caseItem, publicSettings) + '\n\n' + qaContract;
  const model = String(payload.model || '').trim().slice(0, 140);
  const context = {
    ...caseItem.market,
    market: { ...caseItem.market },
    industry: caseItem.industry,
    country: caseItem.market.country,
    locale: caseItem.market.locale,
    currency: caseItem.market.currency,
    language: caseItem.market.language,
    timeZone: caseItem.market.timeZone,
    evaluationArtifact: true,
    qaOnlyEnquiryEndpoint: QA_ENDPOINT,
    publicListingsEndpointConfigured: Boolean(publicSettings.listingsUrl),
    publicEnquiryEndpointConfigured: Boolean(publicSettings.enquiryUrl),
    realInventorySourceConfigured: Boolean(publicSettings.listingsUrl),
    realEnquiryDestinationConfigured: Boolean(publicSettings.enquiryUrl),
  };
  const experience = buildExperienceBrief(prompt + '\n\n' + qaContract, context);
  let generated;
  try {
    generated = await buildStudioMultiPage({
      env: { ...env, OVYX_WEBSTUDIO_MAX_PAGES: '5', OVYX_WEBSTUDIO_MAX_BATCH_FILES: '6', OVYX_WEBSTUDIO_POLISH_ENABLED: env.OVYX_WEBSTUDIO_POLISH_ENABLED || 'true' },
      callModel,
      provider,
      model: model || undefined,
      authUser: null,
      prompt,
      project: { name: caseItem.title, pages: [] },
      files: {},
      mode: 'build',
      context: JSON.stringify({ ...context, experience }),
      qualityContract: WEB_STUDIO_EXCELLENCE + '\n\n' + qaContract,
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: 'LIVE_SITE_GENERATION_FAILED',
      caseId: caseItem.id,
      detail: safeLiveGenerationFailureDetail(error),
      providerAttempts: safeLiveGenerationProviderAttempts(error),
    }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!generated || generated.ok !== true) {
    return Response.json({
      ok: false,
      error: 'LIVE_SITE_GENERATION_FAILED',
      caseId: caseItem.id,
      detail: generated ? 'builder-result-not-ok' : 'builder-returned-empty-result',
    }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
  const files = generated.files && typeof generated.files === 'object' ? generated.files : {};
  const entries = Object.entries(files);
  if (!entries.some(([name, value]) => /\.html?$/i.test(name) && typeof value === 'string' && value.trim())) {
    return Response.json({ ok: false, error: 'LIVE_GENERATION_HTML_MISSING', caseId: caseItem.id }, { status: 422, headers: { 'Cache-Control': 'no-store' } });
  }
  const safeFiles = {};
  try {
    for (const [name, value] of entries) {
      const file = safePath(name);
      if (typeof value !== 'string' || !value.trim()) continue;
      if (value.length > 120_000) throw new Error('Generated file exceeds the evaluation file limit.');
      safeFiles[file] = value;
    }
  } catch {
    return Response.json({ ok: false, error: 'GENERATED_FILE_REJECTED', caseId: caseItem.id }, { status: 422, headers: { 'Cache-Control': 'no-store' } });
  }
  const honesty = inventoryHonesty(caseItem, safeFiles, Boolean(publicSettings.listingsUrl));
  if (honesty.passesHonestyGate === false) {
    return Response.json({ ok: false, error: 'INVENTORY_HONESTY_FAILED', caseId: caseItem.id }, { status: 422, headers: { 'Cache-Control': 'no-store' } });
  }
  const metadata = {
    id: caseItem.id,
    title: caseItem.title,
    industry: caseItem.industry,
    market: caseItem.market,
    liveInventorySourceConfigured: Boolean(publicSettings.listingsUrl),
    publicListingsEndpointConfigured: Boolean(publicSettings.listingsUrl),
    enquiryDeliveryConfigured: Boolean(publicSettings.enquiryUrl),
    qaOnlyEnquiryEndpoint: QA_ENDPOINT,
    provider: generated.provider || provider,
    model: generated.model || model || null,
    generatedAt: new Date().toISOString(),
    siteMap: generated.siteMap || null,
    totalPages: generated.totalPages || generated.siteMap?.pages?.length || null,
    generatedFiles: Object.keys(safeFiles),
    inventoryHonesty: honesty,
    evidenceLimits: [
      'Generated by the production multi-page builder using provider credentials held by the Cloudflare Pages runtime; credentials are not returned to the caller.',
      publicSettings.listingsUrl ? 'A public feed was configured; record authenticity and rendered results still require separate verification.' : 'No approved real property feed was configured; live property inventory remains unverified.',
      publicSettings.enquiryUrl ? 'An owner-approved public test endpoint was configured; actual delivery requires an explicit provider receipt.' : 'No owner-approved public enquiry endpoint was configured; actual customer delivery remains unverified.',
    ],
  };
  return Response.json({
    ok: true,
    caseId: caseItem.id,
    provider: metadata.provider,
    model: metadata.model,
    files: safeFiles,
    metadata,
  }, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function buildEvaluationPrompt(caseItem, publicSettings) {
  let prompt = caseItem.prompt;
  if (caseItem.industry === 'real-estate' && publicSettings.listingsUrl) {
    prompt = prompt
      .replace('No real property inventory feed or client contact details are supplied.', 'The owner has supplied a public, browser-readable HTTPS property-feed endpoint for this evaluation.')
      .replace('Show a clear honest live-inventory-not-connected empty state, or only visibly labelled illustrative sample cards.', 'Fetch the supplied property feed at ' + publicSettings.listingsUrl.href + ' using the browser fetch API, then render only active records returned by that endpoint, preserving stable record identifiers and source fields. Implement loading, empty, error and stale states. Do not show mock listings if the live source fails.');
  }
  if (publicSettings.enquiryUrl) {
    prompt += '\n\nPUBLIC QA ENQUIRY INTEGRATION: The owner-approved public HTTPS endpoint is ' + publicSettings.enquiryUrl.href + '. Use this as the primary Contact form action and POST JSON fields name, email, subject, message, source:"OVYX QA", test:true, dryRun:false. This is an actual controlled QA delivery (not a dry run); endpoint owner must route test messages only to the owner-controlled QA recipient. Do not add secrets/private webhook URLs to generated files. Show success only when the endpoint returns an explicit delivery receipt such as delivered:true or deliveryStatus:"delivered". An HTTP 2xx or queued/accepted result alone does not prove delivery.';
  } else {
    prompt += '\n\nNO PUBLIC ENQUIRY ENDPOINT IS CONFIGURED. Do not invent a destination. Show honest setup state for real enquiries; the isolated local QA-only form does not deliver real customer messages.';
  }
  return prompt;
}

export async function onRequest(context) {
  return handleLiveGenerationRequest(context.request, context.env);
}
