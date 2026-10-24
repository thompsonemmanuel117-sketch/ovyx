(() => {
  'use strict';

  // Stage 3 only: no application AI route, account token, or provider API is used here.
  const RUNTIME_URL = 'https://esm.run/@mlc-ai/web-llm@0.2.86';
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
    }),
    'qwen35-2b': Object.freeze({
      id: 'Qwen3.5-2B-q4f16_1-MLC',
      label: 'Qwen3.5 2B',
      sizeBytes: 1_080_000_000,
      sizeLabel: '1.08 GB',
      vramMB: 2245.44,
      vramLabel: '2.25 GB',
      context: 4096,
      card: 'https://huggingface.co/Qwen/Qwen3.5-2B',
      files: 'https://huggingface.co/mlc-ai/Qwen3.5-2B-q4f16_1-MLC',
    }),
  });
  const SYSTEM_PROMPT = [
    'You are OVYX Local AI, a helpful assistant running on the user’s own device.',
    'Be honest about uncertainty. For code, explain the concrete fix and preserve existing structure when possible.',
    'Do not claim you executed code, tested a site, inspected files, or used tools unless the user supplied the evidence in this conversation.',
    'This prototype has no project access and cannot run tools. Do not pretend otherwise.',
  ].join(' ');

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

  let gpuAdapter = null;
  let gpuAvailable = false;
  let engine = null;
  let worker = null;
  let loadedModelKey = '';
  let loading = false;
  let generating = false;
  let stopRequested = false;
  let loadEpoch = 0;
  let generationEpoch = 0;
  let cancelLoadReject = null;
  let conversation = [];
  let emptyChatNode = el('chat-empty');

  function selectedModelKey() {
    return MODELS[modelSelect.value] ? modelSelect.value : 'qwen35-4b';
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

  function updateProgress(report) {
    if (!loading) return;
    const text = String(report?.text || 'Preparing the local model…').slice(0, 220);
    progressNote.textContent = text;
    const progress = Number(report?.progress);
    if (Number.isFinite(progress) && progress >= 0 && progress <= 1) {
      progressBar.value = Math.round(progress * 100);
    } else {
      progressBar.value = 0;
    }
  }

  function refreshControls() {
    const modelLoaded = Boolean(engine && loadedModelKey);
    startButton.classList.toggle('hidden', modelLoaded);
    startButton.disabled = !gpuAvailable || loading || generating || modelLoaded;
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
    const model = MODELS[selectedModelKey()];
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
      setStatus('WebGPU is not available in this browser. This prototype does not silently switch to a hosted AI service. CPU/WASM support remains a separate evaluation item.', 'error');
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
        setStatus('The browser did not provide a usable WebGPU adapter. No model was downloaded and no hosted fallback will run.', 'error');
      }
    } catch (error) {
      setStatus('WebGPU compatibility check failed: ' + getErrorMessage(error) + ' No model was downloaded.', 'error');
    }
    refreshControls();
  }

  async function checkStorage(webllm, model) {
    let cachedWeights = false;
    let cacheWasChecked = false;
    try {
      cachedWeights = await webllm.hasModelInCache(model.id, webllm.prebuiltAppConfig);
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
    loading = false;
    const reject = cancelLoadReject;
    cancelLoadReject = null;
    const currentWorker = worker;
    worker = null;
    try { currentWorker?.terminate(); } catch (_) {}
    engine = null;
    loadedModelKey = '';
    if (typeof reject === 'function') {
      reject(new Error('Model initialization was cancelled by the user.'));
    }
    showProgress(false);
    setStatus('Cancelled. No prompt was sent to an AI provider. Fully downloaded model files may remain in the browser cache, so retrying can reuse completed assets.', 'warn');
    refreshControls();
  }

  async function startLocalModel() {
    if (loading || generating || engine) return;
    if (!gpuAvailable) {
      setStatus('No usable WebGPU adapter is available. No remote inference fallback will be attempted.', 'error');
      refreshControls();
      return;
    }

    const key = selectedModelKey();
    const model = MODELS[key];
    const thisLoad = ++loadEpoch;
    loading = true;
    showProgress(true, 'Loading the pinned WebLLM runtime; no model response is possible yet…');
    setStatus('Starting local initialization. The selected model files may be large; cancel is available.', 'warn');
    refreshControls();

    let localWorker = null;
    let cancellationPromise;
    try {
      // Runtime code is not even fetched until the user presses the explicit Start button.
      const webllm = await import(RUNTIME_URL);
      if (thisLoad !== loadEpoch) return;
      const record = webllm.prebuiltAppConfig?.model_list?.find((item) => item.model_id === model.id);
      if (!record) {
        throw new Error('The pinned WebLLM runtime does not register ' + model.id + '. Stop here and fix the runtime/model compatibility; do not substitute a hosted model.');
      }
      if (!String(record.model_lib || '').includes('v0_2_86')) {
        throw new Error('The model library version does not match the pinned WebLLM 0.2.86 runtime. No model request was started.');
      }
      if (!gpuAdapter) {
        throw new Error('The WebGPU adapter was lost before model loading started.');
      }
      const storage = await checkStorage(webllm, model);
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
        const error = new Error('The local inference worker failed to start. Check WebGPU support, the runtime download, and available memory.');
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
      loadedModelKey = key;
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
      loading = false;
      cancelLoadReject = null;
      try { localWorker?.terminate(); } catch (_) {}
      if (worker === localWorker) worker = null;
      engine = null;
      loadedModelKey = '';
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
        cancelLoadReject = null;
        if (loading && !engine) {
          loading = false;
          refreshControls();
        }
      }
    }
  }

  async function unloadLocalModel() {
    if (!engine || generating || loading) return;
    const currentEngine = engine;
    const currentWorker = worker;
    engine = null;
    worker = null;
    loadedModelKey = '';
    refreshControls();
    try { await currentEngine.unload?.(); } catch (_) {}
    try { currentWorker?.terminate(); } catch (_) {}
    setStatus('Model unloaded from active GPU memory. Browser-cached files are kept for a faster retry; use browser site-data controls if you need to remove the cache.', 'ok');
    refreshControls();
  }

  function buildMessages(prompt) {
    // The current prompt was added to conversation before this function runs.
    // Exclude that last turn here so it is sent exactly once.
    const prior = conversation.slice(0, -1).slice(-8);
    const recent = prior.map((item) => ({
      role: item.role,
      content: String(item.content || '').slice(-2200),
    }));
    return [{ role: 'system', content: SYSTEM_PROMPT }, ...recent, { role: 'user', content: prompt }];
  }

  async function sendPrompt(event) {
    event?.preventDefault?.();
    if (!engine || generating || loading) return;
    const prompt = String(promptInput.value || '').trim().slice(0, 3500);
    if (!prompt) return;

    promptInput.value = '';
    conversation.push({ role: 'user', content: prompt });
    appendMessage('user', prompt);
    const assistantBody = appendMessage('assistant', '');
    generating = true;
    stopRequested = false;
    const thisGeneration = ++generationEpoch;
    refreshControls();
    setStatus('Generating on the selected local model. No external inference API is used by this prototype.', 'ok');

    try {
      const stream = await engine.chat.completions.create({
        messages: buildMessages(prompt),
        stream: true,
        temperature: 0.6,
        top_p: 0.9,
        max_tokens: 768,
      });
      let answer = '';
      for await (const chunk of stream) {
        if (thisGeneration !== generationEpoch) break;
        const delta = chunk?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) {
          answer += delta;
          assistantBody.textContent = answer;
          chatLog.scrollTop = chatLog.scrollHeight;
        }
      }
      if (thisGeneration === generationEpoch && answer.trim()) {
        conversation.push({ role: 'assistant', content: answer.slice(0, 7000) });
        if (stopRequested) {
          setStatus('The local response was stopped. Partial text is retained in this page memory only.', 'warn');
        } else {
          setStatus('Local response received from ' + MODELS[loadedModelKey].label + '. This is a prototype result, not yet a quality acceptance result.', 'ok');
        }
      } else if (thisGeneration === generationEpoch) {
        assistantBody.textContent = stopRequested ? 'Response stopped before any text was generated.' : 'The local model returned no text. Try a shorter prompt or retry.';
        setStatus(stopRequested ? 'Local generation stopped.' : 'The local model returned an empty answer.', stopRequested ? 'warn' : 'error');
      }
    } catch (error) {
      if (thisGeneration === generationEpoch && !stopRequested) {
        assistantBody.textContent = 'Local generation failed. No hosted AI fallback was attempted.';
        setStatus('Local generation failed: ' + getErrorMessage(error), 'error');
      }
    } finally {
      if (thisGeneration === generationEpoch) {
        generating = false;
        stopRequested = false;
        refreshControls();
        promptInput.focus();
      }
    }
  }

  function stopGeneration() {
    if (!generating || !engine) return;
    stopRequested = true;
    setStatus('Stopping local generation…', 'warn');
    try {
      engine.interruptGenerate();
    } catch (error) {
      setStatus('Could not interrupt the local stream: ' + getErrorMessage(error), 'error');
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
    refreshControls();
  });
  startButton.addEventListener('click', () => { void startLocalModel(); });
  cancelButton.addEventListener('click', cancelLoading);
  unloadButton.addEventListener('click', () => { void unloadLocalModel(); });
  promptForm.addEventListener('submit', (event) => { void sendPrompt(event); });
  promptInput.addEventListener('input', refreshControls);
  stopButton.addEventListener('click', stopGeneration);
  clearButton.addEventListener('click', clearChat);
  window.addEventListener('pagehide', () => {
    try { worker?.terminate(); } catch (_) {}
  });

  updateModelDetails();
  refreshControls();
  void checkWebGPU();
})();