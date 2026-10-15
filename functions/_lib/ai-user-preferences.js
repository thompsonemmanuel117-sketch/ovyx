import { getFirestoreDataAtPath } from './firebase-admin.js';

export const AI_SETTINGS_DEFAULTS = Object.freeze({
  mode: 'balanced',
  model: 'automatic',
  provider: 'gemini',
  explain: true,
  preserve: true,
  confirmDestructive: false,
  contextFiles: true,
  contextPage: true,
  contextGithub: true,
  routing: 'automatic',
  fallback: 'automatic',
  contextLimit: 'automatic',
  generationBudget: 'automatic'
});

const PROVIDERS = new Set(['automatic', 'gemini', 'anthropic', 'deepseek', 'openai', 'groq', 'openrouter']);
const MODELS = new Set(['automatic', 'gemini', 'anthropic', 'deepseek', 'openai']);
const MODES = new Set(['balanced', 'fast', 'quality']);
const ROUTING = new Set(['automatic', 'preferred-first', 'provider-priority']);
const FALLBACK = new Set(['automatic', 'next-available', 'stop']);
const CONTEXT_LIMIT = new Set(['automatic', 'conservative', 'expanded']);
const BUDGET = new Set(['automatic', 'efficient', 'maximum']);

function cleanEnum(value, allowed, fallback) {
  const key = String(value ?? '').trim().toLowerCase();
  return allowed.has(key) ? key : fallback;
}

function normalizeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeAIUserSettings(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    mode: cleanEnum(source.mode, MODES, AI_SETTINGS_DEFAULTS.mode),
    model: cleanEnum(source.model, MODELS, AI_SETTINGS_DEFAULTS.model),
    provider: cleanEnum(source.provider, PROVIDERS, AI_SETTINGS_DEFAULTS.provider),
    explain: normalizeBoolean(source.explain, AI_SETTINGS_DEFAULTS.explain),
    preserve: normalizeBoolean(source.preserve, AI_SETTINGS_DEFAULTS.preserve),
    confirmDestructive: normalizeBoolean(source.confirmDestructive, AI_SETTINGS_DEFAULTS.confirmDestructive),
    contextFiles: normalizeBoolean(source.contextFiles, AI_SETTINGS_DEFAULTS.contextFiles),
    contextPage: normalizeBoolean(source.contextPage, AI_SETTINGS_DEFAULTS.contextPage),
    contextGithub: normalizeBoolean(source.contextGithub, AI_SETTINGS_DEFAULTS.contextGithub),
    routing: cleanEnum(source.routing, ROUTING, AI_SETTINGS_DEFAULTS.routing),
    fallback: cleanEnum(source.fallback, FALLBACK, AI_SETTINGS_DEFAULTS.fallback),
    contextLimit: cleanEnum(source.contextLimit, CONTEXT_LIMIT, AI_SETTINGS_DEFAULTS.contextLimit),
    generationBudget: cleanEnum(source.generationBudget, BUDGET, AI_SETTINGS_DEFAULTS.generationBudget)
  };
}

export async function getAIUserSettings(env, uid) {
  const id = String(uid || '').trim();
  if (!/^[A-Za-z0-9_-]{1,180}$/.test(id)) return { ...AI_SETTINGS_DEFAULTS };
  try {
    const data = await getFirestoreDataAtPath(env, ['users', id, 'settings', 'preferences']);
    return normalizeAIUserSettings(data?.ai || {});
  } catch (error) {
    // User preferences must never take AI offline. The server uses conservative
    // defaults if preference storage is temporarily unreachable.
    console.warn('[OVYX AI SETTINGS] preference read unavailable; using defaults');
    return { ...AI_SETTINGS_DEFAULTS };
  }
}

