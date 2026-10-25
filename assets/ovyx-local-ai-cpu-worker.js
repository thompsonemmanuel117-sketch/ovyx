// Stage 3 CPU/WASM worker. It is created only after explicit user action.
// Prompts and generated text stay inside this worker and are never sent as network bodies.
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1';
const MODEL_CONFIGS = Object.freeze({
  'qwen25-05b-cpu': Object.freeze({
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    revision: 'cc5cc01a65cc3ff17bdb73a7de33d879f62599b0',
    dtype: 'q8',
  }),
  'smollm2-135m-cpu': Object.freeze({
    id: 'onnx-community/SmolLM2-135M-Instruct-ONNX',
    revision: 'b8a5c0f183b78c55955a5364f610c36668b5e681',
    dtype: 'q8',
  }),
});
let activeModel = null;
let activeModelId = '';
let activeModelRevision = '';
let generator = null;
let TextStreamerClass = null;
let loading = false;
let generating = false;
const MODEL_CACHE_VERSION = 1;
const pendingModelCacheWrites = new Set();
let modelFetchCacheInstalled = false;

async function hashModelUrl(url) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url.origin + url.pathname));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function modelContentType(url) {
  if (/\.json$/i.test(url.pathname)) return 'application/json';
  if (/\.wasm$/i.test(url.pathname)) return 'application/wasm';
  if (/\.(?:txt|vocab|merges)$/i.test(url.pathname)) return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

async function readCachedModelAsset(url) {
  const root = await navigator.storage.getDirectory();
  const key = await hashModelUrl(url);
  const metadataHandle = await root.getFileHandle(key + '.meta', { create: false });
  const metadataFile = await metadataHandle.getFile();
  const metadata = JSON.parse(await metadataFile.text());
  if (metadata.version !== MODEL_CACHE_VERSION || metadata.urlPath !== url.pathname) return null;
  const dataHandle = await root.getFileHandle(key + '.bin', { create: false });
  const dataFile = await dataHandle.getFile();
  if (!Number.isFinite(metadata.sizeBytes) || metadata.sizeBytes <= 0 || dataFile.size !== metadata.sizeBytes) return null;
  return new Response(dataFile.stream(), {
    status: 200,
    headers: {
      'content-type': String(metadata.contentType || modelContentType(url)),
      'content-length': String(dataFile.size),
    },
  });
}

async function readCachedModelRangeProbe(url) {
  const root = await navigator.storage.getDirectory();
  const key = await hashModelUrl(url);
  const metadataHandle = await root.getFileHandle(key + '.meta', { create: false });
  const metadata = JSON.parse(await (await metadataHandle.getFile()).text());
  if (metadata.version !== MODEL_CACHE_VERSION || metadata.urlPath !== url.pathname) return null;
  const dataHandle = await root.getFileHandle(key + '.bin', { create: false });
  const dataFile = await dataHandle.getFile();
  if (!Number.isFinite(metadata.sizeBytes) || metadata.sizeBytes <= 0 || dataFile.size !== metadata.sizeBytes) return null;
  return new Response(dataFile.slice(0, 1).stream(), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'content-type': String(metadata.contentType || modelContentType(url)),
      'content-length': '1',
      'content-range': 'bytes 0-0/' + dataFile.size,
      'accept-ranges': 'bytes',
    },
  });
}

async function persistModelAsset(url, response) {
  if (!response.body) throw new Error('Model response has no readable body.');
  const root = await navigator.storage.getDirectory();
  const key = await hashModelUrl(url);
  const dataHandle = await root.getFileHandle(key + '.bin', { create: true });
  const writable = await dataHandle.createWritable();
  try {
    await response.body.pipeTo(writable);
  } catch (error) {
    try { await writable.abort(); } catch (_) {}
    throw error;
  }
  const dataFile = await dataHandle.getFile();
  if (!dataFile.size) throw new Error('Model asset cache write completed with an empty file.');
  const metadata = {
    version: MODEL_CACHE_VERSION,
    urlPath: url.pathname,
    sizeBytes: dataFile.size,
    contentType: modelContentType(url),
    savedAt: new Date().toISOString(),
  };
  const metadataHandle = await root.getFileHandle(key + '.meta', { create: true });
  const metadataWriter = await metadataHandle.createWritable();
  await metadataWriter.write(JSON.stringify(metadata));
  await metadataWriter.close();
}

const inFlightModelAssets = new Map();

