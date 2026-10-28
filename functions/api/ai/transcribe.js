import { assertAuthenticated } from '../../_lib/firebase.js';
import { readJson, jsonResponse, errorResponse } from '../../_lib/http.js';
import { beginAIQuota, finalizeAIQuota, refundDailyPrompt } from '../../_lib/token-quota.js';

const MAX_AUDIO_BYTES = 8_000_000;
const MAX_BODY_BYTES = 11_000_000;
const ALLOWED_AUDIO_MIME = /^audio\/(?:webm|mp4|ogg|wav|x-wav|mpeg|mp3|aac|x-m4a|3gpp|3gpp2|flac|webm;codecs=opus)$/i;

function parseAudioDataUrl(value) {
  const match = String(value || '').match(/^data:(audio\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i);
  if (!match) {
    throw Object.assign(new Error('Choose a recorded audio file before sending a voice note.'), {
      status: 400,
      code: 'VOICE_AUDIO_REQUIRED',
    });
  }

  const mimeType = match[1].toLowerCase();
  const base64 = match[2].replace(/\s/g, '');
  if (!ALLOWED_AUDIO_MIME.test(mimeType)) {
    throw Object.assign(new Error('This audio format is not supported. Record the voice note again or choose a supported audio file.'), {
      status: 415,
      code: 'VOICE_AUDIO_TYPE_UNSUPPORTED',
    });
  }
  if (!base64 || !/^[a-z0-9+/]+={0,2}$/i.test(base64) || base64.length % 4 !== 0) {
    throw Object.assign(new Error('The voice note could not be read. Please record it again.'), {
      status: 400,
      code: 'VOICE_AUDIO_INVALID',
    });
  }

  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const byteLength = Math.max(0, Math.floor(base64.length * 3 / 4) - padding);
  if (!byteLength || byteLength > MAX_AUDIO_BYTES) {
    throw Object.assign(new Error('Voice notes must be between a few bytes and 8 MB. Please record a shorter note.'), {
      status: 413,
      code: 'VOICE_AUDIO_TOO_LARGE',
    });
  }

  return { mimeType, base64, byteLength };
}

export async function onRequestPost(context) {
  let reservation = null;
  const env = context.env || {};
  try {
    const user = assertAuthenticated(context.data?.user);
    if (context.data?.entitlements?.capabilities?.webStudio !== true) {
      return errorResponse('Voice-note transcription is available through an entitled Web Studio workspace.', 403, 'FEATURE_NOT_INCLUDED');
    }

    const payload = await readJson(context.request, MAX_BODY_BYTES);
    const audio = parseAudioDataUrl(payload?.audio);
    if (!env.AI || typeof env.AI.run !== 'function') {
      return errorResponse('Voice-note transcription is temporarily unavailable. You can still use text dictation when your browser supports it.', 503, 'VOICE_TRANSCRIPTION_UNAVAILABLE');
    }

    const durationMs = Number(payload?.durationMs);
    if (Number.isFinite(durationMs) && durationMs > 180_000) {
      return errorResponse('Voice notes are limited to three minutes. Please record a shorter message.', 413, 'VOICE_NOTE_TOO_LONG');
    }

    reservation = await beginAIQuota(env, user);
    let result;
    try {
      result = await env.AI.run('@cf/openai/whisper', {
        audio: audio.base64,
        task: 'transcribe',
      });
    } catch (modelError) {
      await refundDailyPrompt(env, reservation).catch(refundError => {
        console.error('[OVYX VOICE TRANSCRIPTION QUOTA REFUND]', refundError?.message || refundError);
      });
      reservation = null;
      throw Object.assign(new Error('OVYX could not transcribe this voice note. Check the recording and try again.'), {
        status: 503,
        code: 'VOICE_TRANSCRIPTION_FAILED',
      });
    }

    const transcript = String(result?.text || result?.transcription_info?.text || '').trim().slice(0, 20_000);
    if (!transcript) {
      await refundDailyPrompt(env, reservation).catch(() => {});
      reservation = null;
      return errorResponse('No clear speech was detected. Try speaking a little closer to the microphone.', 422, 'VOICE_TRANSCRIPTION_EMPTY');
    }

    const estimatedAudioMinutes = Math.max(1 / 60, Math.min(3, Number.isFinite(durationMs) && durationMs > 0 ? durationMs / 60_000 : audio.byteLength / 320_000));
    const quota = await finalizeAIQuota(
      env,
      reservation,
      {
        input_tokens: Math.max(1, Math.ceil(estimatedAudioMinutes * 250)),
        output_tokens: Math.max(1, Math.ceil(transcript.length / 4)),
      },
      '[voice note transcription: ' + estimatedAudioMinutes.toFixed(2) + ' audio minutes]',
      transcript
    );
    reservation = null;

    return jsonResponse({
      ok: true,
      transcript,
      wordCount: Number(result?.word_count || transcript.split(/\s+/).filter(Boolean).length),
      provider: 'cloudflare-workers-ai',
      model: '@cf/openai/whisper',
      quota,
    });
  } catch (error) {
    if (reservation) await refundDailyPrompt(env, reservation).catch(() => {});
    return errorResponse(
      error?.message || 'OVYX could not transcribe the voice note.',
      error?.status || 500,
      error?.code || 'VOICE_TRANSCRIPTION_FAILED'
    );
  }
}

export async function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Use POST to transcribe a voice note.' }, 405, { Allow: 'POST' });
}
