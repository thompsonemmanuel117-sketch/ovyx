import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { callModel } from '../functions/api/_lib/providers.js';
import { buildStudioMultiPage } from '../functions/_lib/studio-multipage.js';
import { buildExperienceBrief } from '../functions/_lib/experience.js';
import { WEB_STUDIO_EXCELLENCE } from '../functions/_lib/prompts.js';

const OUT = path.resolve(process.env.OVYX_LIVE_EVAL_OUT || 'artifacts/webstudio-generated-sites');
const PROVIDER = String(process.env.OVYX_EVAL_PROVIDER || 'gemini').trim().toLowerCase();
const MODEL = String(process.env.OVYX_EVAL_MODEL || '').trim();
const REQUIRED_KEY = ({ gemini: 'GEMINI_API_KEY', claude: 'ANTHROPIC_API_KEY', anthropic: 'ANTHROPIC_API_KEY', deepseek: 'DEEPSEEK_API_KEY', openai: 'OPENAI_API_KEY' })[PROVIDER];
const QA_ENDPOINT = '/.well-known/ovyx-qa-enquiry';

const CASES = [
  {
    id: 'nigeria-lagos-real-estate',
    industry: 'real-estate',
    market: { country: 'Nigeria', locale: 'en-NG', currency: 'NGN', language: 'en', timeZone: 'Africa/Lagos' },
    title: 'Lagos property advisory',
    prompt: 'Create a four-page multi-page website for a thoughtful, design-led Lagos property advisory: Home, Property Listings, About, Contact. Audience: home buyers and renters in Lagos, Nigeria. Market rules: English (Nigeria), NGN / ₦, Africa/Lagos. Art direction: calm architectural editorial, strong serif/sans contrast, warm stone and dark ink, asymmetrical composition, refined real-estate photography treatment and a clear one-thumb mobile enquiry journey. No real property inventory feed or client contact details are supplied. Do not invent real property addresses, listing prices, availability, agents, testimonials, coordinates or verification badges. Show a clear honest live-inventory-not-connected empty state, or only visibly labelled illustrative sample cards. Add a genuinely functional, accessible QA-only enquiry form as described in the QA contract below.',
  },
  {
    id: 'uk-independent-restaurant',
    industry: 'restaurant',
    market: { country: 'United Kingdom', locale: 'en-GB', currency: 'GBP', language: 'en', timeZone: 'Europe/London' },
    title: 'Independent neighbourhood restaurant',
    prompt: 'Create a four-page multi-page website for an independent neighbourhood restaurant in the United Kingdom: Home, Menu, Our Story, Contact. Market: English (UK), GBP / £, Europe/London. Art direction: tactile food-editorial, oversized culinary typography, warm natural-light visual language, a strong menu hierarchy and quick mobile visit/enquiry path; avoid generic three-card template styling. No actual restaurant address, opening hours, menu, booking system, social profile or client contact is supplied. Do not invent these as business facts; clearly label illustrative menu content and use honest setup states where details are missing. Add a genuinely functional, accessible QA-only enquiry form as described in the QA contract below.',
  },
  {
    id: 'us-independent-fashion',
    industry: 'fashion',
    market: { country: 'United States', locale: 'en-US', currency: 'USD', language: 'en', timeZone: 'America/New_York' },
    title: 'Independent fashion label',
    prompt: 'Create a four-page multi-page website for an independent contemporary fashion label: Home, Collection, Materials & Fit, Contact. Market: United States, English (US), USD / $, America/New_York. Art direction: confident fashion-editorial, deliberately art-directed campaign composition, generous whitespace, distinctive type scale, image-led collection discovery, accessible size/fit information and subtle purposeful transitions. No actual product feed, inventory, prices, shipping policy, social accounts or business contact is supplied. Do not invent live stock or claim checkout is connected; clearly label any illustrative products. Add a genuinely functional, accessible QA-only enquiry form as described in the QA contract below.',
  },
  {
    id: 'japan-product-software',
    industry: 'saas',
    market: { country: 'Japan', locale: 'ja-JP', currency: 'JPY', language: 'ja', timeZone: 'Asia/Tokyo' },
    title: 'Japanese workflow software',
    prompt: 'Create a four-page multi-page website for a new workflow software product serving teams in Japan: Home, Product, How It Works, Contact. Market: Japanese language (ja-JP), JPY / ¥, Asia/Tokyo. Art direction: precise editorial technology, disciplined grid, high typographic craft, purposeful product-interface illustrations made locally in HTML/CSS/SVG, calm interaction design and a clear product story. No verified customer logos, testimonials, integrations, pricing, business contact or product metrics are supplied. Do not invent these as facts; mark any illustrative product UI as a demonstration. All user-facing copy should be natural Japanese, not a machine-translated English shell. Add a genuinely functional, accessible QA-only enquiry form as described in the QA contract below.',
  },
];