function installModelFetchCache() {
  if (modelFetchCacheInstalled || typeof globalThis.fetch !== 'function') return;
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
    const isModelRepoAsset =
      (url.hostname === 'huggingface.co' || url.hostname.endsWith('.huggingface.co'))
      && url.pathname.includes('/' + activeModelId + '/');
    if (!isModelRepoAsset) return nativeFetch(input, init);

    // Transformers.js can probe resolve/main even when pipeline() receives a
    // pinned revision. Never let that mutable alias reach the network.
    if (url.pathname.includes('/resolve/main/')) {
      url.pathname = url.pathname.replace('/resolve/main/', '/resolve/' + activeModelRevision + '/');
      request = new Request(url.href, {
        method: request.method,
        headers: request.headers,
        mode: request.mode,
        credentials: request.credentials,
        cache: request.cache,
        redirect: request.redirect,
        referrer: request.referrer,
        referrerPolicy: request.referrerPolicy,
        integrity: request.integrity,
        signal: request.signal,
      });
      url = new URL(request.url);
    }

    const range = request.headers.get('range');
    if (request.method === 'GET' && /^bytes=0-0$/i.test(String(range || ''))) {
      try {
        const cachedProbe = await readCachedModelRangeProbe(url);
        if (cachedProbe) {
          self.postMessage({ type: 'cache-hit', file: url.pathname.split('/').slice(-2).join('/').slice(0, 120) });
          return cachedProbe;
        }
      } catch (_) {
        // The initial one-byte probe must go to the model host until weights are cached.
      }
    }
    const cacheableRequest = request.method === 'GET' && !range;
    if (!cacheableRequest) return nativeFetch(request);
    const cacheKey = await hashModelUrl(url);

    try {
      const cached = await readCachedModelAsset(url);
      if (cached) {
        self.postMessage({ type: 'cache-hit', file: url.pathname.split('/').slice(-2).join('/').slice(0, 120) });
        return cached;
      }
    } catch (_) {
      // Missing or incomplete files are treated as cache misses.
    }

    // Some model runtimes request the same weight through both a default alias
    // and the pinned revision during initialization. Share one network response
    // and one OPFS write rather than downloading the same large weight twice.
    const existing = inFlightModelAssets.get(cacheKey);
    if (existing) {
      const sharedResponse = await existing.responsePromise;
      return sharedResponse.clone();
    }

    let resolveSharedResponse;
    let rejectSharedResponse;
    const responsePromise = new Promise((resolve, reject) => {
      resolveSharedResponse = resolve;
      rejectSharedResponse = reject;
    });
    responsePromise.catch(() => {});
    const entry = { responsePromise, writePromise: null };
    inFlightModelAssets.set(cacheKey, entry);

    try {
      const response = await nativeFetch(request);
      const sharedResponse = response.clone();
      resolveSharedResponse(sharedResponse);
      if (response.ok && response.status === 200 && !response.headers.has('content-range')) {
        const write = persistModelAsset(url, response.clone()).then(() => {
          self.postMessage({
            type: 'cache-write-complete',
            file: url.pathname.split('/').slice(-2).join('/').slice(0, 120),
          });
        }).catch(error => {
          const reason = String(error?.name || 'CacheError') + ': ' +
            String(error?.message || 'cache write rejected').replace(/https?:\/\/\S+/gi, '[asset URL]').slice(0, 120);
          self.postMessage({
            type: 'cache-warning',
            message: 'The browser could not persist one local model file (' + reason + '). This device may need to download it again after reload.',
          });
        });
        entry.writePromise = write;
        pendingModelCacheWrites.add(write);
        write.finally(() => {
          pendingModelCacheWrites.delete(write);
          if (inFlightModelAssets.get(cacheKey) === entry) inFlightModelAssets.delete(cacheKey);
        });
      } else if (inFlightModelAssets.get(cacheKey) === entry) {
        inFlightModelAssets.delete(cacheKey);
      }
      return response;
    } catch (error) {
      rejectSharedResponse(error);
      if (inFlightModelAssets.get(cacheKey) === entry) inFlightModelAssets.delete(cacheKey);
      throw error;
    }
  };
  modelFetchCacheInstalled = true;
}

async function flushModelCacheWrites() {
  await Promise.allSettled(Array.from(pendingModelCacheWrites));
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
      self.postMessage({ type: generator ? 'ready' : 'error', modelId: activeModelId, revision: activeModelRevision, message: 'CPU model is already loaded or loading.' });
      return;
    }
    const model = MODEL_CONFIGS[String(data.modelKey || '')];
    if (!model) {
      self.postMessage({ type: 'error', stage: 'load', message: 'Choose a supported CPU/WASM model from the local-AI lab before loading.' });
      return;
    }
    activeModel = model;
    activeModelId = model.id;
    activeModelRevision = model.revision;
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
      generator = await pipeline('text-generation', activeModel.id, {
        revision: activeModel.revision,
        device: 'wasm',
        dtype: activeModel.dtype,
        progress_callback: sendProgress,
      });
      await flushModelCacheWrites();
      self.postMessage({
        type: 'ready',
        modelId: activeModel.id,
        revision: activeModel.revision,
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