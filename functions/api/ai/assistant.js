import { assertAuthenticated } from '../../_lib/firebase.js';
import { readJson, json, errorResponse } from '../../_lib/http.js';
import { callModel } from '../../_lib/providers.js';

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

    const system = String(
      payload.system ||
        `You are OVYX Brain, the authenticated project-aware AI assistant.
User UID: ${user.sub}
Return useful concise answers.
Never reveal server secrets.
Do not invent repository state.
When discussing project changes, distinguish recommendations from changes actually performed.`
    ).slice(0, 20_000);

    const provider = String(
      payload.provider || 'automatic'
    ).toLowerCase();

    const combined = messages
      .map(
        x =>
          `${x.role.toUpperCase()}: ${x.content}`
      )
      .join('\n\n');

    const result = await callModel(
      context.env,
      {
        provider,
        model: payload.model,
        system,
        user: combined,
        maxTokens: Math.min(
          Number(payload.maxTokens || 4096),
          8192
        ),
      }
    );

    return json({
      ok: true,
      text: result.text,
      answer: result.text,
      provider: result.provider,
      model: result.model,
      usage: result.rawUsage || null,
    });
  } catch (err) {
    return errorResponse(
      err.message || 'Assistant unavailable.',
      err.status || 500,
      err.code || 'AI_ASSISTANT_FAILED'
    );
  }
}