const QA_CONTRACT = [
  'QA-ONLY EVALUATION CONTRACT (this generated artifact will be tested on a local isolated server and is NOT a publishable client site):',
  '1. Include one clearly labelled QA-only enquiry form on the Contact page, with properly associated labels and required-field validation.',
  '2. Use method="post" and action="/.well-known/ovyx-qa-enquiry". Prevent the default navigation and submit the form with fetch to that exact relative path. Disable the submit button while pending. Parse the response and show a visible success state only for response.ok; retain entered values and show a clear error state for a non-2xx response. Do not claim that this QA endpoint sends email, WhatsApp, social messages or real customer leads.',
  '3. Clearly mark each generated site as an isolated QA evaluation artifact, not for publication. Never treat the .well-known endpoint as a real integration or include it in a live client deployment.',
  '4. Do not load remote images, fonts, stylesheets, scripts, analytics or icon libraries. Use authored local CSS/SVG or self-contained HTML so the build can be checked without outside assets.',
  '5. Every visible navigation link and CTA must have a meaningful working destination or visible behavior. Do not use href="#", javascript: links, dead buttons, placeholder copy or fabricated live business data.',
  '6. Provide semantic HTML, English/Japanese language metadata matching the market, title, meta description, viewport, accessible contrast, visible keyboard focus, responsive design and prefers-reduced-motion support.',
].join('\n');

function httpsEndpoint(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if ([...url.searchParams.keys()].some(key => /(?:api[-_]?key|access[-_]?key|token|secret|auth|signature|credential|password)/i.test(key))) return null;
    if (/(?:^|\.)localhost$/i.test(url.hostname) || /\.(?:local|internal)$/i.test(url.hostname)) return null;
    return url;
  } catch { return null; }
}
export function publicIntegrationSettings() {
  const suppliedListingsUrl = httpsEndpoint(process.env.OVYX_EVAL_LISTINGS_PUBLIC_BROWSER_URL || '');
  const listingsDeclaredAuthoritative = String(process.env.OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY || '').trim().toLowerCase() === 'authoritative';
  const listingsUrl = listingsDeclaredAuthoritative ? suppliedListingsUrl : null;
  const enquiryUrl = httpsEndpoint(process.env.OVYX_EVAL_PUBLIC_ENQUIRY_URL || '');
  const probeEnabled = String(process.env.OVYX_EVAL_ENABLE_EXTERNAL_ENQUIRY_PROBE || '').trim().toLowerCase() === 'true';
  const recipient = String(process.env.OVYX_EVAL_ENQUIRY_TEST_RECIPIENT || '').trim();
  return {
    listingsUrl,
    enquiryUrl: probeEnabled && recipient ? enquiryUrl : null,
    enquiryProbeEnabled: probeEnabled && Boolean(recipient),
  };
}
export function makeEvaluationPrompt(caseItem, publicSettings) {
  let prompt = caseItem.prompt;
  if (caseItem.industry === 'real-estate' && publicSettings.listingsUrl) {
    prompt = prompt
      .replace('No real property inventory feed or client contact details are supplied.', 'The owner has supplied a public, browser-readable HTTPS property-feed endpoint for this evaluation.')
      .replace('Show a clear honest live-inventory-not-connected empty state, or only visibly labelled illustrative sample cards.', 'Fetch the supplied property feed at ' + publicSettings.listingsUrl.href + ' using the browser fetch API, then render only active records returned by that endpoint, preserving each stable record identifier and source fields. Implement loading, empty, error, and stale states. Do not use mock listings as a fallback to a failed source. The feed endpoint is explicitly approved for public browser access and must not contain secrets.');
  }
  if (publicSettings.enquiryUrl) {
    prompt += '\n\nPUBLIC QA ENQUIRY INTEGRATION (owner-approved test endpoint): Use the following public, browser-safe HTTPS URL as the primary Contact page form action: ' + publicSettings.enquiryUrl.href + '. POST a JSON payload with name, email, subject, message, source:"OVYX QA", test:true and dryRun:false. This is an actual QA delivery, not a no-send simulation: the owner-approved endpoint must route QA-marked payloads only to the configured owner-controlled test recipient and return an explicit delivery receipt. Do not put bearer tokens, private webhook URLs, or server secrets in the generated files. Keep the visitor-entered fields accessible and validated; disable submit while pending, preserve fields on errors, and report success only when the response has an explicit delivery receipt (delivered:true or deliveryStatus:"delivered"). An HTTP 2xx or queued/accepted response alone is not final delivery. This is an isolated QA evaluation — use only the configured test recipient and do not solicit or send messages to real customers.';
  } else {
    prompt += '\n\nNO PUBLIC ENQUIRY ENDPOINT IS CONFIGURED FOR THIS RUN. Do not invent or infer a recipient. Include an honest setup state for the real enquiry action. The isolated QA-only form described below may be tested locally, but it is not a client-contact integration.';
  }
  return prompt;
}

