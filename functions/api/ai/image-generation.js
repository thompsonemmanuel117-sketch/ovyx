import { assertAuthenticated } from '../../_lib/firebase.js';
import { readJson, jsonResponse, errorResponse } from '../../_lib/http.js';
import { beginAIQuota, finalizeAIQuota, refundDailyPrompt } from '../../_lib/token-quota.js';
import { runCloudflareFreeImageInference } from '../../_lib/cloudflare-free-ai.js';

const MAX_PROMPT_CHARS = 1800;

export async function onRequestPost(context) {
  let reservation = null;
  const env = context.env || {};
  try {
    const user = assertAuthenticated(context.data?.user);
    if (context.data?.entitlements?.capabilities?.webStudio !== true) {
      return errorResponse('Image generation is available through an entitled Web Studio workspace.', 403, 'FEATURE_NOT_INCLUDED');
    }

    const payload = await readJson(context.request, 8_000);
    const prompt = String(payload?.prompt || '').trim();
    if (!prompt) return errorResponse('Describe the image you want OVYX to create.', 400, 'PROMPT_REQUIRED');
    if (prompt.length > MAX_PROMPT_CHARS) {
      return errorResponse('Keep the image description to 1,800 characters or fewer.', 413, 'OVYX_IMAGE_PROMPT_TOO_LONG');
    }

    reservation = await beginAIQuota(env, user);
    let generated;
    try {
      generated = await runCloudflareFreeImageInference(env, { authUser: user, prompt });
    } catch (error) {
      await refundDailyPrompt(env, reservation).catch(refundError => {
        console.error('[OVYX IMAGE QUOTA REFUND]', refundError?.message || refundError);
      });
      reservation = null;
      throw error;
    }

    const quota = await finalizeAIQuota(
      env,
      reservation,
      { input_tokens: Math.ceil(prompt.length / 4), output_tokens: 1 },
      prompt,
      '[one image generated]'
    );
    reservation = null;

    return jsonResponse({
      ok: true,
      image: 'data:image/jpeg;base64,' + generated.image,
      model: generated.model,
      provider: 'cloudflare-workers-ai',
      steps: generated.steps,
      estimatedNeurons: generated.estimatedNeurons,
      quota,
    });
  } catch (error) {
    if (reservation) await refundDailyPrompt(env, reservation).catch(() => {});
    return errorResponse(
      error?.message || 'OVYX could not generate this image.',
      error?.status || 500,
      error?.code || 'OVYX_IMAGE_GENERATION_FAILED'
    );
  }
}

export async function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Use POST to generate an image.' }, 405, { Allow: 'POST' });
}
