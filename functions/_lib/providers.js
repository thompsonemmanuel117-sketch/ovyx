import {
  isCloudflareWorkersAIGuardedMode,
  runCloudflareFreeInference,
  OVYX_CLOUDFLARE_FREE_MODEL,
} from './cloudflare-free-ai.js';
import {
  withCloudflareAIOnly,
  OVYX_CLOUDFLARE_ONLY_PROVIDER,
} from './cloudflare-routing.js';

export function extractJsonObject(
  text
) {
  let cleaned =
    String(
      text || ''
    ).trim();

  cleaned =
    cleaned
      .replace(
        /^```(?:json)?/i,
        ''
      )
      .replace(
        /```$/i,
        ''
      )
      .trim();

  try {
    return JSON.parse(
      cleaned
    );
  } catch {}

  const start =
    cleaned.indexOf(
      '{'
    );

  const end =
    cleaned.lastIndexOf(
      '}'
    );

  if (
    start >= 0 &&
    end > start
  ) {
    try {
      return JSON.parse(
        cleaned.slice(
          start,
          end + 1
        )
      );
    } catch {}
  }

  throw Object.assign(
    new Error(
      'AI returned invalid structured JSON.'
    ),
    {
      code:
        'AI_INVALID_JSON',
    }
  );
}

async function callCloudflareWorkersAI(env, options = {}) {
  if (!isCloudflareWorkersAIGuardedMode(env)) {
    throw Object.assign(
      new Error('OVYX AI engine mode is not configured for Cloudflare Workers AI. No external model provider was called.'),
      { status: 503, code: 'OVYX_AI_ENGINE_MODE_NOT_CONFIGURED' },
    );
  }
  if (!env?.AI || typeof env.AI.run !== 'function') {
    throw Object.assign(
      new Error('OVYX Cloudflare Workers AI binding is not configured. No external model provider was called.'),
      { status: 503, code: 'OVYX_NATIVE_AI_NOT_CONFIGURED' },
    );
  }

  const guarded = await runCloudflareFreeInference(env, {
    authUser: options.authUser || null,
    messages: Array.isArray(options.messages) ? options.messages : null,
    system: String(options.system || ''),
    user: String(options.user || ''),
    maxTokens: options.maxTokens,
    timeoutMs: options.timeoutMs,
    disableThinking: options.disableThinking === true,
  });
  const text = String(guarded?.text || '').trim();
  if (!text) {
    throw Object.assign(
      new Error('Cloudflare Workers AI returned an empty response.'),
      { status: 503, code: 'OVYX_AI_CLOUDFLARE_EMPTY_RESPONSE' },
    );
  }

  return {
    text,
    model: OVYX_CLOUDFLARE_FREE_MODEL,
    provider: OVYX_CLOUDFLARE_ONLY_PROVIDER,
    rawUsage: guarded?.result?.usage || guarded?.result?.result?.usage || null,
  };
}

export async function callModel(env, options = {}) {
  // Enforce the single model provider at the trust boundary. Browser-supplied
  // provider/model preferences, legacy routing flags and personal Brain IDs
  // cannot select or fall back to another AI engine.
  const secureEnv = withCloudflareAIOnly(env);
  const result = await callCloudflareWorkersAI(secureEnv, {
    ...options,
    model: OVYX_CLOUDFLARE_FREE_MODEL,
    authUser: options.authUser || null,
  });
  return {
    ...result,
    requestedProvider: OVYX_CLOUDFLARE_ONLY_PROVIDER,
    routedProvider: OVYX_CLOUDFLARE_ONLY_PROVIDER,
  };
}

export async function callJsonModel(env, options = {}) {
  const result = await callModel(env, options);
  if (typeof options.onUsage === 'function') {
    options.onUsage(
      result.rawUsage || null,
      String(options.user || ''),
      String(result.text || ''),
      result.provider || null,
    );
  }
  return {
    ...result,
    json: extractJsonObject(result.text),
  };
}