export function qualityContractFor(publicSettings) {
  if (!publicSettings?.enquiryUrl) return QA_CONTRACT;
  return QA_CONTRACT + '\n\nPUBLIC CONTACT FORM SEPARATION: The Contact page must contain two separate forms. The primary customer contact form MUST target the exact owner-approved public endpoint described above. The separately labelled QA-only form MUST target only /.well-known/ovyx-qa-enquiry. Do not confuse one form with the other, do not redirect the primary customer form to the local QA route, and never add secrets to either form or generated JavaScript. Include the public form only for this pre-authorized QA run; all submitted values must be clearly marked test=true and dryRun=false so the owner-approved endpoint performs one real test delivery to its owner-controlled QA recipient; only a provider-reported delivery receipt counts as delivery evidence.';
}

function providerConfigured() {
  return REQUIRED_KEY && String(process.env[REQUIRED_KEY] || '').trim();
}

function safeOutputPath(value) {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some(part => part === '..' || part === '.') || normalized.startsWith('functions/')) {
    throw new Error('The live evaluator received an unsafe generated file path.');
  }
  return normalized;
}

function summarizeContent(files) {
  return Object.entries(files).map(([file, content]) => file + '\n' + String(content || '')).join('\n\n');
}

export function inventoryHonesty(caseItem, files, liveFeedConfigured = false) {
  if (caseItem.industry !== 'real-estate') return { status: 'not-applicable' };
  const source = summarizeContent(files);
  const honestEmptyState = /(?:live inventory|listing feed|property feed|inventory feed).{0,100}(?:not connected|not configured|connect|unavailable|not yet)|(?:connect|configure).{0,100}(?:listing|property|inventory).{0,100}(?:feed|source|api)|no live (?:property )?listings/i.test(source);
  const labelledExamples = /(?:illustrative sample|sample propert|sample listing|demo listing|example listing|not live inventory|sample data|demo data)/i.test(source);
  const listingLanguage = /\b(?:property listings?|real estate|bedrooms?|rental properties|properties for sale)\b/i.test(source);
  const claimsLiveWithoutProof = !liveFeedConfigured && /\b(?:verified listing|live listings?|available now|real-time listings?|current inventory)\b/i.test(source) && !/\b(?:not connected|not configured|sample|demo|illustrative)\b/i.test(source);
  return {
    status: claimsLiveWithoutProof ? 'fail-unverified-live-inventory-claim'
      : listingLanguage && !liveFeedConfigured && !(honestEmptyState || labelledExamples) ? 'fail-inventory-provenance-missing'
      : liveFeedConfigured && listingLanguage ? 'public-feed-configured-inventory-awaiting-live-integration-proof'
      : honestEmptyState ? 'honest-empty-state-live-feed-not-configured'
      : labelledExamples ? 'illustrative-data-labelled'
      : 'no-live-inventory-evidence',
    passesHonestyGate: !claimsLiveWithoutProof && (liveFeedConfigured || !listingLanguage || honestEmptyState || labelledExamples),
    realListingsConfirmed: false,
    reason: liveFeedConfigured
      ? 'A public listing feed is configured for this generation. This copy check does not independently prove the feed is authoritative, reachable, or correctly rendered; only the separate live-service integration audit can confirm real listings.'
      : 'This evaluation has no public property-feed endpoint. It can verify that generated copy does not misrepresent sample inventory, but cannot confirm a live listing source.',
  };
}

