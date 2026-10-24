(() => {
  'use strict';

  // Stage 3 only: no application AI route, account token, or provider API is used here.
  const RUNTIME_URL = 'https://esm.run/@mlc-ai/web-llm@0.2.86';
  // Pin the model data revision and matching MLC binary-library repository
  // commit separately from the npm package. This avoids mutable "main" URLs.
  const MLC_BINARY_COMMIT = '00fe7a40e57e5e8eb9fef87526a4bf28ad5846c0';
  const MODELS = Object.freeze({
    'qwen35-4b': Object.freeze({
      id: 'Qwen3.5-4B-q4f16_1-MLC',
      label: 'Qwen3.5 4B',
      sizeBytes: 2_390_000_000,
      sizeLabel: '2.39 GB',
      vramMB: 3867.82,
      vramLabel: '3.87 GB',
      context: 4096,
      card: 'https://huggingface.co/Qwen/Qwen3.5-4B',
      files: 'https://huggingface.co/mlc-ai/Qwen3.5-4B-q4f16_1-MLC',
      artifactUrl: 'https://huggingface.co/mlc-ai/Qwen3.5-4B-q4f16_1-MLC/resolve/44b4246',
    }),
    'qwen35-2b': Object.freeze({
      id: 'Qwen3.5-2B-q4f32_1-MLC',
      label: 'Qwen3.5 2B',
      sizeBytes: 1_080_000_000,
      sizeLabel: '1.08 GB',
      vramMB: 2591.55,
      vramLabel: '2.59 GB',
      context: 4096,
      card: 'https://huggingface.co/Qwen/Qwen3.5-2B',
      files: 'https://huggingface.co/mlc-ai/Qwen3.5-2B-q4f32_1-MLC',
      artifactUrl: 'https://huggingface.co/mlc-ai/Qwen3.5-2B-q4f32_1-MLC/resolve/d835e5c',
    }),
    'qwen35-08b': Object.freeze({
      id: 'Qwen3.5-0.8B-q4f16_1-MLC',
      label: 'Qwen3.5 0.8B',
      sizeBytes: 447_000_000,
      sizeLabel: '447 MB',
      vramMB: 1629.49,
      vramLabel: '1.63 GB',
      context: 4096,
      card: 'https://huggingface.co/Qwen/Qwen3.5-0.8B',
      files: 'https://huggingface.co/mlc-ai/Qwen3.5-0.8B-q4f16_1-MLC',
      artifactUrl: 'https://huggingface.co/mlc-ai/Qwen3.5-0.8B-q4f16_1-MLC/resolve/0ec1389',
    }),
    'qwen25-05b-cpu': Object.freeze({
      id: 'onnx-community/Qwen2.5-0.5B-Instruct',
      label: 'Qwen2.5 0.5B CPU/WASM',
      runtime: 'cpu-wasm',
      revision: 'cc5cc01a65cc3ff17bdb73a7de33d879f62599b0',
      sizeBytes: 512_000_000,
      sizeLabel: 'about 512 MB of q8 model weights',
      vramMB: null,
      vramLabel: 'No GPU memory requirement',
      context: 4096,
      card: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct',
      files: 'https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct',
    }),
  });
  const CPU_RUNTIME_LABEL = '@huggingface/transformers@4.3.1 · ONNX Runtime WASM';
  const SYSTEM_PROMPT = [
    'You are OVYX Local AI, a helpful assistant running on the user’s own device.',
    'Be honest about uncertainty. For code, explain the concrete fix and preserve existing structure when possible.',
    'Do not claim you executed code, tested a site, inspected files, or used tools unless the user supplied the evidence in this conversation.',
    'This prototype has no project access and cannot run tools. Do not pretend otherwise.',
  ].join(' ');
  const LOAD_INACTIVITY_TIMEOUT_MS = 180000;
  const GENERATION_INACTIVITY_TIMEOUT_MS = 120000;

  const el = (id) => document.getElementById(id);
  const modelSelect = el('model-choice');
  const startButton = el('start-local-ai');
  const cancelButton = el('cancel-local-ai');
  const unloadButton = el('unload-local-ai');
  const deviceStatus = el('device-status');
  const progressWrap = el('progress-wrap');
  const progressBar = el('load-progress');
  const progressNote = el('progress-note');
  const enginePill = el('engine-pill');
  const chatLog = el('chat-log');
  const promptForm = el('prompt-form');
  const promptInput = el('local-prompt');
  const sendButton = el('send-local-prompt');
  const stopButton = el('stop-generation');
  const clearButton = el('clear-chat');
  const modelDetails = el('model-details');
  const prepareDiagnosticsButton = el('prepare-diagnostics');
  const diagnosticsOutput = el('diagnostics-output');

  const diagnosticsState = {
    runtime: '@mlc-ai/web-llm@0.2.86',
    modelLoad: null,
    storage: {},
    generations: [],
    lastError: null,
  };
  let activeLoadMetrics = null;

  let gpuAdapter = null;
  let gpuAvailable = false;
  let engine = null;
  let worker = null;
  let cpuReady = false;
  let activeCpuGeneration = null;
  let loadedModelKey = '';
  let loading = false;
  let generating = false;
  let stopRequested = false;
  let loadEpoch = 0;
  let generationEpoch = 0;
  let cancelLoadReject = null;
  let loadWatchdog = 0;
  let conversation = [];
  let emptyChatNode = el('chat-empty');

  function selectedModelKey() {
    return MODELS[modelSelect.value] ? modelSelect.value : 'qwen35-4b';
  }

  function isCpuModelKey(key) {
    return MODELS[key]?.runtime === 'cpu-wasm';
  }

  function modelIsLoaded(key = loadedModelKey) {
    return Boolean(key && (isCpuModelKey(key) ? cpuReady : engine));
  }

  function setStatus(message, kind = 'info') {
    deviceStatus.textContent = String(message || '');
    deviceStatus.dataset.kind = kind;
  }

  function getErrorMessage(error) {
    const raw = String(error?.message || error || 'The local runtime returned an unknown error.');
    return raw.replace(/\s+/g, ' ').slice(0, 460);
  }

  function showProgress(visible, text = '') {
    progressWrap.classList.toggle('hidden', !visible);
    progressWrap.style.display = visible ? 'block' : 'none';
    if (text) progressNote.textContent = text;
    if (!visible) progressBar.value = 0;
  }

  function clearLoadWatchdog() {
    if (loadWatchdog) window.clearTimeout(loadWatchdog);
    loadWatchdog = 0;
  }

  function armLoadWatchdog(epoch) {
    clearLoadWatchdog();
    loadWatchdog = window.setTimeout(() => {
      if (!loading || epoch !== loadEpoch) return;
      const elapsedMs = activeLoadMetrics
        ? Math.round(performance.now() - activeLoadMetrics.startedAt)
        : (diagnosticsState.modelLoad?.durationMs ?? null);
      cancelLoading();
      if (diagnosticsState.modelLoad) {
        diagnosticsState.modelLoad.status = 'timeout';
        diagnosticsState.modelLoad.finishedAt = new Date().toISOString();
        diagnosticsState.modelLoad.durationMs = elapsedMs;
      }
      diagnosticsState.lastError = { at: new Date().toISOString(), stage: 'model-load', message: 'No model initialization progress for 3 minutes.' };
      setStatus('Local model setup stopped after 3 minutes without progress. Check network or storage and retry. No provider fallback was used.', 'error');
    }, LOAD_INACTIVITY_TIMEOUT_MS);
  }

  function updateProgress(report) {
    if (!loading) return;
    armLoadWatchdog(loadEpoch);
    const text = String(report?.text || 'Preparing the local model…').slice(0, 220);
    progressNote.textContent = text;
    const progress = Number(report?.progress);
    if (Number.isFinite(progress) && progress >= 0 && progress <= 1) {
      progressBar.value = Math.round(progress * 100);
      if (diagnosticsState.modelLoad) diagnosticsState.modelLoad.lastReportedProgressPercent = Math.round(progress * 100);
    } else {
      progressBar.value = 0;
    }
  }

  function withGenerationInactivityTimeout(promise, message) {
    let timer = 0;
    const timeout = new Promise((resolve, reject) => {
      timer = window.setTimeout(() => {
        const error = new Error(message);
        error.code = 'LOCAL_GENERATION_IDLE_TIMEOUT';
        reject(error);
      }, GENERATION_INACTIVITY_TIMEOUT_MS);
    });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
      if (timer) window.clearTimeout(timer);
    });
  }

  function refreshControls() {
    const modelLoaded = modelIsLoaded();
    const selectedCpu = isCpuModelKey(selectedModelKey());
    startButton.classList.toggle('hidden', modelLoaded);
    startButton.disabled = (!selectedCpu && !gpuAvailable) || loading || generating || modelLoaded;
    cancelButton.classList.toggle('hidden', !loading);
    cancelButton.disabled = !loading;
    unloadButton.classList.toggle('hidden', !modelLoaded);
    unloadButton.disabled = !modelLoaded || loading || generating;
    modelSelect.disabled = loading || generating || modelLoaded;
    promptInput.disabled = !modelLoaded || generating;
    sendButton.disabled = !modelLoaded || loading || generating || !promptInput.value.trim();
    clearButton.disabled = generating;
    stopButton.classList.toggle('hidden', !generating);
    stopButton.disabled = !generating;
    enginePill.textContent = modelLoaded
      ? 'LOCAL MODEL READY'
      : (loading ? 'LOADING LOCALLY' : 'MODEL NOT LOADED');
    enginePill.style.color = modelLoaded ? '#8fe0b4' : (loading ? '#ffd28a' : '');
  }

  function updateModelDetails() {
    const key = selectedModelKey();
    const model = MODELS[key];
    if (isCpuModelKey(key)) {
      modelDetails.textContent =
        model.label + ' · Apache-2.0\n' +
        'Runtime: Transformers.js 4.3.1 + ONNX Runtime WASM (CPU only)\n' +
        'Approximate q8 model weights: 512 MB, plus tokenizer/runtime/cache overhead\n' +
        'No WebGPU or GPU memory is required. CPU generation will be slower and this smaller model is not yet quality-certified.\n' +
        'Pinned model revision: ' + model.revision + '\n' +
        'Model files: ' + model.files;
      return;
    }
    modelDetails.textContent =
      model.label + ' · Apache-2.0\n' +
      'Approximate model files: ' + model.sizeLabel + '\n' +
      'WebLLM estimated GPU memory requirement: ' + model.vramLabel + '\n' +
      'Context window configured for this browser build: ' + model.context.toLocaleString() + ' tokens\n' +
      'Model files: ' + model.files;
  }

  function appendMessage(role, text) {
    if (emptyChatNode?.isConnected) {
      emptyChatNode.remove();
      emptyChatNode = null;
    }
    const box = document.createElement('article');
    box.className = 'message ' + (role === 'user' ? 'user' : 'assistant');
    const label = document.createElement('span');
    label.className = 'role';
    label.textContent = role === 'user' ? 'YOU' : 'OVYX LOCAL AI';
    const body = document.createElement('div');
    body.className = 'message-body';
    body.textContent = String(text || '');
    box.append(label, body);
    chatLog.appendChild(box);
    chatLog.scrollTop = chatLog.scrollHeight;
    return body;
  }

  function addEmptyChat() {
    if (chatLog.querySelector('.message')) return;
    const p = document.createElement('p');
    p.id = 'chat-empty';
    p.className = 'empty';
    p.textContent = 'Load a model first. Then send a real prompt and watch the response stream from the browser-local engine.';
    chatLog.appendChild(p);
    emptyChatNode = p;
  }

  async function checkWebGPU() {
    gpuAvailable = false;
    gpuAdapter = null;
    if (!window.isSecureContext) {
      setStatus('WebGPU requires a secure context. Open this page over HTTPS or localhost; no model files have been requested.', 'error');
      refreshControls();
      return;
    }
    if (!navigator.gpu || typeof navigator.gpu.requestAdapter !== 'function') {
      setStatus('WebGPU is not available in this browser. Choose the explicit CPU/WASM model to test local inference without a GPU. OVYX will not switch models or send prompts to a cloud provider automatically.', 'error');
      refreshControls();
      return;
    }
    try {
      gpuAdapter = await Promise.race([
        navigator.gpu.requestAdapter(),
        new Promise((resolve) => window.setTimeout(() => resolve(null), 8000)),
      ]);
      gpuAvailable = Boolean(gpuAdapter);
      if (gpuAvailable) {
        setStatus('WebGPU is detected. This does not prove enough GPU memory is available; the model load itself must pass. No model has been downloaded.', 'ok');
      } else {
        setStatus('The browser did not provide a usable WebGPU adapter. No WebGPU model was downloaded; choose CPU/WASM explicitly to try the separate local model.', 'error');
      }
    } catch (error) {
      setStatus('WebGPU compatibility check failed: ' + getErrorMessage(error) + ' No model was downloaded.', 'error');
    }
    refreshControls();
  }

  function buildPinnedAppConfig(webllm, model) {
    const baseConfig = webllm.prebuiltAppConfig;
    const registered = baseConfig?.model_list?.find((item) => item.model_id === model.id);
    if (!registered) {
      throw new Error('The pinned WebLLM 0.2.86 registry does not register ' + model.id + '. Stop here and fix model/runtime compatibility; do not substitute a hosted model.');
    }
    const libraryFile = String(registered.model_lib || '').split('/').pop();
    if (!libraryFile || !libraryFile.startsWith(model.id.replace(/-MLC$/, '').replace(/-q4f(?:16|32)_1$/, ''))) {
      // Model names and compiled kernels should remain paired. Do not derive a
      // library URL from an unrelated model record.
      throw new Error('The registered model-library filename did not match the selected local model.');
    }
    const modelLibraryUrl =
      'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/' +
      MLC_BINARY_COMMIT + '/web-llm-models/v0_2_86/base/' + libraryFile;
    const pinnedRecord = {
      ...registered,
      model: model.artifactUrl,
      model_lib: modelLibraryUrl,
      overrides: { ...(registered.overrides || {}), context_window_size: model.context, max_history_size: 1 },
    };
    const appConfig = {
      ...baseConfig,
      model_list: (Array.isArray(baseConfig?.model_list) ? baseConfig.model_list : [])
        .map((item) => item.model_id === model.id ? pinnedRecord : item),
    };
    if (!appConfig.model_list.some((item) => item.model_id === model.id && item.model === model.artifactUrl)) {
      throw new Error('The selected local model could not be pinned in WebLLM configuration.');
    }
    return { appConfig, record: pinnedRecord };
  }

  async function checkStorage(webllm, model, appConfig) {
    let cachedWeights = false;
    let cacheWasChecked = false;
    try {
      cachedWeights = await webllm.hasModelInCache(model.id, appConfig);
      cacheWasChecked = true;
    } catch (_) {
      // If cache inspection is unsupported, the pinned runtime's loader remains authoritative.
    }

    let storageWarning = '';
    try {
      const estimate = await navigator.storage?.estimate?.();
      const quota = Number(estimate?.quota);
      const usage = Number(estimate?.usage);
      if (Number.isFinite(quota) && quota > 0 && Number.isFinite(usage)) {
        const available = Math.max(0, quota - usage);
        diagnosticsState.storage = {
          quotaBytes: quota,
          usageBytes: usage,
          estimatedAvailableBytes: available,
          modelCacheChecked: cacheWasChecked,
          modelWeightsCached: cachedWeights,
        };
        // Leave room for the runtime, model metadata, tokenizer and browser bookkeeping.
        const required = (cachedWeights ? 0 : model.sizeBytes) + 350_000_000;
        if (available < required) {
          throw new Error(
            'This browser estimates only ' + (available / 1e9).toFixed(2) +
            ' GB of free site storage. The selected model needs about ' +
            model.sizeLabel + ' plus runtime/cache overhead. Free browser storage or choose the smaller model.'
          );
        }
      } else {
        storageWarning = 'The browser could not estimate free storage; the model loader will determine whether caching succeeds.';
      }
    } catch (error) {
      if (error instanceof Error && /estimates only/.test(error.message)) throw error;
      storageWarning = 'The browser storage estimate was unavailable; the model loader will determine whether caching succeeds.';
    }

    let persistent = false;
    try {
      persistent = Boolean(await navigator.storage?.persist?.());
    } catch (_) {}
    diagnosticsState.storage = {
      ...(diagnosticsState.storage || {}),
      modelCacheChecked: cacheWasChecked,
      modelWeightsCached: cachedWeights,
      persistentStorageGranted: persistent,
      storageWarning: storageWarning || '',
    };
    return {
      cachedWeights,
      cacheWasChecked,
      persistent,
      storageWarning,
    };
  }

  function cancelLoading() {
    if (!loading) return;
    loadEpoch += 1;
    clearLoadWatchdog();
    loading = false;
    const reject = cancelLoadReject;
    cancelLoadReject = null;
    if (diagnosticsState.modelLoad && activeLoadMetrics) {
      diagnosticsState.modelLoad.status = 'cancelled';
      diagnosticsState.modelLoad.finishedAt = new Date().toISOString();
      diagnosticsState.modelLoad.durationMs = Math.round(performance.now() - activeLoadMetrics.startedAt);
    }
    activeLoadMetrics = null;
    const currentWorker = worker;
    worker = null;
    try { currentWorker?.terminate(); } catch (_) {}
    engine = null;
    cpuReady = false;
    activeCpuGeneration = null;
    loadedModelKey = '';
    if (typeof reject === 'function') {
      reject(new Error('Model initialization was cancelled by the user.'));
    }
    showProgress(false);
    setStatus('Cancelled. No prompt was sent to an AI provider. Fully downloaded model files may remain in the browser cache, so retrying can reuse completed assets.', 'warn');
    refreshControls();
  }

  async function startCpuLocalModel(key, model) {
    if (!window.isSecureContext) {
      setStatus('CPU/WASM local inference requires HTTPS or localhost. No model files were requested.', 'error');
      refreshControls();
      return;
    }
    const thisLoad = ++loadEpoch;
    activeLoadMetrics = { modelKey: key, modelId: model.id, startedAt: performance.now() };
    diagnosticsState.runtime = CPU_RUNTIME_LABEL;
    diagnosticsState.modelLoad = {
      modelKey: key,
      modelId: model.id,
      modelLabel: model.label,
      approximateDownloadBytes: model.sizeBytes,
      estimatedGpuMemoryMB: null,
      contextTokens: model.context,
      startedAt: new Date().toISOString(),
      status: 'loading',
      lastReportedProgressPercent: 0,
      runtime: CPU_RUNTIME_LABEL,
      device: 'wasm',
    };
    diagnosticsState.lastError = null;
    loading = true;
    cpuReady = false;
    armLoadWatchdog(thisLoad);
    showProgress(true, 'Preparing the pinned Transformers.js runtime; the q8 model downloads only after this explicit action…');
    setStatus('Starting the separately selected CPU/WASM model. No GPU is required and no hosted inference fallback will be used.', 'warn');
    refreshControls();

    let localWorker = null;
    try {
      let estimate = null;
      try { estimate = await navigator.storage?.estimate?.(); } catch (_) {}
      const quota = Number(estimate?.quota);
      const usage = Number(estimate?.usage);
      const available = Number.isFinite(quota) && quota > 0 && Number.isFinite(usage) ? Math.max(0, quota - usage) : null;
      let persistent = false;
      try { persistent = Boolean(await navigator.storage?.persist?.()); } catch (_) {}
      diagnosticsState.storage = {
        quotaBytes: Number.isFinite(quota) ? quota : null,
        usageBytes: Number.isFinite(usage) ? usage : null,
        estimatedAvailableBytes: available,
        modelCacheChecked: false,
        persistentStorageGranted: persistent,
        runtime: 'Transformers.js browser cache + WASM cache',
      };
      if (available !== null && available < model.sizeBytes + 180_000_000) {
        throw new Error(
          'This browser estimates only ' + (available / 1e6).toFixed(0) +
          ' MB of free site storage; the selected q8 weights need about 512 MB plus runtime/cache overhead. Free storage or choose another explicitly listed model.'
        );
      }
      if (thisLoad !== loadEpoch) return;

      localWorker = new Worker('/assets/ovyx-local-ai-cpu-worker.js', { type: 'module', name: 'ovyx-local-ai-cpu-worker' });
      worker = localWorker;
      const cancellationPromise = new Promise((_, reject) => { cancelLoadReject = reject; });
      const readyPromise = new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
          localWorker.removeEventListener('message', onMessage);
          localWorker.removeEventListener('error', onError);
        };
        const finish = (fn, value) => {
          if (settled) return;
          settled = true;
          cleanup();
          fn(value);
        };
        const onMessage = event => {
          if (thisLoad !== loadEpoch) return;
          const data = event.data || {};
          if (data.type === 'progress') updateProgress({ progress: data.progress, text: data.text });
          if (data.type === 'ready' && data.modelId === model.id && data.revision === model.revision) finish(resolve, data);
          if (data.type === 'error') finish(reject, new Error('CPU/WASM ' + String(data.stage || 'model') + ' setup failed: ' + String(data.message || 'Unknown worker error.')));
        };
        const onError = event => {
          finish(reject, new Error('CPU/WASM worker failed to start or load its runtime: ' + getErrorMessage(event?.message || 'Worker error.')));
          event.preventDefault?.();
        };
        localWorker.addEventListener('message', onMessage);
        localWorker.addEventListener('error', onError);
        localWorker.postMessage({ type: 'load' });
      });

      await Promise.race([readyPromise, cancellationPromise]);
      if (thisLoad !== loadEpoch) {
        try { localWorker?.terminate(); } catch (_) {}
        return;
      }
      cpuReady = true;
      loadedModelKey = key;
      if (diagnosticsState.modelLoad && activeLoadMetrics) {
        diagnosticsState.modelLoad.status = 'ready';
        diagnosticsState.modelLoad.finishedAt = new Date().toISOString();
        diagnosticsState.modelLoad.durationMs = Math.round(performance.now() - activeLoadMetrics.startedAt);
        diagnosticsState.modelLoad.lastReportedProgressPercent = 100;
      }
      let cacheNames = [];
      try { cacheNames = await caches.keys(); } catch (_) {}
      diagnosticsState.storage = {
        ...(diagnosticsState.storage || {}),
        modelCacheChecked: true,
        browserCacheApiAvailable: typeof caches !== 'undefined',
        cacheNameCount: cacheNames.length,
        cacheNames: cacheNames.map(String).slice(0, 10),
      };
      activeLoadMetrics = null;
      diagnosticsState.lastError = null;
      clearLoadWatchdog();
      loading = false;
      cancelLoadReject = null;
      showProgress(false);
      setStatus(
        'The ' + model.label + ' model loaded in this browser and runs on CPU/WASM. Prompts stay in the local worker; this lab does not call OVYX AI routes or hosted model-inference APIs. This small model still needs the Stage 4 quality benchmark.',
        'ok'
      );
      refreshControls();
      promptInput.focus();
    } catch (error) {
      if (thisLoad !== loadEpoch) return;
      clearLoadWatchdog();
      loading = false;
      cancelLoadReject = null;
      try { localWorker?.terminate(); } catch (_) {}
      if (worker === localWorker) worker = null;
      engine = null;
      cpuReady = false;
      loadedModelKey = '';
      if (diagnosticsState.modelLoad && activeLoadMetrics) {
        diagnosticsState.modelLoad.status = 'failed';
        diagnosticsState.modelLoad.finishedAt = new Date().toISOString();
        diagnosticsState.modelLoad.durationMs = Math.round(performance.now() - activeLoadMetrics.startedAt);
      }
      diagnosticsState.lastError = { at: new Date().toISOString(), stage: 'cpu-wasm-model-load', message: getErrorMessage(error) };
      activeLoadMetrics = null;
      showProgress(false);
      setStatus('CPU/WASM model initialization failed. Nothing was sent to a hosted AI provider. ' + getErrorMessage(error) + ' Retry is available; no other model will be selected automatically.', 'error');
      refreshControls();
    } finally {
      if (thisLoad === loadEpoch) {
        clearLoadWatchdog();
        cancelLoadReject = null;
        if (loading && !modelIsLoaded()) {
          loading = false;
          refreshControls();
        }
      }
    }
  }

  async function startLocalModel() {
    if (loading || generating || modelIsLoaded()) return;
    const key = selectedModelKey();
    const model = MODELS[key];
    if (isCpuModelKey(key)) {
      await startCpuLocalModel(key, model);
      return;
    }
    if (!gpuAvailable) {
      setStatus('No usable WebGPU adapter is available. Choose a supported WebGPU model or explicitly select CPU/WASM; no remote inference fallback will be attempted.', 'error');
      refreshControls();
      return;
    }
    const thisLoad = ++loadEpoch;
    activeLoadMetrics = { modelKey: key, modelId: model.id, startedAt: performance.now() };
    diagnosticsState.modelLoad = {
      modelKey: key,
      modelId: model.id,
      modelLabel: model.label,
      approximateDownloadBytes: model.sizeBytes,
      estimatedGpuMemoryMB: model.vramMB,
      contextTokens: model.context,
      startedAt: new Date().toISOString(),
      status: 'loading',
      lastReportedProgressPercent: 0,
    };
    diagnosticsState.lastError = null;
    loading = true;
    armLoadWatchdog(thisLoad);
    showProgress(true, 'Loading the pinned WebLLM runtime; no model response is possible yet…');
    setStatus('Starting local initialization. The selected model files may be large; cancel is available.', 'warn');
    refreshControls();

    let localWorker = null;
    let cancellationPromise;
    try {
      // Runtime code is not even fetched until the user presses the explicit Start button.
      const webllm = await import(RUNTIME_URL);
      if (thisLoad !== loadEpoch) return;
      const { appConfig, record } = buildPinnedAppConfig(webllm, model);
      if (!String(record.model_lib || '').includes(MLC_BINARY_COMMIT + '/web-llm-models/v0_2_86/base/')) {
        throw new Error('The compiled model library is not pinned to the expected WebLLM 0.2.86-compatible artifact revision.');
      }
      if (!gpuAdapter) {
        throw new Error('The WebGPU adapter was lost before model loading started.');
      }
      const storage = await checkStorage(webllm, model, appConfig);
      if (thisLoad !== loadEpoch) return;
      const storageNotes = [
        storage.cachedWeights ? 'Model weights appear to be cached.' : 'Model weights are not cached and will be downloaded after this explicit action.',
        storage.persistent ? 'Browser storage persistence was granted.' : 'Browser storage may be evicted by the browser.',
        storage.storageWarning,
      ].filter(Boolean).join(' ');
      progressNote.textContent = storageNotes;
      setStatus(
        'Runtime compatibility check passed for the pinned registry entry. ' +
        (storage.cacheWasChecked ? (storage.cachedWeights ? 'Cached model weights were detected. ' : 'No complete cached model weights were detected. ') : '') +
        storageNotes,
        storage.cachedWeights ? 'ok' : 'warn'
      );

      localWorker = new Worker('/assets/ovyx-local-ai-worker.js', { type: 'module', name: 'ovyx-local-ai-worker' });
      worker = localWorker;
      cancellationPromise = new Promise((_, reject) => {
        cancelLoadReject = reject;
      });
      localWorker.addEventListener('error', (event) => {
        const workerReason = String(event?.message || '').replace(/\s+/g, ' ').slice(0, 220);
        const detail = workerReason ? ' Browser worker detail: ' + workerReason : '';
        const error = new Error('The local inference worker failed to start. Check WebGPU support, the runtime download, and available memory.' + detail);
        if (loading && thisLoad === loadEpoch && typeof cancelLoadReject === 'function') {
          cancelLoadReject(error);
        } else {
          setStatus(error.message, 'error');
        }
        event.preventDefault?.();
      });

      const initializePromise = webllm.CreateWebWorkerMLCEngine(
        localWorker,
        model.id,
        {
          appConfig,
          initProgressCallback(report) {
            if (thisLoad === loadEpoch) updateProgress(report);
          },
        }
      );
      const readyEngine = await Promise.race([initializePromise, cancellationPromise]);
      if (thisLoad !== loadEpoch) {
        try { await readyEngine?.unload?.(); } catch (_) {}
        return;
      }
      engine = readyEngine;
      cpuReady = false;
      loadedModelKey = key;
      diagnosticsState.runtime = '@mlc-ai/web-llm@0.2.86';
      if (diagnosticsState.modelLoad && activeLoadMetrics) {
        diagnosticsState.modelLoad.status = 'ready';
        diagnosticsState.modelLoad.finishedAt = new Date().toISOString();
        diagnosticsState.modelLoad.durationMs = Math.round(performance.now() - activeLoadMetrics.startedAt);
        diagnosticsState.modelLoad.lastReportedProgressPercent = 100;
      }
      activeLoadMetrics = null;
      diagnosticsState.lastError = null;
      clearLoadWatchdog();
      loading = false;
      cancelLoadReject = null;
      showProgress(false);
      setStatus(
        'The ' + model.label + ' model loaded in this browser. Prompts now go to the local WebLLM engine; no OVYX hosted AI route or model-provider fallback is used by this lab. Record the device, browser, response quality and speed before accepting this model.',
        'ok'
      );
      refreshControls();
      promptInput.focus();
    } catch (error) {
      if (thisLoad !== loadEpoch) return;
      clearLoadWatchdog();
      loading = false;
      cancelLoadReject = null;
      try { localWorker?.terminate(); } catch (_) {}
      if (worker === localWorker) worker = null;
      engine = null;
      cpuReady = false;
      loadedModelKey = '';
      if (diagnosticsState.modelLoad && activeLoadMetrics) {
        diagnosticsState.modelLoad.status = 'failed';
        diagnosticsState.modelLoad.finishedAt = new Date().toISOString();
        diagnosticsState.modelLoad.durationMs = Math.round(performance.now() - activeLoadMetrics.startedAt);
      }
      diagnosticsState.lastError = { at: new Date().toISOString(), stage: 'model-load', message: getErrorMessage(error) };
      activeLoadMetrics = null;
      showProgress(false);
      setStatus(
        'Local model initialization failed. Nothing was sent to a hosted AI provider. ' +
        getErrorMessage(error) +
        ' You may retry or manually choose the smaller model; OVYX will not switch models without your choice.',
        'error'
      );
      refreshControls();
    } finally {
      if (thisLoad === loadEpoch) {
        clearLoadWatchdog();
        cancelLoadReject = null;
        if (loading && !engine) {
          loading = false;
          refreshControls();
        }
      }
    }
  }

  async function unloadLocalModel() {
    if (!modelIsLoaded() || generating || loading) return;
    const currentKey = loadedModelKey;
    const cpuModel = isCpuModelKey(currentKey);
    const currentEngine = engine;
    const currentWorker = worker;
    engine = null;
    worker = null;
    cpuReady = false;
    loadedModelKey = '';
    refreshControls();
    if (!cpuModel) {
      try { await currentEngine?.unload?.(); } catch (_) {}
    }
    try { currentWorker?.terminate(); } catch (_) {}
    setStatus(
      cpuModel
        ? 'Model unloaded from the CPU/WASM worker. Browser-cached model/runtime files are kept for a faster retry; use browser site-data controls if you need to remove the cache.'
        : 'Model unloaded from active GPU memory. Browser-cached files are kept for a faster retry; use browser site-data controls if you need to remove the cache.',
      'ok'
    );
    refreshControls();
  }

  function buildMessages(prompt) {
    // A 4K context must cover system text, the current prompt, history and output.
    // Keep the history to a total character budget and add the current prompt once.
    const prior = conversation.slice(0, -1).slice(-8);
    let remaining = 1800;
    const recent = [];
    for (const item of prior.slice().reverse()) {
      if (remaining <= 0) break;
      const content = String(item.content || '').slice(-Math.min(900, remaining));
      if (!content) continue;
      recent.unshift({ role: item.role, content });
      remaining -= content.length;
    }
    return [{ role: 'system', content: SYSTEM_PROMPT }, ...recent, { role: 'user', content: prompt }];
  }

  function requestCpuGeneration(messages, generationId, onText) {
    const targetWorker = worker;
    if (!targetWorker || !cpuReady) return Promise.reject(new Error('CPU/WASM worker is not ready.'));
    return new Promise((resolve, reject) => {
      let settled = false;
      let idleTimer = 0;
      const cleanup = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = 0;
        targetWorker.removeEventListener('message', onMessage);
        targetWorker.removeEventListener('error', onError);
        if (activeCpuGeneration?.generationId === generationId) activeCpuGeneration = null;
      };
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn(value);
      };
      const armIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          const error = new Error('The CPU/WASM model stopped producing tokens for 2 minutes.');
          error.code = 'LOCAL_GENERATION_IDLE_TIMEOUT';
          finish(reject, error);
        }, GENERATION_INACTIVITY_TIMEOUT_MS);
      };
      const onMessage = event => {
        const data = event.data || {};
        if (Number(data.generationId) !== generationId) return;
        if (data.type === 'token') {
          const piece = String(data.text || '');
          if (piece) {
            armIdleTimer();
            onText(piece);
          }
          return;
        }
        if (data.type === 'complete') finish(resolve, { outputCharacters: Number(data.outputCharacters) || 0 });
        if (data.type === 'error') finish(reject, new Error('CPU/WASM generation failed: ' + String(data.message || 'Unknown worker error.')));
      };
      const onError = event => finish(reject, new Error('CPU/WASM worker stopped unexpectedly: ' + getErrorMessage(event?.message || 'Worker error.')));
      activeCpuGeneration = {
        generationId,
        finish(value) { finish(resolve, value || { stopped: true }); },
        fail(error) { finish(reject, error instanceof Error ? error : new Error(String(error || 'CPU/WASM generation failed.'))); },
      };
      targetWorker.addEventListener('message', onMessage);
      targetWorker.addEventListener('error', onError);
      armIdleTimer();
      targetWorker.postMessage({ type: 'generate', generationId, messages, maxNewTokens: 128 });
    });
  }

  async function sendPrompt(event) {
    event?.preventDefault?.();
    if (!modelIsLoaded() || generating || loading) return;
    const prompt = String(promptInput.value || '').trim().slice(0, 2500);
    if (!prompt) return;

    promptInput.value = '';
    conversation.push({ role: 'user', content: prompt });
    appendMessage('user', prompt);
    const assistantBody = appendMessage('assistant', '');
    generating = true;
    stopRequested = false;
    const thisGeneration = ++generationEpoch;
    const modelAtStart = MODELS[loadedModelKey];
    const generationMetrics = {
      modelKey: loadedModelKey,
      modelId: modelAtStart?.id || '',
      modelLabel: modelAtStart?.label || '',
      runtime: isCpuModelKey(loadedModelKey) ? CPU_RUNTIME_LABEL : '@mlc-ai/web-llm@0.2.86',
      startedAt: new Date().toISOString(),
      startedAtMonotonic: performance.now(),
      promptCharacters: prompt.length,
      firstTokenMs: null,
      totalDurationMs: null,
      outputCharacters: 0,
      status: 'running',
    };
    refreshControls();
    setStatus('Generating on the selected local model. No external inference API is used by this prototype.', 'ok');

    try {
      let answer = '';
      if (isCpuModelKey(generationMetrics.modelKey)) {
        await requestCpuGeneration(buildMessages(prompt), thisGeneration, piece => {
          if (thisGeneration !== generationEpoch || !piece) return;
          if (generationMetrics.firstTokenMs === null) {
            generationMetrics.firstTokenMs = Math.round(performance.now() - generationMetrics.startedAtMonotonic);
          }
          answer += piece;
          assistantBody.textContent = answer;
          chatLog.scrollTop = chatLog.scrollHeight;
        });
      } else {
        const stream = await withGenerationInactivityTimeout(
          engine.chat.completions.create({
            messages: buildMessages(prompt),
            stream: true,
            temperature: 0.6,
            top_p: 0.9,
            max_tokens: 768,
          }),
          'The local model did not start responding within 2 minutes.',
        );
        const iterator = stream[Symbol.asyncIterator]();
        while (thisGeneration === generationEpoch) {
          const next = await withGenerationInactivityTimeout(
            iterator.next(),
            'The local model stopped producing tokens for 2 minutes.',
          );
          if (next.done) break;
          const chunk = next.value;
          const delta = chunk?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) {
            if (generationMetrics.firstTokenMs === null) {
              generationMetrics.firstTokenMs = Math.round(performance.now() - generationMetrics.startedAtMonotonic);
            }
            answer += delta;
            assistantBody.textContent = answer;
            chatLog.scrollTop = chatLog.scrollHeight;
          }
        }
      }
      if (thisGeneration === generationEpoch && answer.trim()) {
        generationMetrics.status = stopRequested ? 'stopped-with-partial' : 'complete';
        generationMetrics.outputCharacters = answer.length;
        conversation.push({ role: 'assistant', content: answer.slice(0, 7000) });
        if (stopRequested) {
          const cpuWasTerminated = isCpuModelKey(generationMetrics.modelKey);
          setStatus(
            cpuWasTerminated
              ? 'CPU response stopped. Its worker was terminated to release CPU time; start the model again to continue. Cached model files may be reused.'
              : 'The local response was stopped. Partial text is retained in this page memory only.',
            'warn'
          );
        } else {
          setStatus('Local response received from ' + (generationMetrics.modelLabel || generationMetrics.modelId) + '. This is a prototype result, not yet a quality acceptance result.', 'ok');
        }
      } else if (thisGeneration === generationEpoch) {
        generationMetrics.status = stopRequested ? 'stopped-empty' : 'empty';
        assistantBody.textContent = stopRequested ? 'Response stopped before any text was generated.' : 'The local model returned no text. Try a shorter prompt or retry.';
        setStatus(
          stopRequested && isCpuModelKey(generationMetrics.modelKey)
            ? 'CPU response stopped and the worker was released. Start the model again to continue.'
            : (stopRequested ? 'Local generation stopped.' : 'The local model returned an empty answer.'),
          stopRequested ? 'warn' : 'error'
        );
      }
    } catch (error) {
      if (thisGeneration === generationEpoch && error?.code === 'LOCAL_GENERATION_IDLE_TIMEOUT') {
        // If a stream stalls, terminate the worker so the UI can recover instead of
        // leaving the user with a spinner. A retry must explicitly reload the model.
        try { engine?.interruptGenerate?.(); } catch (_) {}
        try { activeCpuGeneration?.finish({ stopped: true }); } catch (_) {}
        try { worker?.terminate(); } catch (_) {}
        generationMetrics.status = 'timeout';
        diagnosticsState.lastError = { at: new Date().toISOString(), stage: 'generation', code: error.code, message: getErrorMessage(error) };
        engine = null;
        worker = null;
        cpuReady = false;
        activeCpuGeneration = null;
        loadedModelKey = '';
        assistantBody.textContent = 'Local generation timed out. The model was unloaded so you can retry safely.';
        setStatus(
          (stopRequested ? 'The local stream did not stop in time. ' : 'The local model stopped responding. ') +
          'OVYX unloaded the local worker after 2 minutes without progress. Reload the model to retry; no hosted fallback was used.',
          'error'
        );
      } else if (thisGeneration === generationEpoch && !stopRequested) {
        generationMetrics.status = 'failed';
        diagnosticsState.lastError = { at: new Date().toISOString(), stage: 'generation', code: String(error?.code || ''), message: getErrorMessage(error) };
        assistantBody.textContent = 'Local generation failed. No hosted AI fallback was attempted.';
        setStatus('Local generation failed: ' + getErrorMessage(error), 'error');
      }
    } finally {
      generationMetrics.totalDurationMs = Math.round(performance.now() - generationMetrics.startedAtMonotonic);
      delete generationMetrics.startedAtMonotonic;
      if (generationMetrics.status === 'running') generationMetrics.status = stopRequested ? 'stopped' : 'failed';
      diagnosticsState.generations.push(generationMetrics);
      diagnosticsState.generations = diagnosticsState.generations.slice(-10);
      if (thisGeneration === generationEpoch) {
        generating = false;
        stopRequested = false;
        refreshControls();
        promptInput.focus();
      }
    }
  }

  function stopGeneration() {
    if (!generating) return;
    stopRequested = true;
    setStatus('Stopping local generation…', 'warn');
    if (isCpuModelKey(loadedModelKey)) {
      try { activeCpuGeneration?.finish({ stopped: true }); } catch (_) {}
      const currentWorker = worker;
      worker = null;
      cpuReady = false;
      engine = null;
      loadedModelKey = '';
      try { currentWorker?.terminate(); } catch (_) {}
      refreshControls();
      return;
    }
    if (!engine) return;
    try {
      engine.interruptGenerate();
    } catch (error) {
      setStatus('Could not interrupt the local stream: ' + getErrorMessage(error), 'error');
    }
  }


  async function prepareDiagnosticRecord() {
    const model = MODELS[selectedModelKey()];
    const storage = { ...(diagnosticsState.storage || {}) };
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (Number.isFinite(Number(estimate?.quota))) storage.quotaBytes = Number(estimate.quota);
      if (Number.isFinite(Number(estimate?.usage))) storage.usageBytes = Number(estimate.usage);
      if (Number.isFinite(storage.quotaBytes) && Number.isFinite(storage.usageBytes)) {
        storage.estimatedAvailableBytes = Math.max(0, storage.quotaBytes - storage.usageBytes);
      }
    } catch (_) {
      storage.estimateUnavailable = true;
    }

    const report = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      runtime: modelIsLoaded() ? diagnosticsState.runtime : (isCpuModelKey(selectedModelKey()) ? CPU_RUNTIME_LABEL : '@mlc-ai/web-llm@0.2.86'),
      environment: {
        userAgent: navigator.userAgent || 'unknown',
        platform: navigator.platform || 'unknown',
        secureContext: Boolean(window.isSecureContext),
        crossOriginIsolated: Boolean(window.crossOriginIsolated),
        webGPUApiPresent: Boolean(navigator.gpu),
        webGPUAdapterAvailable: Boolean(gpuAvailable && gpuAdapter),
        hardwareConcurrency: Number(navigator.hardwareConcurrency) || null,
        deviceMemoryGB: Number(navigator.deviceMemory) || null,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      },
      selectedModel: {
        key: selectedModelKey(),
        modelId: model.id,
        label: model.label,
        approximateDownloadBytes: model.sizeBytes,
        runtime: isCpuModelKey(selectedModelKey()) ? CPU_RUNTIME_LABEL : '@mlc-ai/web-llm@0.2.86',
        executionDevice: isCpuModelKey(selectedModelKey()) ? 'wasm' : 'webgpu',
        estimatedGpuMemoryMB: model.vramMB,
        configuredContextTokens: model.context,
        loadedInPage: modelIsLoaded(),
        activeModelId: loadedModelKey ? (MODELS[loadedModelKey]?.id || '') : '',
      },
      storage,
      modelLoad: diagnosticsState.modelLoad,
      recentGenerationMetrics: diagnosticsState.generations.slice(-10).map(item => ({
        modelKey: item.modelKey,
        modelId: item.modelId,
        startedAt: item.startedAt,
        promptCharacters: item.promptCharacters,
        firstTokenMs: item.firstTokenMs,
        totalDurationMs: item.totalDurationMs,
        outputCharacters: item.outputCharacters,
        status: item.status,
      })),
      lastError: diagnosticsState.lastError,
      privacy: 'Prepared locally on request. No prompts, response text, project data or credentials are included. This record is not sent to OVYX or any other service automatically.',
    };

    const serialized = JSON.stringify(report, null, 2);
    diagnosticsOutput.value = serialized;
    diagnosticsOutput.classList.remove('hidden');
    diagnosticsOutput.hidden = false;
    try {
      await navigator.clipboard.writeText(serialized);
      setStatus('Diagnostic record copied. It contains device/runtime measurements only—not prompts or answers—and was not sent anywhere.', 'ok');
    } catch (_) {
      setStatus('Diagnostic record is ready below. Copy it manually; it contains no prompt or answer text and was not sent anywhere.', 'info');
      diagnosticsOutput.focus();
      diagnosticsOutput.select();
    }
  }

  function clearChat() {
    if (generating) return;
    conversation = [];
    chatLog.replaceChildren();
    addEmptyChat();
    setStatus('Conversation cleared from this page memory. Nothing is saved to your account or server by this lab.', 'info');
  }

  modelSelect.addEventListener('change', () => {
    updateModelDetails();
    const key = selectedModelKey();
    if (isCpuModelKey(key)) {
      setStatus('CPU/WASM selected explicitly. It does not require WebGPU and will load only when you press Download and start local AI.', 'ok');
    } else if (gpuAvailable) {
      setStatus('WebGPU is detected. The selected model must still pass its own runtime, shader and memory checks.', 'ok');
    } else {
      setStatus('WebGPU is not available. Choose CPU/WASM explicitly or use this selected WebGPU model on a compatible device. OVYX will not switch automatically.', 'error');
    }
    refreshControls();
  });
  startButton.addEventListener('click', () => { void startLocalModel(); });
  cancelButton.addEventListener('click', cancelLoading);
  unloadButton.addEventListener('click', () => { void unloadLocalModel(); });
  promptForm.addEventListener('submit', (event) => { void sendPrompt(event); });
  promptInput.addEventListener('input', refreshControls);
  stopButton.addEventListener('click', stopGeneration);
  clearButton.addEventListener('click', clearChat);
  prepareDiagnosticsButton?.addEventListener('click', () => { void prepareDiagnosticRecord(); });
  window.addEventListener('pagehide', () => {
    try { activeCpuGeneration?.finish({ stopped: true }); } catch (_) {}
    try { worker?.terminate(); } catch (_) {}
  });

  updateModelDetails();
  refreshControls();
  void checkWebGPU();
})();