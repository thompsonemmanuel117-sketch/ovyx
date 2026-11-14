import { assertAuthenticated } from '../../_lib/firebase.js';
import { readJson, jsonResponse, errorResponse, sseResponse } from '../../_lib/http.js';
import { conductWebResearch } from '../../_lib/web-research.js';

const MAX_PROMPT_CHARS = 1200;

export async function onRequestPost(context) {
  try {
    assertAuthenticated(context.data?.user);
    if (context.data?.entitlements?.capabilities?.webStudio !== true) {
      return errorResponse('Web Studio web research is not included in this account.', 403, 'FEATURE_NOT_INCLUDED');
    }

    const payload = await readJson(context.request, 12_000);
    const prompt = String(payload.prompt || payload.query || '').trim();
    if (!prompt) return errorResponse('Describe what you want Web Studio to research online.', 400, 'WEB_RESEARCH_QUERY_REQUIRED');
    if (prompt.length > MAX_PROMPT_CHARS) {
      return errorResponse('The online research request is too long. Narrow the research goal to 1,200 characters or fewer.', 413, 'WEB_RESEARCH_QUERY_TOO_LONG');
    }

    return sseResponse(async send => {
      send('progress', {
        phase: 'search',
        status: 'running',
        title: 'Starting web research',
        detail: 'Preparing focused searches and gathering public sources.'
      });
      const research = await conductWebResearch(context.env || {}, prompt, send);
      send('complete', { ok: true, research });
    });
  } catch (error) {
    return errorResponse(
      error?.message || 'Web Studio could not start online research.',
      error?.status || 401,
      error?.code || 'WEB_RESEARCH_FAILED'
    );
  }
}

export async function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return jsonResponse({
    ok: false,
    code: 'METHOD_NOT_ALLOWED',
    message: 'Use POST to start Web Studio web research.'
  }, 405, { Allow: 'POST' });
}