async function writeSite(caseItem, generated, publicSettings) {
  const destination = path.join(OUT, caseItem.id);
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  const files = generated && generated.files && typeof generated.files === 'object' ? generated.files : {};
  const entries = Object.entries(files);
  if (!entries.some(([name, value]) => /\.html?$/i.test(name) && typeof value === 'string' && value.trim())) {
    throw Object.assign(new Error(caseItem.id + ': production multi-page builder returned no HTML files.'), { code: 'LIVE_GENERATION_HTML_MISSING' });
  }
  for (const [rawName, value] of entries) {
    const relative = safeOutputPath(rawName);
    if (typeof value !== 'string' || !value.trim()) continue;
    const file = path.resolve(destination, relative);
    if (file !== destination && !file.startsWith(destination + path.sep)) throw new Error('Generated file escaped its artifact directory.');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, value, 'utf8');
  }
  const market = {
    id: caseItem.id,
    title: caseItem.title,
    industry: caseItem.industry,
    market: caseItem.market,
    liveInventorySourceConfigured: Boolean(process.env.OVYX_EVAL_LISTINGS_API_URL),
    publicListingsEndpointConfigured: Boolean(publicSettings?.listingsUrl),
    enquiryDeliveryConfigured: Boolean(process.env.OVYX_EVAL_REAL_ENQUIRY_URL),
    qaOnlyEnquiryEndpoint: QA_ENDPOINT,
    provider: generated.provider || PROVIDER,
    model: generated.model || MODEL || null,
    generatedAt: new Date().toISOString(),
    siteMap: generated.siteMap || null,
    totalPages: generated.totalPages || generated.siteMap?.pages?.length || null,
    generatedFiles: entries.map(([name]) => name),
    inventoryHonesty: inventoryHonesty(caseItem, files, Boolean(publicSettings?.listingsUrl)),
    evidenceLimits: [
      'This is a live provider-generated site artifact, not a hand-written browser fixture.',
      'Browser and local QA endpoint checks do not prove delivery to a real email, WhatsApp, social, booking, payment, or customer-data endpoint.',
      process.env.OVYX_EVAL_LISTINGS_API_URL
        ? 'A listings endpoint was configured for this run; real listing records must still be fetched and checked separately.'
        : 'No real property listings feed was configured; live inventory remains unverified.',
      process.env.OVYX_EVAL_REAL_ENQUIRY_URL
        ? 'A real enquiry endpoint was configured for this run; its verified delivery status must be reported separately from the local QA endpoint.'
        : 'No real enquiry destination was configured; outbound customer enquiries remain unverified.',
    ],
  };
  await fs.writeFile(path.join(destination, 'ovyx-live-generation.json'), JSON.stringify(market, null, 2) + '\n');
  return market;
}

