const TIERS = Object.freeze(['free', 'pro', 'max']);
const OPEN_BEHAVIORS = Object.freeze(['Web Studio', 'Last active view', 'Project overview']);
const EDITOR_MODES = Object.freeze(['Magic', 'Advanced', 'Last used']);
const PROVIDERS = Object.freeze(['automatic', 'gemini', 'anthropic', 'deepseek', 'openai', 'groq', 'openrouter']);
const MODELS = Object.freeze(['automatic', 'gemini', 'anthropic', 'deepseek', 'openai', 'groq', 'openrouter']);
const AI_MODES = Object.freeze(['balanced', 'fast', 'quality']);
const APPEARANCE_MODES = Object.freeze(['system', 'dark', 'light']);
const DENSITIES = Object.freeze(['comfortable', 'balanced', 'compact']);
const SCALES = Object.freeze(['small', 'balanced', 'large']);
const MOTIONS = Object.freeze(['full', 'reduced']);

export const PROJECT_SETTINGS_DEFAULTS = Object.freeze({
  version: 1,
  profile: Object.freeze({ workspaceName: 'Creative Workspace' }),
  workspace: Object.freeze({
    openBehavior: 'Web Studio',
    autosave: true,
    confirmDelete: true,
    inspector: true,
    livePreview: true,
    aiSafe: true,
    editorMode: 'Magic'
  }),
  notifications: Object.freeze({
    projectActivity: true,
    generationCompleted: true,
    deploymentStatus: true,
    aiUsageWarnings: true,
    billing: true,
    emailProductUpdates: true,
    emailSecurityAlerts: true
  }),
  ai: Object.freeze({
    mode: 'balanced',
    model: 'automatic',
    provider: 'gemini',
    explain: true,
    preserve: true,
    confirmDestructive: false,
    contextFiles: true,
    contextPage: true,
    contextGithub: true,
    routing: 'Automatic',
    fallback: 'Automatic',
    contextLimit: 'Automatic',
    budget: 'Automatic'
  }),
  appearance: Object.freeze({
    mode: 'system',
    density: 'balanced',
    scale: 'balanced',
    motion: 'full'
  })
});

const asRecord = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const clean = (value, max = 200) => String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
const pick = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
const bool = (value, fallback) => typeof value === 'boolean' ? value : fallback;

function normalizeWorkspace(value, fallback) {
  const input = asRecord(value);
  return {
    openBehavior: pick(input.openBehavior, OPEN_BEHAVIORS, fallback.openBehavior),
    autosave: bool(input.autosave, fallback.autosave),
    confirmDelete: bool(input.confirmDelete, fallback.confirmDelete),
    inspector: bool(input.inspector, fallback.inspector),
    livePreview: bool(input.livePreview, fallback.livePreview),
    aiSafe: bool(input.aiSafe, fallback.aiSafe),
    editorMode: pick(input.editorMode, EDITOR_MODES, fallback.editorMode)
  };
}

function normalizeNotifications(value, fallback) {
  const input = asRecord(value);
  return Object.fromEntries(Object.keys(fallback).map(key => [key, bool(input[key], fallback[key])]));
}

function normalizeAI(value, fallback) {
  const input = asRecord(value);
  const choices = {
    mode: AI_MODES,
    model: MODELS,
    provider: PROVIDERS,
    routing: ['Automatic', 'Preferred model first', 'Provider priority'],
    fallback: ['Automatic', 'Next available provider', 'Stop and notify me'],
    contextLimit: ['Automatic', 'Conservative', 'Expanded'],
    budget: ['Automatic', 'Efficient', 'Maximum']
  };
  const result = {};
  for (const [key, allowed] of Object.entries(choices)) result[key] = pick(input[key], allowed, fallback[key]);
  for (const key of ['explain', 'preserve', 'confirmDestructive', 'contextFiles', 'contextPage', 'contextGithub']) {
    result[key] = bool(input[key], fallback[key]);
  }
  return result;
}

function normalizeAppearance(value, fallback) {
  const input = asRecord(value);
  return {
    mode: pick(input.mode, APPEARANCE_MODES, fallback.mode),
    density: pick(input.density, DENSITIES, fallback.density),
    scale: pick(input.scale, SCALES, fallback.scale),
    motion: pick(input.motion, MOTIONS, fallback.motion)
  };
}

/**
 * Normalize the small, allow-listed user settings schema. Unknown fields (including
 * secret-like arbitrary properties) are deliberately not retained.
 */
export function normalizeProjectSettings(value = {}, base = PROJECT_SETTINGS_DEFAULTS) {
  const input = asRecord(value);
  const fallback = mergeProjectSettings(PROJECT_SETTINGS_DEFAULTS, base);
  const profile = asRecord(input.profile);
  return {
    version: 1,
    profile: {
      workspaceName: clean(profile.workspaceName ?? fallback.profile.workspaceName, 60) || 'Creative Workspace'
    },
    workspace: normalizeWorkspace(input.workspace, fallback.workspace),
    notifications: normalizeNotifications(input.notifications, fallback.notifications),
    ai: normalizeAI(input.ai, fallback.ai),
    appearance: normalizeAppearance(input.appearance, fallback.appearance)
  };
}

/** Merge partial namespace updates without dropping unrelated user preferences. */
export function mergeProjectSettings(current = PROJECT_SETTINGS_DEFAULTS, patch = {}) {
  const prior = asRecord(current);
  const update = asRecord(patch);
  const combined = {
    version: 1,
    profile: { ...asRecord(prior.profile), ...asRecord(update.profile) },
    workspace: { ...asRecord(prior.workspace), ...asRecord(update.workspace) },
    notifications: { ...asRecord(prior.notifications), ...asRecord(update.notifications) },
    ai: { ...asRecord(prior.ai), ...asRecord(update.ai) },
    appearance: { ...asRecord(prior.appearance), ...asRecord(update.appearance) }
  };
  return normalizeProjectSettings(combined, PROJECT_SETTINGS_DEFAULTS);
}

/** Return a fresh mutable settings object suitable for JSON responses and UI hydration. */
export function defaultProjectSettings() {
  return normalizeProjectSettings(PROJECT_SETTINGS_DEFAULTS, PROJECT_SETTINGS_DEFAULTS);
}

export { TIERS as PROJECT_SETTING_TIERS };
