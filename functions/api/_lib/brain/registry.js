'use strict';

const TOOL_CAPABILITIES = Object.freeze({
  webStudio: 'webStudio',
  github: 'github',
  firebase: 'teamWorkspace',
  cloudflare: 'cloudflareDeploy'
});

const TOOL_REGISTRY = Object.freeze({
  web_studio: Object.freeze({
    id: 'web_studio',
    capability: TOOL_CAPABILITIES.webStudio,
    description: 'Perform permitted Web Studio operations.'
  }),

  github: Object.freeze({
    id: 'github',
    capability: TOOL_CAPABILITIES.github,
    description: 'Read or perform permitted GitHub operations.'
  }),

  firebase: Object.freeze({
    id: 'firebase',
    capability: TOOL_CAPABILITIES.firebase,
    description: 'Perform permitted Firebase data operations.'
  }),

  cloudflare: Object.freeze({
    id: 'cloudflare',
    capability: TOOL_CAPABILITIES.cloudflare,
    description: 'Perform permitted Cloudflare deployment operations.'
  })
});

function normalizeCapabilities(capabilities) {
  if (!capabilities || typeof capabilities !== 'object') {
    return {};
  }

  return Object.keys(capabilities).reduce(
    (result, key) => {
      result[key] = capabilities[key] === true;
      return result;
    },
    {}
  );
}

function hasCapability(capabilities, capability) {
  return (
    normalizeCapabilities(capabilities)[capability] === true
  );
}

function getTool(toolName) {
  const tool =
    TOOL_REGISTRY[String(toolName || '').trim()];

  if (!tool) {
    throw new Error('Unknown AI tool.');
  }

  return tool;
}

function authorizeTool({
  toolName,
  capabilities
}) {
  const tool = getTool(toolName);

  if (!hasCapability(capabilities, tool.capability)) {
    const error = new Error(
      `Capability "${tool.capability}" is required for this tool.`
    );

    error.code = 'CAPABILITY_DENIED';
    error.tool = tool.id;
    error.capability = tool.capability;

    throw error;
  }

  return {
    allowed: true,
    tool: tool.id,
    capability: tool.capability
  };
}

function listAvailableTools(capabilities) {
  return Object.values(TOOL_REGISTRY)
    .filter(tool =>
      hasCapability(capabilities, tool.capability)
    )
    .map(tool => ({
      id: tool.id,
      capability: tool.capability,
      description: tool.description
    }));
}

module.exports = {
  TOOL_CAPABILITIES,
  TOOL_REGISTRY,
  authorizeTool,
  listAvailableTools,
  hasCapability
};