function boundedFiles(value, { maxFiles = 12, maxText = 9000 } = {}) {
  if (Array.isArray(value)) {
    return value.slice(0, maxFiles).map(item => {
      if (!item || typeof item !== 'object') return item;
      const next = { ...item };
      for (const key of ['content', 'text', 'source', 'code']) {
        if (typeof next[key] === 'string') next[key] = next[key].slice(0, maxText);
      }
      return next;
    });
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).slice(0, maxFiles).map(([path, item]) => {
    if (typeof item === 'string') return [path, item.slice(0, maxText)];
    if (!item || typeof item !== 'object') return [path, item];
    const next = { ...item };
    for (const key of ['content', 'text', 'source', 'code']) {
      if (typeof next[key] === 'string') next[key] = next[key].slice(0, maxText);
    }
    return [path, next];
  }));
}

export function applyAIContextPreferences(payload, settingsValue) {
  const settings = normalizeAIUserSettings(settingsValue);
  const body = { ...(payload || {}) };
  const context = body.context && typeof body.context === 'object' && !Array.isArray(body.context)
    ? { ...body.context } : {};

  if (!settings.contextFiles) {
    delete context.files;
    delete body.files;
    if (body.project && typeof body.project === 'object' && !Array.isArray(body.project)) {
      body.project = { ...body.project };
      delete body.project.files;
    }
  } else if (settings.contextLimit === 'conservative') {
    if (context.files !== undefined) context.files = boundedFiles(context.files);
    if (body.files !== undefined) body.files = boundedFiles(body.files);
  }

  if (!settings.contextPage) {
    for (const key of ['activePage', 'currentPage', 'activeSection', 'pageContext', 'currentSection']) {
      delete context[key];
      delete body[key];
    }
  }
  if (!settings.contextGithub) {
    delete context.github;
    delete context.githubRepository;
    delete body.github;
    delete body.contextGithub;
  }

  body.context = context;
  return body;
}

export function buildAIUserDirective(settingsValue) {
  const settings = normalizeAIUserSettings(settingsValue);
  const lines = ['ACCOUNT AI PREFERENCES (apply within the user request; platform safety and authorization always take precedence):'];
  if (settings.mode === 'fast') lines.push('Prefer a concise, low-latency response and avoid unnecessary explanation or variants while completing all explicit requirements.');
  if (settings.mode === 'quality') lines.push('Favor a careful, thorough result and perform a final consistency check against the user’s stated requirements.');
  if (settings.explain) lines.push('Explain significant changes briefly and clearly when returning a completed action.');
  if (settings.preserve) lines.push('When editing an existing project, preserve working structure and unrelated content unless the user explicitly asks to replace it.');
  if (settings.confirmDestructive) lines.push('Ask for explicit confirmation before proposing or performing destructive project changes. Never bypass platform authorization or safety checks.');
  return lines.join('\n');
}

export function buildAIUserCallOptions(settingsValue, requestedProvider, requestedModel) {
  const settings = normalizeAIUserSettings(settingsValue);
  const selectedProvider = String(requestedProvider || 'automatic').trim().toLowerCase();
  const automaticRequest = !selectedProvider || selectedProvider === 'automatic' || selectedProvider === 'auto';
  const selectedModel = String(requestedModel || '').trim();
  const options = {};
  if (automaticRequest) {
    options.preferredProvider = settings.provider === 'automatic' ? null : settings.provider;
    options.routingStrategy = settings.routing;
    options.fallbackPolicy = settings.fallback;
    if ((!selectedModel || selectedModel.toLowerCase() === 'automatic') && settings.model !== 'automatic') {
      options.model = settings.model;
    }
  }
  return options;
}

export function applyAIUserBudget(options = {}, settingsValue) {
  const settings = normalizeAIUserSettings(settingsValue);
  const next = { ...options };
  const raw = Number(next.maxTokens);
  const current = Number.isFinite(raw) && raw > 0 ? raw : 4096;
  if (settings.generationBudget === 'efficient') next.maxTokens = Math.min(current, 2048);
  else if (settings.generationBudget === 'maximum' && current <= 8192) next.maxTokens = Math.max(current, 8192);
  return next;
}