export async function runLiveGenerationEvaluation() {
  if (!REQUIRED_KEY) {
    throw Object.assign(new Error('OVYX_EVAL_PROVIDER must be one of gemini, claude, deepseek or openai.'), { code: 'LIVE_EVALUATION_PROVIDER_UNSUPPORTED' });
  }
  if (!providerConfigured()) {
    throw Object.assign(new Error('LIVE_GENERATION_BLOCKED_NO_PROVIDER_SECRET: no ' + REQUIRED_KEY + ' was available to call a real AI model. The evaluation is blocked, not passed. Configure the provider secret in the repository Actions settings; do not paste a secret into source code or chat.'), { code: 'LIVE_GENERATION_BLOCKED_NO_PROVIDER_SECRET' });
  }
  await fs.mkdir(OUT, { recursive: true });
  const runReport = { status: 'running', provider: PROVIDER, model: MODEL || null, generatedAt: new Date().toISOString(), sites: [], realListingsConfirmed: false, realEnquiryDeliveryConfirmed: false };
  await fs.writeFile(path.join(OUT, 'live-generation-report.json'), JSON.stringify(runReport, null, 2) + '\n');

  const publicSettings = publicIntegrationSettings();
  const qaContract = qualityContractFor(publicSettings);
  for (const caseItem of CASES) {
    const sitePrompt = makeEvaluationPrompt(caseItem, publicSettings);
    const context = { ...caseItem.market, market: { ...caseItem.market }, industry: caseItem.industry, country: caseItem.market.country, locale: caseItem.market.locale, currency: caseItem.market.currency, language: caseItem.market.language, timeZone: caseItem.market.timeZone, evaluationArtifact: true, qaOnlyEnquiryEndpoint: QA_ENDPOINT, publicListingsEndpointConfigured: Boolean(publicSettings.listingsUrl), publicEnquiryEndpointConfigured: Boolean(publicSettings.enquiryUrl), realInventorySourceConfigured: Boolean(process.env.OVYX_EVAL_LISTINGS_API_URL), realEnquiryDestinationConfigured: Boolean(process.env.OVYX_EVAL_REAL_ENQUIRY_URL) };
    const experience = buildExperienceBrief(sitePrompt + '\n\n' + qaContract, context);
    const prompt = sitePrompt + '\n\n' + qaContract;
    const generated = await buildStudioMultiPage({
      env: {
        ...process.env,
        OVYX_WEBSTUDIO_MAX_PAGES: '5',
        OVYX_WEBSTUDIO_MAX_BATCH_FILES: '6',
        OVYX_WEBSTUDIO_POLISH_ENABLED: process.env.OVYX_WEBSTUDIO_POLISH_ENABLED || 'true',
      },
      callModel,
      provider: PROVIDER,
      model: MODEL || undefined,
      prompt,
      project: { name: caseItem.title, pages: [] },
      files: {},
      mode: 'build',
      context: JSON.stringify({ ...context, experience }),
      qualityContract: WEB_STUDIO_EXCELLENCE + '\n\n' + qaContract,
    });
    if (!generated || generated.ok !== true) {
      throw Object.assign(new Error(caseItem.id + ': production multi-page generation returned no successful result.'), { code: 'LIVE_GENERATION_EMPTY_RESULT' });
    }
    const metadata = await writeSite(caseItem, generated, publicSettings);
    runReport.sites.push({
      id: caseItem.id, industry: caseItem.industry, country: caseItem.market.country,
      status: metadata.inventoryHonesty.passesHonestyGate === false ? 'needs-attention' : 'generated',
      provider: metadata.provider, model: metadata.model, pageCount: metadata.totalPages,
      fileCount: metadata.generatedFiles.length, inventoryHonesty: metadata.inventoryHonesty.status,
      realListingsConfirmed: false, realEnquiryDeliveryConfirmed: false,
    });
    await fs.writeFile(path.join(OUT, 'live-generation-report.json'), JSON.stringify(runReport, null, 2) + '\n');
    console.log(JSON.stringify({ event: 'live-site-generated', id: caseItem.id, industry: caseItem.industry, country: caseItem.market.country, provider: metadata.provider, model: metadata.model, pageCount: metadata.totalPages, inventoryHonesty: metadata.inventoryHonesty.status }));
    if (metadata.inventoryHonesty.passesHonestyGate === false) {
      throw Object.assign(new Error(caseItem.id + ': generated copy makes an unverified live-inventory claim.'), { code: 'LIVE_GENERATION_INVENTORY_HONESTY_FAILED' });
    }
  }

  runReport.status = 'generated-awaiting-browser-and-integration-audits';
  runReport.completedAt = new Date().toISOString();
  runReport.realListingsConfirmed = false;
  runReport.realEnquiryDeliveryConfirmed = false;
  runReport.limits = [
    'Real AI generation was run through the same multi-page builder and provider adapter used by OVYX Web Studio.',
    'The run intentionally does not mark real inventory or real external enquiry delivery as confirmed when the corresponding external services are not configured and exercised.',
    'The QA-only local endpoint is a simulated receiver for browser form behavior, not a production integration.',
  ];
  await fs.writeFile(path.join(OUT, 'live-generation-report.json'), JSON.stringify(runReport, null, 2) + '\n');
  return runReport;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runLiveGenerationEvaluation()
    .then(report => console.log(JSON.stringify(report, null, 2)))
    .catch(error => {
      console.error(error.code || 'LIVE_GENERATION_EVALUATION_FAILED', error.message || error);
      process.exitCode = 1;
    });
}
