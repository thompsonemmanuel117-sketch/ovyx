const TIERS = Object.freeze(['free', 'pro', 'max']);
const OPEN_BEHAVIORS = Object.freeze(['Web Studio', 'Last active view', 'Project overview']);
const EDITOR_MODES = Object.freeze(['Magic', 'Advanced', 'Last used']);
const PROVIDERS = Object.freeze(['automatic', 'gemini', 'anthropic', 'deepseek', 'openai', 'groq', 'openrouter']);
const MODELS = Object.freeze(['automatic', 'gemini', 'anthropic', 'deepseek', 'openai', 'groq', 'openrouter']);
const AI_MODES = Object.freeze(['balanced', 'fast', 'quality']);
const APPEARANCE_MODES = Object.freeze(['system', 'dark', 'light']);
const DENSITIES = Object.freeze(['comfortable', 'balanced', 'compact']);
const SCALES = Object.freeze(['small', 'balanced', 'large']);
const MOTIONS = Object.freeze(['full', 'reduced', 'minimal']);
const DEFAULT_THEME = Object.freeze({ active: 'obsidian', custom: { name: 'My OVYX Theme', bg: '#050505', panel: '#0b0b0c', elev: '#101012', text: '#f5f5f4', secondary: '#9a9aa0', muted: '#606067', accent: '#e8b64f' }, customThemes: {} });
const THEME_COLORS = Object.freeze(['bg', 'panel', 'elev', 'text', 'secondary', 'muted', 'accent']);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

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
    mode: 'system', density: 'balanced', scale: 'balanced', motion: 'full'
  }),
  theme: Object.freeze(DEFAULT_THEME)
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

function normalizeThemeRecord(value, fallback) {
  const input = asRecord(value);
  const result = { name: clean(input.name ?? fallback.name, 60) || fallback.name };
  for (const key of THEME_COLORS) {
    const color = clean(input[key] ?? fallback[key], 10);
    result[key] = HEX_COLOR.test(color) ? color.toLowerCase() : fallback[key];
  }
  return result;
}

function normalizeTheme(value, fallback) {
  const input = asRecord(value);
  const fallbackTheme = asRecord(fallback);
  const custom = normalizeThemeRecord(input.custom, fallbackTheme.custom || DEFAULT_THEME.custom);
  const customThemesInput = asRecord(input.customThemes);
  const customThemes = {};
  for (const [rawId, rawTheme] of Object.entries(customThemesInput).slice(0, 12)) {
    const id = clean(rawId, 60);
    if (!/^custom_[a-zA-Z0-9_-]{1,54}$/.test(id)) continue;
    customThemes[id] = normalizeThemeRecord(rawTheme, DEFAULT_THEME.custom);
  }
  const activeValue = clean(input.active ?? fallbackTheme.active ?? 'obsidian', 60);
  const active = activeValue === 'custom' || activeValue === 'obsidian' || Object.prototype.hasOwnProperty.call(customThemes, activeValue)
    ? activeValue
    : 'obsidian';
  return { active, custom, customThemes };
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
  const baseRecord = asRecord(base);
  const fallback = {
    version: 1,
    profile: { ...PROJECT_SETTINGS_DEFAULTS.profile, ...asRecord(baseRecord.profile) },
    workspace: { ...PROJECT_SETTINGS_DEFAULTS.workspace, ...asRecord(baseRecord.workspace) },
    notifications: { ...PROJECT_SETTINGS_DEFAULTS.notifications, ...asRecord(baseRecord.notifications) },
    ai: { ...PROJECT_SETTINGS_DEFAULTS.ai, ...asRecord(baseRecord.ai) },
    appearance: { ...PROJECT_SETTINGS_DEFAULTS.appearance, ...asRecord(baseRecord.appearance) },
    theme: { ...DEFAULT_THEME, ...asRecord(baseRecord.theme) }
  };
  const profile = asRecord(input.profile);
  return {
    version: 1,
    profile: {
      workspaceName: clean(profile.workspaceName ?? fallback.profile.workspaceName, 60) || 'Creative Workspace'
    },
    workspace: normalizeWorkspace(input.workspace, fallback.workspace),
    notifications: normalizeNotifications(input.notifications, fallback.notifications),
    ai: normalizeAI(input.ai, fallback.ai),
    appearance: normalizeAppearance(input.appearance, fallback.appearance),
    theme: normalizeTheme(input.theme, fallback.theme)
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
    appearance: { ...asRecord(prior.appearance), ...asRecord(update.appearance) },
    theme: { ...asRecord(prior.theme), ...asRecord(update.theme), custom: { ...asRecord(prior.theme?.custom), ...asRecord(update.theme?.custom) }, customThemes: { ...asRecord(prior.theme?.customThemes), ...asRecord(update.theme?.customThemes) } }
  };
  return normalizeProjectSettings(combined, PROJECT_SETTINGS_DEFAULTS);
}

/** Return a fresh mutable settings object suitable for JSON responses and UI hydration. */
export function defaultProjectSettings() {
  return normalizeProjectSettings(PROJECT_SETTINGS_DEFAULTS, PROJECT_SETTINGS_DEFAULTS);
}

export { TIERS as PROJECT_SETTING_TIERS };
