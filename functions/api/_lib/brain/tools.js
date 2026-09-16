'use strict';

const {
  authorizeTool
} = require('./registry.js');

function requireObject(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message);
  }

  return value;
}

function sanitizeString(value, maxLength = 200) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

async function executeWebStudioTool({
  action,
  input,
  capabilities
}) {
  authorizeTool({
    toolName: 'web_studio',
    capabilities
  });

  const safeAction = sanitizeString(action);

  const allowedActions = new Set([
    'inspect',
    'optimize',
    'preview'
  ]);

  if (!allowedActions.has(safeAction)) {
    throw new Error(
      'The requested Web Studio operation is not permitted.'
    );
  }

  return {
    tool: 'web_studio',
    action: safeAction,
    status: 'accepted',
    input: requireObject(
      input || {},
      'Web Studio input must be an object.'
    )
  };
}

async function executeGitHubTool({
  action,
  input,
  capabilities
}) {
  authorizeTool({
    toolName: 'github',
    capabilities
  });

  const safeAction = sanitizeString(action);

  const allowedActions = new Set([
    'repositories',
    'branches',
    'tree',
    'contents'
  ]);

  if (!allowedActions.has(safeAction)) {
    throw new Error(
      'The requested GitHub operation is not permitted.'
    );
  }

  return {
    tool: 'github',
    action: safeAction,
    status: 'accepted',
    input: requireObject(
      input || {},
      'GitHub input must be an object.'
    )
  };
}

async function executeFirebaseTool({
  action,
  input,
  capabilities
}) {
  authorizeTool({
    toolName: 'firebase',
    capabilities
  });

  const safeAction = sanitizeString(action);

  const allowedActions = new Set([
    'profile',
    'project',
    'read'
  ]);

  if (!allowedActions.has(safeAction)) {
    throw new Error(
      'The requested Firebase operation is not permitted.'
    );
  }

  return {
    tool: 'firebase',
    action: safeAction,
    status: 'accepted',
    input: requireObject(
      input || {},
      'Firebase input must be an object.'
    )
  };
}

async function executeCloudflareTool({
  action,
  input,
  capabilities
}) {
  authorizeTool({
    toolName: 'cloudflare',
    capabilities
  });

  const safeAction = sanitizeString(action);

  const allowedActions = new Set([
    'deploy',
    'status'
  ]);

  if (!allowedActions.has(safeAction)) {
    throw new Error(
      'The requested Cloudflare operation is not permitted.'
    );
  }

  return {
    tool: 'cloudflare',
    action: safeAction,
    status: 'accepted',
    input: requireObject(
      input || {},
      'Cloudflare input must be an object.'
    )
  };
}

async function executeTool({
  tool,
  action,
  input,
  capabilities
}) {
  switch (String(tool || '').trim()) {
    case 'web_studio':
      return executeWebStudioTool({
        action,
        input,
        capabilities
      });

    case 'github':
      return executeGitHubTool({
        action,
        input,
        capabilities
      });

    case 'firebase':
      return executeFirebaseTool({
        action,
        input,
        capabilities
      });

    case 'cloudflare':
      return executeCloudflareTool({
        action,
        input,
        capabilities
      });

    default:
      throw new Error('Unknown AI tool.');
  }
}

module.exports = {
  executeTool
};
