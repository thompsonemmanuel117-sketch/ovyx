import { getFirestoreDataAtPath } from './firebase-admin.js';

export const USER_SETTINGS_DEFAULTS = Object.freeze({
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
  ai: Object.freeze({
    mode: 'balanced',
    model: 'automatic',
    provider: 'automatic',
    explain: true,
    preserve: true,
    confirmDestructive: false,
    contextFiles: true,
    contextPage: true,
    contextGithub: true,
    routing: 'Automatic',
    fallback: 'Automatic',
    contextLimit: 'Automatic',
    generationBudget: 'Automatic'
  }),
  notifications: Object.freeze({
    projectActivity: true,
    generationCompleted: true,
    deploymentStatus: true,
    aiUsageWarnings: true,
    billing: true,
    emailProductUpdates: true,
    emailSecurityAlerts: true
  })
});

const SECTIONS = new Set(Object.keys(USER_SETTINGS_DEFAULTS));
const PROVIDERS = new Set(['automatic', 'gemini', 'anthropic', 'deepseek', 'openai', 'groq', 'openrouter']);
const clean = (value, max = 240) => String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);

function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}
function choice(value, allowed, fallback) {
  const v = clean(value, 80);
  return allowed.has(v) ? v : fallback;
}

export function mergeUserSettings(stored = {}) {
  const result = {};
  for (const section of SECTIONS) {
    const source = stored?.[section] && typeof stored[section] === 'object' && !Array.isArray(stored[section])
      ? stored[section] : {};
    result[section] = { ...USER_SETTINGS_DEFAULTS[section], ...source };
    // Re-run normalization so malformed or older stored values never escape.
    result[section] = normalizeUserSettingsSection(section, result[section]);
  }
  return result;
}

export function normalizeUserSettingsSection(section, input = {}) {
  if (!SECTIONS.has(section)) {
    throw Object.assign(new Error('Unsupported settings section.'), { status: 400, code: 'SETTINGS_SECTION_INVALID' });
  }
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const defaults = USER_SETTINGS_DEFAULTS[section];
  if (section === 'profile') {
    const workspaceName = clean(source.workspaceName ?? defaults.workspaceName, 60);
    if (!workspaceName) throw Object.assign(new Error('Workspace name cannot be empty.'), { status: 400, code: 'WORKSPACE_NAME_REQUIRED' });
    return { workspaceName };
  }
  if (section === 'workspace') {
    return {
      openBehavior: choice(source.openBehavior, new Set(['Web Studio', 'Last active view', 'Project overview']), defaults.openBehavior),
      autosave: bool(source.autosave, defaults.autosave),
      confirmDelete: bool(source.confirmDelete, defaults.confirmDelete),
      inspector: bool(source.inspector, defaults.inspector),
      livePreview: bool(source.livePreview, defaults.livePreview),
      aiSafe: bool(source.aiSafe, defaults.aiSafe),
      editorMode: choice(source.editorMode, new Set(['Magic', 'Advanced', 'Last used']), defaults.editorMode)
    };
  }
  if (section === 'ai') {
    const provider = choice(source.provider, PROVIDERS, defaults.provider);
    const model = choice(source.model, PROVIDERS, defaults.model);
    return {
      mode: choice(source.mode, new Set(['balanced', 'fast', 'quality']), defaults.mode),
      model,
      provider: model !== 'automatic' && source.model !== undefined ? model : provider,
      explain: bool(source.explain, defaults.explain),
      preserve: bool(source.preserve, defaults.preserve),
      confirmDestructive: bool(source.confirmDestructive, defaults.confirmDestructive),
      contextFiles: bool(source.contextFiles, defaults.contextFiles),
      contextPage: bool(source.contextPage, defaults.contextPage),
      contextGithub: bool(source.contextGithub, defaults.contextGithub),
      routing: choice(source.routing, new Set(['Automatic', 'Preferred model first', 'Provider priority']), defaults.routing),
      fallback: choice(source.fallback, new Set(['Automatic', 'Next available provider', 'Stop and notify me']), defaults.fallback),
      contextLimit: choice(source.contextLimit, new Set(['Automatic', 'Conservative', 'Expanded']), defaults.contextLimit),
      generationBudget: choice(source.generationBudget, new Set(['Automatic', 'Efficient', 'Maximum']), defaults.generationBudget)
    };
  }
  return Object.fromEntries(Object.keys(defaults).map(key => [key, bool(source[key], defaults[key])]));
}

export async function readUserSettings(env, uid) {
  const id = clean(uid, 180);
  if (!/^[A-Za-z0-9_-]{1,180}$/.test(id)) {
    throw Object.assign(new Error('A valid account ID is required.'), { status: 400, code: 'SETTINGS_IDENTITY_INVALID' });
  }
  const stored = await getFirestoreDataAtPath(env, ['users', id, 'settings', 'preferences']) || {};
  return mergeUserSettings(stored);
}

