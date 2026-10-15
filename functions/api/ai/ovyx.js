import { assertAuthenticated } from '../../_lib/firebase.js';
import { readJson, json, errorResponse, requestId } from '../../_lib/http.js';
import { beginAIQuota, finalizeAIQuota, refundDailyPrompt } from '../../_lib/token-quota.js';
import { saveChatTurn, resolveConversationId } from '../../_lib/chat-history.js';
import { generateOvyxNativeAI } from '../../_lib/ovyx-native-ai.js';
import { getAIIdentityDirective } from '../../_lib/ai-identity.js';

function normalizeMessages(payload) {
  if (Array.isArray(payload?.messages)) {
    return payload.messages
      .filter(item => item && (item.role === 'user' || item.role === 'assistant'))
      .slice(-12)
      .map(item => ({
        role: item.role,
        content: String(item.content || '').slice(0, 9000),
      }))
      .filter(item => item.content.trim());
  }
  const prompt = String(payload?.prompt || payload?.message || '').trim();
  return prompt ? [{ role: 'user', content: prompt.slice(0, 9000) }] : [];
}

export async function onRequestPost(context) {
  let reservation = null;
  let quotaInputText = '';
  try {
    const user = assertAuthenticated(context.data?.user);
    const payload = await readJson(context.request, 180_000);
    const messages = normalizeMessages(payload);
    if (!messages.length) {
      return errorResponse('Please enter a message for OVYX AI.', 400, 'PROMPT_REQUIRED');
    }

    if (!context.env?.AI || typeof context.env.AI.run !== 'function') {
      return errorResponse(
        'OVYX AI needs its native Cloudflare Workers AI binding. Add a Workers AI binding named AI in the OVYX Pages project settings and redeploy. No third-party API key is needed.',
        503,
        'OVYX_NATIVE_AI_NOT_CONFIGURED'
      );
    }

    const requestPrompt = String(payload.prompt || payload.message || messages[messages.length - 1]?.content || '').trim();
    const conversationId = resolveConversationId(payload.conversationId);
    const id = requestId(context.request);
    const contextText = JSON.stringify(payload.context || {}).slice(0, 42_000);
    quotaInputText = messages.map(message => message.role.toUpperCase() + ': ' + message.content).join('\n\n') +
      (contextText ? '\n\nWORKSPACE CONTEXT:\n' + contextText : '');

    reservation = await beginAIQuota(context.env, user);
    let result;
    try {
      const globalIdentityDirective = await getAIIdentityDirective(context.env);
      result = await generateOvyxNativeAI(context.env, {
        messages,
        prompt: requestPrompt,
        system: [String(payload.system || '').slice(0, 7000), globalIdentityDirective].filter(Boolean).join('\n\n').slice(0, 10500),
        context: payload.context || {
          project: payload.project || null,
          files: payload.files || null,
        },
        model: payload.model,
      });
    } catch (aiError) {
      if (aiError?.partialUsage) {
        await finalizeAIQuota(
          context.env,
          reservation,
          aiError.partialUsage,
          quotaInputText,
          aiError.quotaOutputText || ''
        ).catch(error => console.error('[OVYX NATIVE AI PARTIAL USAGE]', error?.message || error));
      } else {
        await refundDailyPrompt(context.env, reservation).catch(error => {
          console.error('[OVYX NATIVE AI QUOTA REFUND]', error?.message || error);
        });
      }
      reservation = null;
      throw aiError;
    }

    const quota = await finalizeAIQuota(
      context.env,
      reservation,
      result.rawUsage,
      quotaInputText,
      result.text
    );
    reservation = null;

    let historySaved = false;
    try {
      await saveChatTurn({
        env: context.env,
        userId: user.sub,
        conversationId,
        messages,
        result: {
          ...result,
          requestedProvider: 'ovyx-native',
        },
        requestId: id,
        requestedProvider: 'ovyx-native',
      });
      historySaved = true;
    } catch (historyError) {
      console.error('[OVYX NATIVE AI CHAT HISTORY]', historyError?.message || historyError);
    }

    return json({
      ok: true,
      text: result.text,
      message: result.text,
      answer: result.text,
      actions: result.actions,
      provider: 'ovyx-native',
      model: result.model,
      usage: result.rawUsage,
      quota,
      conversationId,
      native: true,
      externalApiKeysRequired: false,
      history: { saved: historySaved },
    });
  } catch (error) {
    if (reservation) {
      await refundDailyPrompt(context.env, reservation).catch(() => {});
    }
    return errorResponse(
      error.message || 'OVYX AI could not complete this request.',
      error.status || 500,
      error.code || 'OVYX_NATIVE_AI_FAILED'
    );
  }
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return errorResponse('Only POST is allowed.', 405, 'METHOD_NOT_ALLOWED');
  }
  return onRequestPost(context);
}
