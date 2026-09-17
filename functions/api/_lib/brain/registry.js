'use strict';

/**
 * OVYX Phase 7
 * Server-side Brain capability + tool registry.
 */

export const CAPABILITIES = Object.freeze([
  'webStudio',
  'advancedWebStudio',
  'appStudio',
  'gameStudio',
  'aiGeneration',
  'github',
  'cloudflareDeploy',
  'teamWorkspace'
]);

export const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';

export const TOOL_REGISTRY = Object.freeze({
  web_studio: {
    capability: 'webStudio',
    enabled: true,
    actions: ['inspect', 'optimize', 'preview']
  },

  advanced_web_studio: {
    capability: 'advancedWebStudio',
    enabled: true,
    actions: ['inspect', 'optimize', 'preview']
  },

  game_studio: {
    capability: 'gameStudio',
    enabled: false,
    reason: 'GAME_STUDIO_NOT_ENABLED_YET',
    actions: [
      'project.create', 'project.inspect', 'project.update',
      'scene.create', 'scene.inspect', 'scene.update', 'scene.delete',
      'asset.list', 'asset.import', 'asset.remove',
      'script.read', 'script.write',
      'build.start', 'build.status',
      'preview.start', 'preview.status'
    ]
  },

  github: {
    capability: 'github',
    enabled: true,
    actions: ['repositories', 'branches', 'tree', 'contents']
  },

  firebase: {
    capability: 'teamWorkspace',
    enabled: true,
    actions: ['profile.read', 'project.read']
  },

  cloudflare: {
    capability: 'cloudflareDeploy',
    enabled: true,
    actions: ['deploy', 'status']
  }
});

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isRootUser(user) {
  return normalizeEmail(user && user.email) === ROOT_EMAIL;
}

export function normalizeCapabilities(entitlements) {
  const source =
    entitlements?.capabilities ||
    entitlements?.entitlements?.capabilities ||
    {};

  const result = {};

  for (const capability of CAPABILITIES) {
    result[capability] = source[capability] === true;
  }

  return result;
}

export function hasCapability(entitlements, capability, user) {
  if (!CAPABILITIES.includes(capability)) return false;

  if (isRootUser(user)) {
    return true;
  }

  const capabilities = normalizeCapabilities(entitlements);

  return capabilities[capability] === true;
}

export function getTool(toolName) {
  return TOOL_REGISTRY[toolName] || null;
}

export function listTools(entitlements, user) {
  return Object.keys(TOOL_REGISTRY)
    .map(function (name) {
      const tool = TOOL_REGISTRY[name];

      return {
        name,
        capability: tool.capability,
        enabled:
          tool.enabled &&
          hasCapability(entitlements, tool.capability, user),
        actions: tool.actions.slice(),
        reason: tool.reason || null
      };
    })
    .filter(function (tool) {
      return tool.enabled;
    });
}

export function authorizeTool(toolName, action, entitlements, user) {
  const tool = getTool(toolName);

  if (!tool) {
    return {
      ok: false,
      status: 404,
      code: 'TOOL_NOT_FOUND',
      message: 'The requested OVYX tool does not exist.'
    };
  }

  if (!hasCapability(entitlements, tool.capability, user)) {
    return {
      ok: false,
      status: 403,
      code: 'CAPABILITY_REQUIRED',
      message: `The ${tool.capability} capability is required for this tool.`
    };
  }

  if (!tool.enabled) {
    return {
      ok: false,
      status: 501,
      code: tool.reason || 'TOOL_NOT_IMPLEMENTED',
      message: 'This OVYX tool is registered but its backend implementation is not enabled yet.'
    };
  }

  if (!tool.actions.includes(action)) {
    return {
      ok: false,
      status: 400,
      code: 'ACTION_NOT_ALLOWED',
      message: 'The requested action is not registered for this tool.'
    };
  }

  return {
    ok: true,
    tool,
    action
  };
        }