export function filterAIContext(payload = {}, settings = USER_SETTINGS_DEFAULTS.ai) {
  const output = { ...payload };
  const context = payload.context && typeof payload.context === 'object' && !Array.isArray(payload.context)
    ? { ...payload.context } : null;
  const project = payload.project && typeof payload.project === 'object' && !Array.isArray(payload.project)
    ? { ...payload.project } : null;
  if (settings.contextFiles === false) {
    delete output.files;
    if (context) {
      for (const key of ['files', 'projectFiles', 'fileContents', 'workspaceFiles', 'sourceFiles']) delete context[key];
      if (context.project && typeof context.project === 'object') {
        context.project = { ...context.project };
        for (const key of ['files', 'projectFiles', 'fileContents', 'workspaceFiles', 'sourceFiles', 'canvas', 'pages', 'nodes']) delete context.project[key];
      }
    }
    if (project) {
      for (const key of ['files', 'projectFiles', 'fileContents', 'workspaceFiles', 'sourceFiles', 'canvas', 'pages', 'nodes']) delete project[key];
    }
  }
  if (settings.contextPage === false && context) {
    for (const key of ['page', 'currentPage', 'currentPageId', 'currentPageSlug', 'activePage', 'activePageId', 'activePageSlug', 'selectedPage', 'selectedSection', 'activeSection', 'pageContent', 'sectionContent']) delete context[key];
  }
  if (settings.contextGithub === false && context) {
    for (const key of ['github', 'githubContext', 'repository', 'repositories', 'repo', 'repoFiles', 'repositoryFiles', 'githubFiles', 'remoteRepository', 'gitContext']) delete context[key];
  }
  if (context) output.context = context;
  if (project) output.project = project;
  return output;
}

export function buildUserSettingsDirective(settings = {}, workspace = {}) {
  const ai = { ...USER_SETTINGS_DEFAULTS.ai, ...(settings || {}) };
  const lines = [
    'ACCOUNT-SPECIFIC AI PREFERENCES (apply when relevant; platform security and the current explicit request take priority):',
    'Generation mode: ' + ai.mode + '.',
    ai.explain ? 'Explain significant edits and key design/engineering decisions briefly.' : 'Do not add an unsolicited explanation unless the user asks.',
    ai.preserve ? 'Preserve working project structure and make the smallest appropriate edits; avoid rebuilding unrelated parts.' : 'Use the approach best suited to the user request, while still preserving unrelated data.',
    ai.confirmDestructive || workspace.aiSafe
      ? 'Before destructive or irreversible changes to an existing project, clearly explain the impact and ask the user to confirm; do not silently claim a destructive action was done.'
      : 'Be careful with destructive changes and clearly disclose their impact.',
    ai.contextFiles ? 'Use supplied project-file context when relevant.' : 'Do not rely on or reproduce project-file contents; project files were excluded by the user context preference.',
    ai.contextPage ? 'Use the active page/section context when relevant.' : 'Do not rely on active-page or selected-section context; that context was excluded by the user preference.',
    ai.contextGithub ? 'Use connected GitHub context when explicitly supplied and relevant.' : 'Do not use GitHub/repository context; that context was excluded by the user preference.'
  ];
  if (ai.contextLimit !== 'Automatic') lines.push('Context preference: ' + ai.contextLimit + '.');
  if (ai.generationBudget !== 'Automatic') lines.push('Generation budget preference: ' + ai.generationBudget + '.');
  return lines.join('\n');
}

export function resolvePreferredAIOptions(payload = {}, ai = USER_SETTINGS_DEFAULTS.ai) {
  const output = { ...payload };
  const requested = clean(output.provider || 'automatic', 80).toLowerCase();
  if (!requested || requested === 'automatic') {
    if (ai.routing === 'Provider priority') {
      output.provider = 'automatic';
    } else if (ai.provider !== 'automatic') {
      output.provider = ai.provider;
    } else {
      output.provider = 'automatic';
    }
  }
  if (!output.model || output.model === 'automatic') {
    if (ai.model && ai.model !== 'automatic') output.model = ai.model;
  }
  if (ai.fallback === 'Stop and notify me' && output.provider !== 'automatic') {
    // Providers are exclusive when explicitly requested by the shared provider router.
    output.model = output.model || 'automatic';
  }
  if (ai.generationBudget === 'Efficient' && !Number.isFinite(Number(output.maxTokens))) output.maxTokens = 1200;
  if (ai.generationBudget === 'Maximum' && !Number.isFinite(Number(output.maxTokens))) output.maxTokens = 8192;
  return output;
}
