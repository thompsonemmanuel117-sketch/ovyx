import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim().replace(/\/+$/, '');
const reportPath = String(process.env.OVYX_CPU_SMOKE_REPORT || '/tmp/ovyx-cpu-local-ai-smoke.json');
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local OVYX Pages app.');

const startedAt = new Date().toISOString();
const prompts = [
  'Reply with one short sentence explaining what a responsive website is.',
  'What is 3 plus 1? Answer briefly.',
  'Write a detailed explanation of why responsive layouts matter on phones, with examples and a short conclusion.',
];
const externalHosts = new Set();
const failedRequests = [];
const forbiddenRequests = [];
let promptEgressCount = 0;
let firstLoadWeightRequests = 0;
let reloadWeightRequests = 0;
const modelWeightRequestDetails = [];
let currentPhase = 'startup';
let reportModel = null;
let browser = null;
let failure = '';

function safeParts(raw) {
  try {
    const url = new URL(raw);
    return { origin: url.origin, host: url.hostname, path: url.pathname };
  } catch (_) {
    return { origin: '', host: '', path: '' };
  }
}
function safePath(raw) {
  let path = safeParts(raw).path;
  for (const prompt of prompts) {
    for (const variant of [prompt, encodeURIComponent(prompt), prompt.replace(/\s+/g, '+')]) {
      if (variant) path = path.split(variant).join('[redacted]');
    }
  }
  return path.slice(0, 240);
}

function isForbiddenInference(raw) {
  const p = safeParts(raw);
  const blockedHosts = new Set([
    'api.openai.com',
    'generativelanguage.googleapis.com',
    'api.anthropic.com',
    'api.deepseek.com',
    'api.groq.com',
    'openrouter.ai',
    'api.together.xyz',
    'api.fireworks.ai',
    'api.mistral.ai',
    'api.cohere.ai',
    'api.perplexity.ai',
  ]);
  return blockedHosts.has(p.host)
    || /\/api\/ai(?:\/|$)|\/api\/generate(?:\/|$)|\/ai\/run(?:\/|$)|\/v1\/(?:chat\/completions|responses)(?:\/|$)/i.test(p.path);
}

function safeError(value) {
  return String(value?.message || value || 'Unknown local AI test failure.')
    .replace(/https?:\/\/\S+/gi, '[external URL]')
    .replace(/\s+/g, ' ')
    .slice(0, 700);
}

async function waitForCpuReady(page, label) {
  await page.waitForFunction(() => {
    const status = document.getElementById('device-status')?.textContent || '';
    return status.includes('model loaded in this browser and runs on CPU/WASM')
      || status.includes('CPU/WASM model initialization failed')
      || status.includes('setup stopped after 3 minutes');
  }, null, { timeout: 25 * 60 * 1000 });
  const status = await page.locator('#device-status').textContent();
  if (!String(status || '').includes('model loaded in this browser and runs on CPU/WASM')) {
    throw new Error(label + ' did not load the actual CPU/WASM model: ' + safeError(status));
  }
}

async function waitForCpuAnswer(page, label) {
  await page.waitForFunction(() => {
    const status = document.getElementById('device-status')?.textContent || '';
    return /Local response received from Qwen2\.5 0\.5B CPU\/WASM/i.test(status)
      || /Local generation failed:|local stream did not stop|stopped responding|returned no text/i.test(status);
  }, null, { timeout: 5 * 60 * 1000 });
  const status = String(await page.locator('#device-status').textContent() || '');
  if (!/Local response received from Qwen2\.5 0\.5B CPU\/WASM/i.test(status)) {
    throw new Error(label + ' failed in the integrated CPU/WASM lab: ' + safeError(status));
  }
}

