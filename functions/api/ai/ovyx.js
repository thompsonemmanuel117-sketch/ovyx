import { assertAuthenticated } from '../../_lib/firebase.js';
import { readJson, jsonResponse, requestId } from '../../_lib/http.js';
import {
  buildNativeSystemPrompt,
  extractNativeModelText,
  nativeAssistantFallback,
  resolveNativeIntent,
  sanitizeNativeContext,
} from '../../_lib/ovyx-native-assistant.js';

const MODEL_DEFAULT = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;
const MAX_HISTORY = 12;
const MAX_MESSAGE_CHARS = 6000;
const requestWindows = new Map();

function safeMessages(value, prompt) {
  const source = Array.isArray(value) ? value : [];
  const messages = source.slice(-MAX_HISTORY).filter(item =>
    item && (item.role === 'user' || item.role === 'assistant')
  ).map(item => ({
    role: item.role,
    content: String(item.content || '').slice(0, MAX_MESSAGE_CHARS),
  })).filter(item => item.content.trim());
  if (!messages.length || messages[messages.length - 1].content.trim() !== prompt.trim()) {
    messages.push({ role: 'user', content: prompt });
  }
  return messages.slice(-MAX_HISTORY);
}

function rateLimit(uid) {
  const now = Date.now();
  const prior = requestWindows.get(uid) || [];
  const recent = prior.filter(time => now - time < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    requestWindows.set(uid, recent);
    return false;
  }
  recent.push(now);
  requestWindows.set(uid, recent);
  if (requestWindows.size > 3000) {
    for (const [key, values] of requestWindows) {
      if (!values.some(time => now - time < WINDOW_MS)) requestWindows.delete(key);
      if (requestWindows.size <= 2400) break;
    }
  }
  return true;
}

function cleanText(value, max = MAX_MESSAGE_CHARS) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

async function callNativeWorkersAI(env, prompt, messages, context) {
  if (!env?.AI || typeof env.AI.run !== 'function') return null;
  const model = cleanText(env.OVYX_NATIVE_AI_MODEL || MODEL_DEFAULT, 200);
  const inputMessages = [
    { role: 'system', content: buildNativeSystemPrompt(context) },
    ...messages.map(message => ({ role: message.role, content: message.content })),
  ];
  let timer;
  try {
    const result = await Promise.race([
      env.AI.run(model, {
        messages: inputMessages,
        max_tokens: 850,
        temperature: 0.2,
        stream: false,
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(
          new Error('OVYX native reasoning timed out.'),
          { code: 'OVYX_NATIVE_AI_TIMEOUT' }
        )), 25_000);
      }),
    ]);
    const answer = extractNativeModelText(result);
    if (!answer) return null;
    return {
      text: answer,
      engine: 'ovyx-native-workers-ai',
      model,
      usage: result?.usage || null,
      actions: [],
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function onRequestPost(context) {
  const id = requestId(context.request);
  try {
    const user = assertAuthenticated(context.data?.user);
    const payload = await readJson(context.request, 140_000);
    const prompt = cleanText(payload.prompt || payload.message, MAX_MESSAGE_CHARS);
    if (!prompt) {
      return jsonResponse({
        ok: false,
        code: 'PROMPT_REQUIRED',
        message: 'Please enter a message for OVYX AI.',
        requestId: id,
      }, 400);
    }
    const uid = cleanText(user.sub || user.uid, 160);
    if (!uid) {
      return jsonResponse({
        ok: false,
        code: 'AUTH_ID_MISSING',
        message: 'OVYX could not verify the signed-in account identity.',
        requestId: id,
      }, 401);
    }
    if (!rateLimit(uid)) {
      return jsonResponse({
        ok: false,
        code: 'OVYX_ASSISTANT_RATE_LIMIT',
        message: 'You have sent several messages in a short period. Please wait a moment and try again.',
        requestId: id,
      }, 429);
    }

    const rawContext = payload.context && typeof payload.context === 'object' ? payload.context : {};
    const safeContext = sanitizeNativeContext(rawContext);
    const messages = safeMessages(payload.messages, prompt);
    const intent = resolveNativeIntent(prompt, {
      ...rawContext,
      diagnostics: rawContext.diagnostics || payload.diagnostics || {},
    });

    if (intent.handled) {
      return jsonResponse({
        ok: true,
        requestId: id,
        text: intent.text,
        actions: Array.isArray(intent.actions) ? intent.actions : [],
        provider: 'ovyx-native',
        model: null,
        usage: null,
        actionMode: true,
      });
    }

    try {
      const generated = await callNativeWorkersAI(
        context.env,
        prompt,
        messages,
        { ...rawContext, diagnostics: rawContext.diagnostics || payload.diagnostics || {} },
      );
      if (generated?.text) {
        return jsonResponse({
          ok: true,
          requestId: id,
          text: generated.text,
          actions: generated.actions,
          provider: generated.engine,
          model: generated.model,
          usage: generated.usage,
          actionMode: false,
        });
      }
    } catch (error) {
      console.warn('[OVYX native assistant]', error?.code || error?.message || 'Native model unavailable');
    }

    const fallback = nativeAssistantFallback(prompt, {
      ...rawContext,
      diagnostics: rawContext.diagnostics || payload.diagnostics || safeContext.diagnostics,
    });
    return jsonResponse({
      ok: true,
      requestId: id,
      text: fallback.text,
      actions: fallback.actions || [],
      provider: 'ovyx-native',
      model: null,
      usage: null,
      actionMode: false,
      limitedMode: true,
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return jsonResponse({
      ok: false,
      requestId: id,
      code: error?.code || 'OVYX_NATIVE_ASSISTANT_FAILED',
      message: status === 401
        ? 'Sign in to use OVYX AI.'
        : 'OVYX AI could not complete the request. Please try again.',
    }, status);
  }
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return jsonResponse({
      ok: false,
      code: 'METHOD_NOT_ALLOWED',
      message: 'Only POST is allowed.',
      requestId: requestId(context.request),
    }, 405, { Allow: 'POST' });
  }
  return onRequestPost(context);
}
