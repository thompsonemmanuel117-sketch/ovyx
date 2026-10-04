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

const DEFAULT_FEATURES = Object.freeze({
  pro: [
    { id: 'webStudio', label: 'Web Studio' },
    { id: 'appStudio', label: 'App Studio' },
    { id: 'aiGeneration', label: 'AI Generation' },
    { id: 'github', label: 'GitHub' },
    { id: 'cloudflareDeploy', label: 'Cloudflare Deploy' },
    { id: 'teamWorkspace', label: 'Team Workspace' },
    { id: 'templates', label: 'Templates' }
  ],
  max: [
    { id: 'webStudio', label: 'Web Studio' },
    { id: 'advancedWebStudio', label: 'Advanced Web Studio' },
    { id: 'appStudio', label: 'App Studio' },
    { id: 'aiGeneration', label: 'AI Generation' },
    { id: 'github', label: 'GitHub' },
    { id: 'cloudflareDeploy', label: 'Cloudflare Deploy' },
    { id: 'teamWorkspace', label: 'Team Workspace' },
    { id: 'templates', label: 'Templates' }
  ]
});

const DEFAULT_ACCESS_RULES = [];

function cleanFeatures(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  return value
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      id: String(item.id || item.key || '').trim(),
      label: String(item.label || item.name || item.id || '').trim()
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

    const features = {
      pro: cleanFeatures(config.planFeatures?.pro, DEFAULT_FEATURES.pro),
      max: cleanFeatures(config.planFeatures?.max, DEFAULT_FEATURES.max)
    };

    const accessRules = Array.isArray(config.accessRules)
      ? config.accessRules
      : DEFAULT_ACCESS_RULES;

    const gating = config.gating && typeof config.gating === 'object'
      ? config.gating
      : {};

    return jsonResponse({
      ok: true,
      pricing,
      tokenQuotas,
      dailyPromptQuotas,
      features,
      accessRules,
      gating,
      updatedAt: config.updatedAt || null,
      source: 'server',
      checkedAt: new Date().toISOString()
    }, 200, { 'X-OVYX-Request-ID': id });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: 'Plan catalog is temporarily unavailable.',
      code: 'PLANS_UNAVAILABLE',
      requestId: id
    }, 503, { 'X-OVYX-Request-ID': id });
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return jsonResponse({ ok: false, error: 'GET is required.', code: 'METHOD_NOT_ALLOWED' }, 405);
}
