// Stage 3 CPU/WASM worker. It is created only after explicit user action.
// Prompts and generated text stay inside this worker and are never sent as network bodies.
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1';
const MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct';
const MODEL_REVISION = 'cc5cc01a65cc3ff17bdb73a7de33d879f62599b0';
let generator = null;
let TextStreamerClass = null;
let loading = false;
let generating = false;
const MODEL_CACHE_NAME = 'ovyx-local-ai-cpu-model-v1';
let modelFetchCacheInstalled = false;

function installModelFetchCache() {
  if (modelFetchCacheInstalled || typeof globalThis.fetch !== 'function' || typeof caches === 'undefined') return;
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    let request;
    try {
      request = input instanceof Request ? new Request(input, init) : new Request(input, init);
    } catch (_) {
      return nativeFetch(input, init);
    }
    let url;
    try { url = new URL(request.url); } catch (_) { return nativeFetch(input, init); }
    const isPinnedModelAsset =
      request.method === 'GET'
      && !request.headers.has('range')
      && (url.hostname === 'huggingface.co' || url.hostname.endsWith('.huggingface.co'))
      && url.pathname.includes('/' + MODEL_ID + '/');
    if (!isPinnedModelAsset) return nativeFetch(input, init);

    let cache;
    try {
      cache = await caches.open(MODEL_CACHE_NAME);
      const cached = await cache.match(request, { ignoreVary: true });
      if (cached) {
        self.postMessage({ type: 'cache-hit', file: url.pathname.split('/').slice(-2).join('/').slice(0, 120) });
        return cached;
      }
    } catch (_) {
      // Cache access is an optimization; allow the original network request.
    }

    const response = await nativeFetch(input, init);
    if (response.ok && response.status === 200 && !response.headers.has('content-range')) {
      try {
        // Await the cloned response write so a completed load cannot race a
        // reload before the model asset has been committed to Cache Storage.
        await cache?.put(request, response.clone());
      } catch (_) {
        self.postMessage({
          type: 'cache-warning',
          message: 'The browser could not persist one local model file. This device may need to download it again after reload.',
        });
      }
    }
    return response;
  };
  modelFetchCacheInstalled = true;
}

function safeMessage(error) {
  return String(error?.message || error || 'CPU/WASM local inference failed.')
    .replace(/\s+/g, ' ')
    .slice(0, 420);
}

function sendProgress(info) {
  let progress = Number(info?.progress);
  if (Number.isFinite(progress) && progress > 1) progress /= 100;
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) progress = 0;
  const label = String(info?.file || info?.name || 'local model assets').slice(0, 120);
  const stage = String(info?.status || 'loading').slice(0, 40);
  self.postMessage({
    type: 'progress',
    progress,
    text: stage === 'progress_total'
      ? 'CPU/WASM model download and preparation: ' + Math.round(progress * 100) + '%'
      : 'Preparing CPU/WASM model assets (' + stage + '): ' + label,
  });
}

self.addEventListener('message', async event => {
  const data = event.data || {};
  if (data.type === 'load') {
    if (loading || generator) {
      self.postMessage({ type: generator ? 'ready' : 'error', modelId: MODEL_ID, message: 'CPU model is already loaded or loading.' });
      return;
    }
    loading = true;
    try {
      installModelFetchCache();
      const { pipeline, TextStreamer: RuntimeTextStreamer, env, LogLevel } = await import(TRANSFORMERS_URL);
      if (typeof pipeline !== 'function' || typeof RuntimeTextStreamer !== 'function') {
        throw new Error('The pinned Transformers.js runtime does not export the text-generation pipeline or TextStreamer API.');
      }
      TextStreamerClass = RuntimeTextStreamer;
      // Expose only the known cache-write warning. The underlying warning can
      // include file/storage details but never prompts or generated response text.
      console.warn = (...args) => {
        const message = String(args[0] || '');
        if (/Unable to add response to browser cache/i.test(message)) {
          self.postMessage({
            type: 'cache-warning',
            message: 'The browser could not store a downloaded model asset in its cache. A reload may download that asset again.',
          });
        }
        // Keep routine library warnings quiet in this isolated prototype worker.
      };
      env.allowRemoteModels = true;
      env.allowLocalModels = false;
      // The explicit Cache API wrapper above persists full model files by their pinned URL.
      // Disable the library's separate cache path, which failed to store these assets in CI.
      env.useBrowserCache = false;
      env.useWasmCache = true;
      env.logLevel = LogLevel.WARNING;
      generator = await pipeline('text-generation', MODEL_ID, {
        revision: MODEL_REVISION,
        device: 'wasm',
        dtype: 'q8',
        progress_callback: sendProgress,
      });
      self.postMessage({
        type: 'ready',
        modelId: MODEL_ID,
        revision: MODEL_REVISION,
        runtime: '@huggingface/transformers@4.3.1',
        device: 'wasm',
      });
    } catch (error) {
      generator = null;
      TextStreamerClass = null;
      self.postMessage({ type: 'error', stage: 'load', message: safeMessage(error) });
    } finally {
      loading = false;
    }
    return;
  }

  if (data.type === 'generate') {
    if (!generator) {
      self.postMessage({ type: 'error', generationId: data.generationId, stage: 'generation', message: 'Load the CPU/WASM model before generating.' });
      return;
    }
    if (generating) {
      self.postMessage({ type: 'error', generationId: data.generationId, stage: 'generation', message: 'The CPU model is already generating a response.' });
      return;
    }
    generating = true;
    const generationId = Number(data.generationId);
    let outputCharacters = 0;
    try {
      const messages = Array.isArray(data.messages) ? data.messages.slice(-10) : [];
      if (!messages.length || !messages.some(item => item?.role === 'user' && String(item?.content || '').trim())) {
        throw new Error('A non-empty user prompt is required.');
      }
      if (typeof TextStreamerClass !== 'function') throw new Error('The local TextStreamer is unavailable. Reload the CPU/WASM model and retry.');
      const streamer = new TextStreamerClass(generator.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function(text) {
          const piece = String(text || '');
          if (!piece) return;
          outputCharacters += piece.length;
          self.postMessage({ type: 'token', generationId, text: piece });
        },
      });
      const output = await generator(messages, {
        max_new_tokens: Math.max(1, Math.min(384, Number(data.maxNewTokens) || 256)),
        do_sample: false,
        temperature: 0,
        streamer,
      });
      const candidate = output?.[0]?.generated_text;
      const outputText = typeof candidate === 'string'
        ? candidate
        : Array.isArray(candidate)
          ? candidate.filter(item => item?.role === 'assistant').map(item => String(item.content || '')).join(' ')
          : '';
      if (!outputCharacters) outputCharacters = String(outputText || '').length;
      self.postMessage({ type: 'complete', generationId, outputCharacters });
    } catch (error) {
      self.postMessage({ type: 'error', generationId, stage: 'generation', message: safeMessage(error) });
    } finally {
      generating = false;
    }
  }
});

self.addEventListener('unhandledrejection', event => {
  event.preventDefault();
  self.postMessage({ type: 'error', stage: 'worker', message: safeMessage(event.reason) });
});