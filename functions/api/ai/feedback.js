import { assertAuthenticated } from '../../_lib/firebase.js';
import { setFirestoreDocumentAtPath } from '../../_lib/firebase-admin.js';
import {
  enforceSameOrigin,
  errorResponse,
  jsonResponse,
  readJson,
  requestId,
} from '../_lib/http.js';

const ALLOWED_PROVIDERS = new Set([
  'automatic',
  'gemini',
  'deepseek',
  'claude',
  'anthropic',
  'openai',
  'groq',
  'cloudflare-workers-ai',
  'unknown',
  'native-ovyx-ai',
]);

function clean(value, max = 160) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

export async function onRequest(context) {
  const request = context.request;
  const id = requestId(request);

  if (request.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'POST is required.', id);
  }

  if (!enforceSameOrigin(request)) {
    return errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin feedback requests are not permitted.', id);
  }

  try {
    const user = assertAuthenticated(context.data?.user);
    const body = await readJson(request, 8_000);
    const vote = String(body.vote || '').trim().toLowerCase();

    if (vote !== 'up' && vote !== 'down') {
      return errorResponse(400, 'FEEDBACK_VOTE_REQUIRED', 'Choose thumbs up or thumbs down.', id);
    }

    const rawMessageId = clean(body.messageId, 120);
    if (!rawMessageId || !/^[a-zA-Z0-9_-]+$/.test(rawMessageId)) {
      return errorResponse(400, 'FEEDBACK_MESSAGE_ID_INVALID', 'A valid AI response ID is required.', id);
    }

    let provider = clean(body.provider || 'unknown', 40).toLowerCase();
    if (!ALLOWED_PROVIDERS.has(provider)) provider = 'unknown';

    const route = clean(body.route || 'web-studio', 40).toLowerCase();
    if (route !== 'web-studio' && route !== 'assistant-workspace') {
      return errorResponse(400, 'FEEDBACK_ROUTE_INVALID', 'Choose a supported AI response surface.', id);
    }
    const model = clean(body.model || '', 100);
    const projectId = clean(body.projectId || '', 120);
    const now = new Date().toISOString();

    // Store feedback metadata only. The prompt, AI response, API keys, and
    // private project source are deliberately not collected by this endpoint.
    const feedback = {
      uid: String(user.uid || user.sub || ''),
      messageId: rawMessageId,
      vote,
      route,
      provider,
      model,
      projectId,
      createdAt: now,
      updatedAt: now,
    };

    const documentId = (feedback.uid + '_' + rawMessageId)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 240);

    if (!feedback.uid || !documentId) {
      return errorResponse(401, 'AUTH_REQUIRED', 'A verified OVYX account is required.', id);
    }

    await setFirestoreDocumentAtPath(
      context.env || {},
      ['ai_response_feedback', documentId],
      feedback,
      { merge: true },
    );

    return jsonResponse({
      ok: true,
      vote,
      message: 'Thank you. Your feedback was saved.',
    }, 201, { 'X-OVYX-Request-ID': id });
  } catch (error) {
    return errorResponse(
      error?.status || 503,
      error?.code || 'AI_FEEDBACK_SAVE_FAILED',
      error?.status === 401
        ? 'Sign in to submit feedback.'
        : 'OVYX could not save this feedback right now. You can still contact Support.',
      id,
    );
  }
}