async function readCacheEvidence(page) {
  return page.evaluate(async () => {
    const result = {
      cacheApiAvailable: typeof caches !== 'undefined',
      cacheNames: [],
      cacheEntryCount: 0,
      cacheKeyFileNames: [],
      modelWeightEntries: 0,
      modelWeightUrls: [],
      opfsAvailable: false,
      opfsEntryCount: 0,
      opfsModelWeightEntries: 0,
      opfsModelWeightUrls: [],
    };
    if (typeof caches !== 'undefined') {
      const names = await caches.keys().catch(() => []);
      result.cacheNames = names.map(String).slice(0, 20);
      for (const name of names) {
        let entries = [];
        try { entries = await (await caches.open(name)).keys(); } catch (_) {}
        result.cacheEntryCount += entries.length;
        for (const request of entries) {
          let path = '';
          try { path = new URL(request.url).pathname; } catch (_) {}
          const fileName = path.split('/').slice(-2).join('/');
          if (fileName && result.cacheKeyFileNames.length < 12) result.cacheKeyFileNames.push(fileName);
          if (/\/(?:model|model_[a-z0-9]+)\.onnx$/i.test(path)) {
            result.modelWeightEntries += 1;
            result.modelWeightUrls.push(fileName);
          }
        }
      }
    }
    try {
      if (typeof navigator.storage?.getDirectory === 'function') {
        const root = await navigator.storage.getDirectory();
        result.opfsAvailable = true;
        for await (const [name, handle] of root.entries()) {
          result.opfsEntryCount += 1;
          if (!name.endsWith('.meta') || handle.kind !== 'file') continue;
          try {
            const metadata = JSON.parse(await (await handle.getFile()).text());
            const path = String(metadata.urlPath || '');
            if (/\/(?:model|model_[a-z0-9]+)\.onnx$/i.test(path)) {
              result.opfsModelWeightEntries += 1;
              result.opfsModelWeightUrls.push(path.split('/').slice(-2).join('/'));
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
    result.modelWeightEntries += result.opfsModelWeightEntries;
    result.modelWeightUrls.push(...result.opfsModelWeightUrls);
    return result;
  });
}

let context = null;
try {
  browser = await chromium.launch({ headless: true, timeout: 120000 });
  context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'allow',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);

  context.on('request', request => {
    const parts = safeParts(request.url());
    if (parts.origin && parts.origin !== baseURL) externalHosts.add(parts.host);
    if (isForbiddenInference(request.url())) {
      forbiddenRequests.push({ method: request.method(), host: parts.host, path: parts.path });
    }
    const postData = String(request.postData() || '');
    for (const prompt of prompts) {
      if (request.url().includes(prompt) || postData.includes(prompt)) promptEgressCount += 1;
    }
    // Count only GETs of ONNX weight files. HEAD/metadata probes do not
    // download model bytes and must not be mistaken for a cache miss.
    if (/\/(?:model|model_[a-z0-9]+)\.onnx$/i.test(parts.path)) {
      if (modelWeightRequestDetails.length < 20) {
        modelWeightRequestDetails.push({
          phase: currentPhase,
          method: request.method(),
          host: parts.host,
          path: parts.path.slice(-180),
        });
      }
      if (request.method() === 'GET' && currentPhase === 'first-load') firstLoadWeightRequests += 1;
      if (request.method() === 'GET' && currentPhase === 'reload-load') reloadWeightRequests += 1;
    }
  });
  context.on('requestfailed', request => {
    const parts = safeParts(request.url());
    failedRequests.push({
      host: parts.host,
      path: safePath(request.url()),
      reason: String(request.failure()?.errorText || 'unknown').slice(0, 140),
    });
  });

  const firstNavigation = await page.goto(baseURL + '/local-ai-lab.html', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  assert.ok(firstNavigation && firstNavigation.status() === 200, 'Local AI lab did not load.');
  await page.locator('#model-choice').selectOption('qwen25-05b-cpu');
  assert.equal(await page.locator('#start-local-ai').isDisabled(), false,
    'Explicit CPU/WASM model must be startable whether or not WebGPU is detected.');

  currentPhase = 'first-load';
  const firstLoadStartedAt = Date.now();
  await page.locator('#start-local-ai').click();
  console.log('Real CPU/WASM smoke: loading selected Qwen2.5 0.5B model in the actual local-AI lab.');
  const progressTimer = setInterval(async () => {
    try {
      const status = String(await page.locator('#device-status').textContent() || '');
      const progress = String(await page.locator('#progress-note').textContent() || '');
      console.log('Local-AI lab status: ' + status.replace(/https?:\/\/\S+/gi, '[external URL]').replace(/\s+/g, ' ').slice(0, 200)
        + (progress ? ' | ' + progress.replace(/https?:\/\/\S+/gi, '[external URL]').replace(/\s+/g, ' ').slice(0, 180) : ''));
    } catch (_) {}
  }, 20000);
  try {
    await waitForCpuReady(page, 'First load');
  } finally {
    clearInterval(progressTimer);
  }
  const firstModelReadyMs = Date.now() - firstLoadStartedAt;
  const firstCache = await readCacheEvidence(page);
  console.log('Browser cache evidence after actual model load: ' + JSON.stringify({
    cacheApiAvailable: firstCache.cacheApiAvailable,
    cacheNames: firstCache.cacheNames,
    cacheEntryCount: firstCache.cacheEntryCount,
    cachedWeightKeyCount: firstCache.modelWeightEntries,
    opfsModelWeightEntries: firstCache.opfsModelWeightEntries,
    cachedFileNameSamples: firstCache.cacheKeyFileNames.slice(0, 8),
  }));
  assert.ok(firstCache.opfsAvailable && firstCache.opfsModelWeightEntries > 0,
    'The actual CPU model loaded, but OPFS has no complete ONNX model weight file. Cache acceptance is not proven.');

  currentPhase = 'first-generation';
  const firstGenerationStartedAt = Date.now();
  await page.locator('#local-prompt').fill(prompts[0]);
  await page.locator('#send-local-prompt').click();
  await waitForCpuAnswer(page, 'First generation');
  const firstAnswer = String(await page.locator('.message.assistant .message-body').last().textContent() || '').trim();
  assert.ok(firstAnswer.length > 0, 'The user-facing CPU/WASM lab returned no genuine response text.');
  const firstGenerationDurationMs = Date.now() - firstGenerationStartedAt;
  currentPhase = 'after-first-generation';

  const firstDiagnostics = await (async () => {
    await page.locator('#prepare-diagnostics').click();
    await page.locator('#diagnostics-output').waitFor({ state: 'visible' });
    return JSON.parse(await page.locator('#diagnostics-output').inputValue());
  })();
  assert.equal(firstDiagnostics.selectedModel.modelId, 'onnx-community/Qwen2.5-0.5B-Instruct');
  assert.equal(firstDiagnostics.selectedModel.executionDevice, 'wasm');
  console.log('Sanitized cache diagnostics: ' + JSON.stringify({
    cacheNames: firstDiagnostics.storage?.cacheNames,
    cacheEntryCount: firstDiagnostics.storage?.cacheEntryCount,
    cacheWarnings: firstDiagnostics.storage?.cacheWarnings || [],
    storageEstimateBytes: firstDiagnostics.storage?.estimatedAvailableBytes ?? null,
  }));
  assert.ok(firstDiagnostics.recentGenerationMetrics.some(item => item.status === 'complete'));
  assert.ok(!JSON.stringify(firstDiagnostics).includes(prompts[0]),
    'Diagnostics must not contain prompt text.');

  // Reload the same lab origin and explicitly select the same CPU model. The
  // OPFS should satisfy model weights locally instead of downloading them again.
  currentPhase = 'reload-load';
  const reloadStartedAt = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.locator('#model-choice').selectOption('qwen25-05b-cpu');
  await page.locator('#start-local-ai').click();
  await waitForCpuReady(page, 'Reload/cache load');
  const reloadLoadDurationMs = Date.now() - reloadStartedAt;
  const secondCache = await readCacheEvidence(page);
  assert.ok(secondCache.opfsAvailable && secondCache.opfsModelWeightEntries > 0, 'OPFS must retain the ONNX model weight after a page reload.');
  console.log('Browser cache evidence after reload: ' + JSON.stringify({
    cacheNames: secondCache.cacheNames,
    cacheEntryCount: secondCache.cacheEntryCount,
    cachedWeightKeyCount: secondCache.modelWeightEntries,
    opfsModelWeightEntries: secondCache.opfsModelWeightEntries,
    cachedFileNameSamples: secondCache.cacheKeyFileNames.slice(0, 8),
  }));
  console.log('Sanitized model-weight network requests: ' + JSON.stringify(modelWeightRequestDetails));
  assert.equal(reloadWeightRequests, 0,
    'The model weight URL was requested again after reload despite a populated browser cache; reuse is not proven.');
  currentPhase = 'reload-generation';
  const secondGenerationStartedAt = Date.now();
  await page.locator('#local-prompt').fill(prompts[1]);
  await page.locator('#send-local-prompt').click();
  await waitForCpuAnswer(page, 'Cached reload generation');
  const secondAnswer = String(await page.locator('.message.assistant .message-body').last().textContent() || '').trim();
  assert.ok(secondAnswer.length > 0, 'Cached CPU/WASM reload produced no response.');
  const secondGenerationDurationMs = Date.now() - secondGenerationStartedAt;
  currentPhase = 'after-reload-generation';

  // Real stop behavior: stream some text from the model, then terminate the
  // CPU worker to release the CPU even if the model does not cooperatively stop.
  await page.locator('#local-prompt').fill(prompts[2]);
  await page.locator('#send-local-prompt').click();
  await page.locator('#stop-generation').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => {
    const nodes = [...document.querySelectorAll('.message.assistant .message-body')];
    return String(nodes.at(-1)?.textContent || '').trim().length > 0;
  }, null, { timeout: 3 * 60 * 1000 });
  await page.locator('#stop-generation').click();
  await page.waitForFunction(() => {
    const status = document.getElementById('device-status')?.textContent || '';
    return status.includes('CPU response stopped.')
      && document.getElementById('engine-pill')?.textContent?.includes('MODEL NOT LOADED')
      && document.getElementById('stop-generation')?.classList.contains('hidden');
  }, null, { timeout: 15000 });
  currentPhase = 'after-stop';

  const finalDiagnostics = await (async () => {
    await page.locator('#prepare-diagnostics').click();
    await page.locator('#diagnostics-output').waitFor({ state: 'visible' });
    return JSON.parse(await page.locator('#diagnostics-output').inputValue());
  })();
  assert.equal(finalDiagnostics.selectedModel.runtime, '@huggingface/transformers@4.3.1 · ONNX Runtime WASM');
  assert.equal(firstDiagnostics.recentGenerationMetrics.length, 1);
  assert.equal(firstDiagnostics.recentGenerationMetrics[0].status, 'complete');
  assert.equal(finalDiagnostics.recentGenerationMetrics.length, 2);
  assert.equal(finalDiagnostics.recentGenerationMetrics[0].status, 'complete');
  assert.equal(finalDiagnostics.recentGenerationMetrics[1].status, 'stopped-with-partial');
  for (const prompt of prompts) {
    assert.ok(!JSON.stringify(finalDiagnostics).includes(prompt), 'Diagnostics must never contain prompt text.');
  }
  if (firstAnswer.length >= 24) assert.ok(!JSON.stringify(finalDiagnostics).includes(firstAnswer), 'Diagnostics must never contain generated answer text.');
  if (secondAnswer.length >= 24) assert.ok(!JSON.stringify(finalDiagnostics).includes(secondAnswer), 'Diagnostics must never contain generated answer text.');

  assert.deepEqual(forbiddenRequests, [], 'Hosted inference/provider endpoint or OVYX AI route was contacted.');
  assert.equal(promptEgressCount, 0, 'A test prompt appeared in an external request URL/body.');
  assert.ok(firstLoadWeightRequests > 0,
    'First CPU/WASM model load did not observe a network request for model weights, so genuine download is not proven.');
  assert.equal(reloadWeightRequests, 0, 'Cached weights were fetched again after reload.');
  const unexpectedFailedRequests = failedRequests.filter(item => !/favicon\.ico/i.test(item.path || ''));
  assert.deepEqual(unexpectedFailedRequests, [], 'External model/runtime request failed: ' + JSON.stringify(unexpectedFailedRequests));

  const report = {
    schemaVersion: 2,
    startedAt,
    finishedAt: new Date().toISOString(),
    testScope: 'Real user-facing local-AI lab; CPU/WASM model inference; headless CI desktop profile',
    environment: {
      userAgent: finalDiagnostics.environment.userAgent,
      platform: finalDiagnostics.environment.platform,
      secureContext: finalDiagnostics.environment.secureContext,
      crossOriginIsolated: finalDiagnostics.environment.crossOriginIsolated,
      webGPUApiPresent: finalDiagnostics.environment.webGPUApiPresent,
      webGPUAdapterAvailable: finalDiagnostics.environment.webGPUAdapterAvailable,
      hardwareConcurrency: finalDiagnostics.environment.hardwareConcurrency,
      deviceMemoryGB: finalDiagnostics.environment.deviceMemoryGB,
      viewport: finalDiagnostics.environment.viewport,
    },
    model: {
      id: 'onnx-community/Qwen2.5-0.5B-Instruct',
      runtime: '@huggingface/transformers@4.3.1 · ONNX Runtime WASM',
      dtype: 'q8',
      executionDevice: 'wasm',
      revision: 'cc5cc01a65cc3ff17bdb73a7de33d879f62599b0',
      genuineAnswersReceived: 2,
      answerCharacterCounts: [firstAnswer.length, secondAnswer.length],
      firstLoadDurationMs: firstModelReadyMs,
      firstGenerationDurationMs,
      reloadLoadDurationMs,
      secondGenerationDurationMs,
      firstModelWeightNetworkRequests: firstLoadWeightRequests,
      reloadModelWeightNetworkRequests: reloadWeightRequests,
      browserCacheAfterFirstLoad: {
        available: firstCache.cacheApiAvailable,
        cacheNames: firstCache.cacheNames,
        cacheEntryCount: firstCache.cacheEntryCount,
        modelWeightEntries: firstCache.modelWeightEntries,
      },
      browserCacheAfterReload: {
        available: secondCache.cacheApiAvailable,
        cacheNames: secondCache.cacheNames,
        cacheEntryCount: secondCache.cacheEntryCount,
        modelWeightEntries: secondCache.modelWeightEntries,
      },
      stopGenerationStatus: finalDiagnostics.recentGenerationMetrics[1].status,
    },
    networkAudit: {
      externalHostsObserved: [...externalHosts].sort(),
      forbiddenInferenceRequests: forbiddenRequests,
      promptEgressCount,
      externalHostCount: externalHosts.size,
      failedRequestCount: failedRequests.length,
      note: 'Report contains no prompt text, response text, credentials, request bodies, full URLs or query strings.',
    },
    checks: {
      genuineLocalInference: true,
      modelWeightsDownloaded: firstLoadWeightRequests > 0,
      browserCachePersistsAcrossReload: secondCache.modelWeightEntries > 0,
      cachedWeightsNotRefetchedAfterReload: reloadWeightRequests === 0,
      generationCanBeStopped: true,
      noPromptEgressObserved: promptEgressCount === 0,
      noHostedInferenceEndpointObserved: forbiddenRequests.length === 0,
    },
    caveat: 'This is real CPU/WASM inference in automated Chromium; it does not replace acceptance on a real desktop and Android device or a quality benchmark.',
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log('USER-FACING CPU/WASM LOCAL AI LAB PASSED: genuine answer, cache reload, stop and prompt-egress checks. Sanitized record: ' + reportPath);
} catch (error) {
  failure = safeError(error);
  const report = {
    schemaVersion: 2,
    startedAt,
    finishedAt: new Date().toISOString(),
    testScope: 'Real user-facing local-AI lab; CPU/WASM inference; headless CI desktop profile',
    networkAudit: {
      externalHostsObserved: [...externalHosts].sort(),
      forbiddenInferenceRequests: forbiddenRequests,
      promptEgressCount,
      failedRequests: failedRequests.slice(-30),
      note: 'Report contains no prompt text, response text, credentials, request bodies, full URLs or query strings.',
    },
    failure,
    caveat: 'No failed test is to be described as successful inference. This evidence is automated Chromium only; real-device acceptance remains separate.',
  };
  try { fs.writeFileSync(reportPath, JSON.stringify(report, null, 2)); } catch (_) {}
  console.error('USER-FACING CPU/WASM LOCAL AI LAB FAILED: ' + failure);
  process.exitCode = 1;
} finally {
  try { if (context) await context.close(); } catch (_) {}
  try { await browser?.close(); } catch (_) {}
}
