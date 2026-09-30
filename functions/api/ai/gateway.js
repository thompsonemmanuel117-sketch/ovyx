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

export async function onRequestPost(context) {
  try {
    const user = assertAuthenticated(
      context.data?.user
    );

    const payload = await readJson(
      context.request,
      300_000
    );

    const messages = Array.isArray(
      payload.messages
    )
      ? payload.messages
      : [
          {
            role: 'user',
            content: String(
              payload.prompt ||
                payload.message ||
                ''
            ),
          },
        ];

    if (
      !messages.length ||
      !String(
        messages[0]?.content || ''
      ).trim()
    ) {
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
    const system = String(
      isWebStudio
        ? WEB_STUDIO_SYSTEM_PROMPT + (payload.system ? '\\n\\nCLIENT STUDIO INSTRUCTIONS:\\n' + String(payload.system) : '')
        : payload.system || 'You are OVYX Brain. Return useful, project-aware responses. Never reveal server secrets.'
    ).slice(0, isWebStudio ? 40_000 : 20_000);

    const combined = messages
      .slice(-12)
      .map(
        x =>
          `${x.role || 'user'}: ${String(
            x.content || ''
          ).slice(0, 30_000)}`
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
        provider: String(
          payload.provider || 'automatic'
        ).toLowerCase(),
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

    return json({
      ok: true,
      text: result.text,
      message: result.text,
      answer: result.text,
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
      err.message ||
        'AI gateway unavailable.',
      err.status || 500,
      err.code || 'AI_GATEWAY_FAILED'
    );
  }
      }