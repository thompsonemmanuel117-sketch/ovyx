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

function unavailable(toolName) {
  const error = new Error('This Brain tool has no live execution adapter in the current OVYX build.');
  error.code = 'TOOL_EXECUTION_UNAVAILABLE';
  error.status = 501;
  error.tool = toolName;
  return error;
}

function executeGameStudio() {
  const error = new Error('Game Studio is registered but has no live execution adapter.');
  error.code = 'GAME_STUDIO_NOT_ENABLED_YET';
  error.status = 501;
  throw error;
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

  if(toolName === 'game_studio') return executeGameStudio();
  throw unavailable(toolName);
}
