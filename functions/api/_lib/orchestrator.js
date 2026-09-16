'use strict';

const {
  generateWithProvider
} = require('./providers.js');

const {
  executeTool
} = require('./tools.js');

const {
  listAvailableTools
} = require('./registry.js');

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    throw new Error('messages must be an array.');
  }

  return messages
    .filter(message =>
      message &&
      typeof message === 'object' &&
      typeof message.content === 'string'
    )
    .slice(-30)
    .map(message => ({
      role:
        message.role === 'assistant'
          ? 'assistant'
          : message.role === 'system'
            ? 'system'
            : 'user',

      content: String(message.content)
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .slice(0, 12000)
    }));
}

async function runBrain({
  env,
  user,
  capabilities,
  provider,
  model,
  messages,
  temperature,
  maxTokens,
  toolRequest
}) {
  const safeMessages = normalizeMessages(messages);

  if (!safeMessages.length) {
    throw new Error('At least one AI message is required.');
  }

  const availableTools =
    listAvailableTools(capabilities);

  let toolResult = null;

  if (toolRequest) {
    toolResult = await executeTool({
      tool: toolRequest.tool,
      action: toolRequest.action,
      input: toolRequest.input || {},
      capabilities
    });
  }

  const systemInstruction = [
    'You are the OVYX AI Assistant.',
    'You are an assistant, not an authorization authority.',
    'Never claim a capability that the server has not granted.',
    'Never request, reveal, invent, or expose provider API keys.',
    'Never expose Firebase service credentials.',
    'Never expose GitHub OAuth tokens.',
    'Never expose Cloudflare API tokens.',
    `Available server tools: ${availableTools
      .map(tool => tool.id)
      .join(', ') || 'none'}.`
  ].join('\n');

  const providerMessages = [
    {
      role: 'system',
      content: systemInstruction
    },
    ...safeMessages
  ];

  if (toolResult) {
    providerMessages.push({
      role: 'system',
      content:
        `Authorized tool result:\n${JSON.stringify(
          toolResult
        )}`
    });
  }

  const result = await generateWithProvider({
    provider,
    env,
    messages: providerMessages,
    model,
    temperature,
    maxTokens
  });

  return {
    user: {
      uid: user.uid
    },
    provider: result.provider,
    model: result.model,
    text: result.text,
    availableTools,
    toolResult
  };
}

module.exports = {
  runBrain
};
