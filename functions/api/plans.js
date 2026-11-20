import { getFirestoreData } from '../_lib/firebase-admin.js';
import { jsonResponse, requestId } from './_lib/http.js';

const DEFAULT_PRICING = Object.freeze({
  pro: { ngn: 33500, usd: 20 },
  max: { ngn: 209375, usd: 120 }
});

const DEFAULT_TOKEN_QUOTAS = Object.freeze({
  free: 50000,
  pro: 500000,
  max: 5000000
});

const DEFAULT_DAILY_PROMPT_QUOTAS = Object.freeze({
  free: 4,
  pro: 20,
  max: 100
});

const AVAILABLE_FEATURES = Object.freeze([
  { id: 'webStudio', label: 'Web Studio' },
  { id: 'advancedWebStudio', label: 'Advanced Web Studio' },
  { id: 'appStudio', label: 'App Studio' },
  { id: 'gameStudio', label: 'Game Studio' },
  { id: 'aiGeneration', label: 'AI Generation' },
  { id: 'github', label: 'Source management' },
  { id: 'cloudflareDeploy', label: 'Cloudflare Deploy' },
  { id: 'teamWorkspace', label: 'Team Workspace' },
  { id: 'templates', label: 'Blueprint Templates' }
]);

const DEFAULT_ACCESS_RULES = [];

function cleanFeatures(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  return value
    .filter(item => typeof item === 'string' || (item && typeof item === 'object'))
    .map(item => ({
      id: String(typeof item === 'string' ? item : (item.id || item.key || '')).trim(),
      label: String(typeof item === 'string' ? item : (item.label || item.name || item.id || item.key || '')).trim()
    }))
    .filter(item => item.id && item.label);
}

export async function onRequestGet(context) {
  const id = requestId(context.request);

  try {
    const config = (await getFirestoreData(context.env, 'system', 'config')) || {};
    const pricing = {
      ...DEFAULT_PRICING,
      ...(config.pricing || {}),
      pro: { ...DEFAULT_PRICING.pro, ...(config.pricing?.pro || {}) },
      max: { ...DEFAULT_PRICING.max, ...(config.pricing?.max || {}) }
    };

    const tokenQuotas = {
      ...DEFAULT_TOKEN_QUOTAS,
      ...(config.tokenQuotas || {})
    };

    const dailyPromptQuotas = {
      ...DEFAULT_DAILY_PROMPT_QUOTAS,
      ...(config.dailyPromptQuotas || {})
    };

    // Feature availability is intentionally not tier-gated yet. Keep legacy
    // config readable by the admin tools, but do not publish it as user locks.
    const features = {
      free: AVAILABLE_FEATURES,
      pro: AVAILABLE_FEATURES,
      max: AVAILABLE_FEATURES
    };
    const accessRules = DEFAULT_ACCESS_RULES;
    const gating = {};

    return jsonResponse({
      ok: true,
      pricing,
      tokenQuotas,
      dailyPromptQuotas,
      features,
      planFeaturesManaged: false,
      accessRules,
      gating,
      updatedAt: config.updatedAt || null,
      source: 'server',
      checkedAt: new Date().toISOString()
    }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: 'Pricing and plan details are temporarily unavailable. Please try again later.',
      code: 'PLANS_UNAVAILABLE',
      requestId: id
    }, 503, { 'X-OVYX-Request-ID': id });
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return jsonResponse({ ok: false, error: 'GET is required.', code: 'METHOD_NOT_ALLOWED' }, 405);
}
