import { assertAuthenticated } from '../../_lib/firebase.js';
import {
  readJson,
  json,
  errorResponse,
} from '../../_lib/http.js';
import { callModel } from '../../_lib/providers.js';

export async function onRequestPost(context) {
  try {
    assertAuthenticated(
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

    const system = String(
      payload.system ||
        'You are OVYX Brain. Return useful, project-aware responses. Never reveal server secrets.'
    ).slice(0, 20_000);

    const combined = messages
      .slice(-12)
      .map(
        x =>
          `${x.role || 'user'}: ${String(
            x.content || ''
          ).slice(0, 30_000)}`
      )
      .join('\n\n');

    const result = await callModel(
      context.env,
      {
        provider: String(
          payload.provider || 'automatic'
        ).toLowerCase(),
        model: payload.model,
        system,
        user: combined,
        maxTokens: Math.min(
          Number(
            payload.maxTokens || 4096
          ),
          8192
        ),
      }
    );

    return json({
      ok: true,
      text: result.text,
      message: result.text,
      answer: result.text,
      provider: result.provider,
      model: result.model,
      usage: result.rawUsage || null,
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
