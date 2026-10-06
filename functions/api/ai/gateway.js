import { assertAuthenticated } from '../../_lib/firebase.js';
import {
  readJson,
  json,
  errorResponse,
  requestId,
} from '../../_lib/http.js';
import { callModel } from '../../_lib/providers.js';
import { WEB_STUDIO_SYSTEM_PROMPT, WEB_STUDIO_EXCELLENCE } from '../../_lib/prompts.js';
import { buildExperienceBrief, isWebStudioPrompt } from '../../_lib/experience.js';
import { beginAIQuota, finalizeAIQuota, refundDailyPrompt } from '../../_lib/token-quota.js';
import {
  saveChatTurn,
  resolveConversationId,
} from '../../_lib/chat-history.js';

function parseStructured(text) {
  const raw = String(text || '').trim();
  try {
    return JSON.parse(raw);
  } catch {}
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {}
  }
  return null;
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
        400,
        'PROMPT_REQUIRED',
        'AI prompt is required.'
      );
    }

    const mode = String(payload.mode || 'assistant').toLowerCase();
    const hasStudioContext = !!(
      payload?.project ||
      payload?.files ||
      payload?.context?.project ||
      payload?.context?.files
    );
    const promptText =
      payload.prompt ||
      payload.message ||
      messages[messages.length - 1]?.content ||
      '';
    const isWebStudio =
      isWebStudioPrompt(promptText, mode) ||
      ((mode === 'build' || mode === 'fix') && hasStudioContext);

    const projectContext = payload.context && typeof payload.context === 'object'
      ? JSON.stringify(payload.context).slice(0, 80_000)
      : '';

    const experience = isWebStudio
      ? buildExperienceBrief(
          promptText,
          payload.context || {}
        )
      : null;

    const suppliedSystem = String(payload.system || '').trim();

    const system = String(
      isWebStudio
        ? WEB_STUDIO_SYSTEM_PROMPT +
          '\\n\\n' +
          WEB_STUDIO_EXCELLENCE +
          '\\n\\nEXPERIENCE INTELLIGENCE:\\n' +
          JSON.stringify(experience || {}) +
          (suppliedSystem
            ? '\\n\\nCLIENT STUDIO INSTRUCTIONS:\\n' + suppliedSystem
            : '') +
          '\\n\\nAuthenticated user UID: ' + user.sub
        : suppliedSystem ||
          'You are OVYX Brain. Return useful, project-aware responses. Never reveal server secrets.'
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

    const quotaReservation = await beginAIQuota(context.env, user);

    let result;
    try {
      result = await callModel(
        context.env,
        {
          provider: String(
            payload.provider || 'automatic'
          ).toLowerCase(),
          model: payload.model,
          system,
          user: isWebStudio && projectContext ? combined + '\n\nPROJECT CONTEXT:\n' + projectContext : combined,
          authUser: user,
          maxTokens: isWebStudio
            ? Math.min(Number(payload.maxTokens || 24000), 24000)
            : Math.min(Number(payload.maxTokens || 4096), 8192),
        }
      );
    } catch (providerError) {
      await refundDailyPrompt(context.env, quotaReservation);
      throw providerError;
    }

    const quota = await finalizeAIQuota(
      context.env,
      quotaReservation,
      result.rawUsage || null,
      isWebStudio && projectContext ? combined + '\n\nPROJECT CONTEXT:\n' + projectContext : combined,
      result.text || ''
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
    const structuredFields = {};
    if (structured && typeof structured === 'object') {
      for (const key of ['project', 'updatedProject', 'files', 'fileEdits', 'patch', 'html', 'code', 'summary', 'message', 'answer']) {
        if (Object.prototype.hasOwnProperty.call(structured, key)) {
          structuredFields[key] = structured[key];
        }
      }
    }

    return json({
      ok: true,
      text: result.text,
      message: result.text,
      answer: result.text,
      ...structuredFields,
      data: structured,
      provider: result.provider,
      model: result.model,
      usage: result.rawUsage || null,
      quota,
      requestedProvider: result.requestedProvider,
      routedProvider: result.routedProvider,
      conversationId,
      experience: isWebStudio ? experience : null,
      history: {
        saved: historySaved,
      },
    });
  } catch (err) {
    return errorResponse(
      err.status || 500,
      err.code || 'AI_GATEWAY_FAILED',
      err.message || 'AI gateway unavailable.'
    );
  }
      }