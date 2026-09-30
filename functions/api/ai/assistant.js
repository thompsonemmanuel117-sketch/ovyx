import { assertAuthenticated } from '../../_lib/firebase.js';
import {
  readJson,
  json,
  errorResponse,
  requestId,
} from '../../_lib/http.js';
import { callModel } from '../../_lib/providers.js';
import { WEB_STUDIO_SYSTEM_PROMPT } from '../../_lib/prompts.js';
import {
  saveChatTurn,
  resolveConversationId,
} from '../../_lib/chat-history.js';

function parseStructured(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) { try { return JSON.parse(raw.slice(start, end + 1)); } catch {} }
  return null;
}

function cleanMessages(payload) {
  if (Array.isArray(payload.messages) && payload.messages.length) {
    return payload.messages
      .filter(
        x =>
          x &&
          (x.role === 'user' || x.role === 'assistant')
      )
      .slice(-12)
      .map(x => ({
        role: x.role,
        content: String(x.content || '').slice(0, 30_000),
      }));
  }

  const prompt = String(
    payload.prompt ||
    payload.message ||
    ''
  ).trim();

  return prompt
    ? [{ role: 'user', content: prompt }]
    : [];
}

export async function onRequestPost(context) {
  try {
    const user = assertAuthenticated(
      context.data?.user
    );

    const payload = await readJson(
      context.request,
      300_000
    );

    const messages = cleanMessages(payload);

    if (!messages.length) {
      return errorResponse(
        'AI prompt is required.',
        400,
        'PROMPT_REQUIRED'
      );
    }

    const mode = String(payload.mode || 'assistant').toLowerCase();
    const isWebStudio = /^web-studio-(build|fix|plan|ask)$/.test(mode);
    const projectContext = payload.context && typeof payload.context === 'object'
      ? JSON.stringify(payload.context).slice(0, 80_000)
      : '';
    const suppliedSystem = String(payload.system || '').trim();
    const system = String(
      isWebStudio
        ? WEB_STUDIO_SYSTEM_PROMPT + (suppliedSystem ? '\\n\\nCLIENT STUDIO INSTRUCTIONS:\\n' + suppliedSystem : '') + '\\n\\nAuthenticated user UID: ' + user.sub
        : suppliedSystem || `You are OVYX Brain, the authenticated project-aware AI assistant.
User UID: ${user.sub}
Return useful concise answers.
Never reveal server secrets.
Do not invent repository state.
When discussing project changes, distinguish recommendations from changes actually performed.`
    ).slice(0, isWebStudio ? 40_000 : 20_000);

    const provider = String(
      payload.provider || 'automatic'
    ).toLowerCase();

    const combined = messages
      .map(
        x =>
          `${x.role.toUpperCase()}: ${x.content}`
      )
      .join('\n\n');

    const conversationId = resolveConversationId(
      payload.conversationId
    );

    const currentRequestId = requestId(
      context.request
    );

    const result = await callModel(
      context.env,
      {
        provider,
        model: payload.model,
        system,
        user: isWebStudio && projectContext ? combined + '\n\nPROJECT CONTEXT:\n' + projectContext : combined,
        maxTokens: isWebStudio
          ? Math.min(Number(payload.maxTokens || 24000), 24000)
          : Math.min(Number(payload.maxTokens || 4096), 8192),
      }
    );

    let historySaved = false;

    try {
      await saveChatTurn({
        env: context.env,
        userId: user.sub,
        conversationId,
        messages,
        result,
        requestId: currentRequestId,
        requestedProvider: result.requestedProvider,
      });
      historySaved = true;
    } catch (historyError) {
      console.error(
        '[OVYX CHAT HISTORY]',
        historyError?.message || historyError
      );
    }

    const structured = isWebStudio ? parseStructured(result.text) : null;

    return json({
      ok: true,
      text: result.text,
      answer: result.text,
      data: structured,
      provider: result.provider,
      model: result.model,
      usage: result.rawUsage || null,
      requestedProvider: result.requestedProvider,
      routedProvider: result.routedProvider,
      conversationId,
      history: {
        saved: historySaved,
      },
    });
  } catch (err) {
    return errorResponse(
      err.message || 'Assistant unavailable.',
      err.status || 500,
      err.code || 'AI_ASSISTANT_FAILED'
    );
  }
}
