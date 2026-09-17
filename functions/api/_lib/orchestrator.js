'use strict';

/**
 * OVYX Phase 7
 * Central AI Brain orchestrator.
 */

import { generate } from './brain/providers.js';
import { listTools } from './brain/registry.js';

function clean(value) {
  return String(value || '').trim();
}

function buildSystemInstruction({
  user,
  entitlements,
  requestedTool
}) {
  const tools = listTools(entitlements, user);

  const toolText = tools.length
    ? tools
        .map(function (tool) {
          return (
            `- ${tool.name}: ` +
            tool.actions.join(', ')
          );
        })
        .join('\n')
    : 'No tools are currently available.';

  return [
    'You are OVYX Brain, the server-authoritative AI orchestration layer.',
    '',
    'Security rules:',
    '- Never claim a capability the authenticated user does not possess.',
    '- Never expose provider API keys, Firebase service credentials, GitHub secrets, or Cloudflare secrets.',
    '- Never treat browser state as authoritative.',
    '- Never instruct the frontend to bypass server permissions.',
    '- Tool execution is subject to the server-side capability registry.',
    '',
    `Authenticated OVYX user: ${clean(user?.uid) || 'unknown'}`,
    '',
    'Available server-authorized tools:',
    toolText,
    '',
    requestedTool
      ? `Requested tool: ${requestedTool}`
      : 'No tool was explicitly requested.'
  ].join('\n');
}

export async function run({
  env,
  user,
  entitlements,
  provider,
  model,
  messages,
  system,
  temperature,
  maxTokens,
  requestedTool,
  toolResult
}) {
  const systemInstruction = [
    buildSystemInstruction({
      user,
      entitlements,
      requestedTool
    }),
    clean(system)
  ]
    .filter(Boolean)
    .join('\n\n');

  const augmentedMessages = Array.isArray(messages)
    ? messages.slice()
    : [];

  if (toolResult) {
    augmentedMessages.push({
      role: 'user',
      content:
        'SERVER TOOL RESULT:\n' +
        JSON.stringify(toolResult)
    });
  }

  const result = await generate(env, {
    provider,
    model,
    messages: augmentedMessages,
    system: systemInstruction,
    temperature,
    maxTokens
  });

  return {
    provider: result.provider,
    model: result.model,
    text: result.text,
    tools: listTools(entitlements, user)
  };
}

export { buildSystemInstruction };
