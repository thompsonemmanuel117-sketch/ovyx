'use strict';

/**
 * OVYX Phase 7
 * Permission-gated Brain tools.
 */

import { authorizeTool } from './registry.js';

function clean(value) {
  return String(value || '').trim();
}

function safeObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function executeWebStudio(action, input) {
  const payload = safeObject(input);

  return {
    tool: 'web_studio',
    action,
    status: 'accepted',
    projectId: clean(payload.projectId) || null,
    target: clean(payload.target) || null,
    message: 'Web Studio tool request accepted by the OVYX Brain.'
  };
}

function executeAdvancedWebStudio(action, input) {
  const payload = safeObject(input);

  return {
    tool: 'advanced_web_studio',
    action,
    status: 'accepted',
    projectId: clean(payload.projectId) || null,
    target: clean(payload.target) || null,
    message: 'Advanced Web Studio tool request accepted by the OVYX Brain.'
  };
}

function executeGithub(action, input) {
  const payload = safeObject(input);

  return {
    tool: 'github',
    action,
    status: 'accepted',
    repository: clean(payload.repository) || null,
    branch: clean(payload.branch) || null,
    path: clean(payload.path) || null,
    message: 'GitHub operation authorized. The existing GitHub backend remains the credential authority.'
  };
}

function executeFirebase(action, input) {
  const payload = safeObject(input);

  return {
    tool: 'firebase',
    action,
    status: 'accepted',
    resource: clean(payload.resource) || null,
    message: 'Firebase operation authorized through the OVYX backend boundary.'
  };
}

function executeCloudflare(action, input) {
  const payload = safeObject(input);

  return {
    tool: 'cloudflare',
    action,
    status: 'accepted',
    project: clean(payload.project) || null,
    deploymentId: clean(payload.deploymentId) || null,
    message: 'Cloudflare operation authorized. Deployment credentials remain server-side.'
  };
}

function executeGameStudio() {
  return {
    tool: 'game_studio',
    status: 'disabled',
    code: 'GAME_STUDIO_NOT_ENABLED_YET',
    message: 'Game Studio is registered in the OVYX Brain contract, but its execution adapter has not been enabled yet.'
  };
}

export async function executeTool({
  toolName,
  action,
  input,
  entitlements,
  user
}) {
  const authorization = authorizeTool(toolName, action, entitlements, user);

  if (!authorization.ok) {
    const error = new Error(authorization.message);

    error.code = authorization.code;
    error.status = authorization.status;

    throw error;
  }

  switch (toolName) {
    case 'web_studio':
      return executeWebStudio(action, input);

    case 'advanced_web_studio':
      return executeAdvancedWebStudio(action, input);

    case 'github':
      return executeGithub(action, input);

    case 'firebase':
      return executeFirebase(action, input);

    case 'cloudflare':
      return executeCloudflare(action, input);

    case 'game_studio':
      return executeGameStudio();

    default: {
      const error = new Error('No execution adapter exists for this tool.');

      error.code = 'TOOL_EXECUTION_UNAVAILABLE';
      error.status = 501;

      throw error;
    }
  }
}
