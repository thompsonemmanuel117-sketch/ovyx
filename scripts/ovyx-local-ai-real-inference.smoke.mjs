import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim().replace(/\/+$/, '');
const reportPath = String(process.env.OVYX_REAL_SMOKE_REPORT || '/tmp/ovyx-real-local-ai-smoke.json');
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local OVYX Pages app.');

const startedAt = new Date().toISOString();
const browserLaunchArgs = [
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan',
  '--use-angle=vulkan',
  '--use-vulkan=swiftshader',
  '--use-webgpu-adapter=swiftshader',
  '--disable-vulkan-surface',
  '--ignore-gpu-blocklist',
];
const forbiddenHosts = new Set([
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'api.anthropic.com',
  'api.deepseek.com',
  'api.groq.com',
]);
const forbiddenRequests = [];
const externalHosts = new Set();
const failedRequests = [];
let activePrompt = '';
let promptEgressCount = 0;
let browser = null;
let page = null;
let initialDiagnostics = null;
let cacheDiagnostics = null;
let loadResult = 'not-started';
let genuineResponseReceived = false;
let genuineResponseComplete = false;
let cachedModelDetectedAfterReload = false;
let answerCharacterCount = 0;
let failureMessage = '';

function safeUrlParts(raw) {
  try {
    const url = new URL(raw);
    return { origin: url.origin, pathname: url.pathname, host: url.hostname };
  } catch (_) {
    return { origin: '', pathname: '', host: '' };
  }
}

function isForbiddenRequest(raw) {
  const parts = safeUrlParts(raw);
  return forbiddenHosts.has(parts.host)
    || /\/api\/ai(?:\/|$)|\/api\/generate(?:\/|$)|\/ai\/run(?:\/|$)|\/v1\/(?:chat\/completions|responses)(?:\/|$)/i.test(parts.pathname)
    || /\.workers\.dev\/.*\/(?:ai|inference)(?:\/|$)/i.test(raw);
}

function readDeviceStatus() {
  return page.locator('#device-status').innerText().catch(() => '');
}

async function diagnostics() {
  if (!page) return null;
  try {
    await page.locator('#prepare-diagnostics').click({ timeout: 5000 });
    await page.locator('#diagnostics-output').waitFor({ state: 'visible', timeout: 5000 });
    const raw = await page.locator('#diagnostics-output').inputValue();
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

async function waitForLoadResult(timeoutMs) {
  await page.waitForFunction(() => {
    const status = document.getElementById('device-status')?.textContent || '';
    return /model loaded in this browser|local model initialization failed|setup stopped after 3 minutes|no usable WebGPU adapter|WebGPU is not available|did not provide a usable WebGPU adapter|WebGPU compatibility check failed/i.test(status);
  }, null, { timeout: timeoutMs });
  return readDeviceStatus();
}

try {
  browser = await chromium.launch({
    channel: 'chromium',
    headless: true,
    timeout: 120000,
    args: browserLaunchArgs,
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'allow',
  });
  page = await context.newPage();
  page.setDefaultTimeout(120000);

  page.on('pageerror', error => {
    failureMessage = failureMessage || ('Browser page error: ' + String(error?.message || error).slice(0, 300));
  });
  context.on('request', request => {
    const parts = safeUrlParts(request.url());
    if (parts.origin && parts.origin !== baseURL) externalHosts.add(parts.host);
    if (isForbiddenRequest(request.url())) forbiddenRequests.push({ method: request.method(), host: parts.host, path: parts.pathname });
    if (activePrompt && (request.url().includes(activePrompt) || String(request.postData() || '').includes(activePrompt))) {
      promptEgressCount += 1;
    }
  });
  context.on('requestfailed', request => {
    const parts = safeUrlParts(request.url());
    failedRequests.push({ host: parts.host, path: parts.pathname, reason: String(request.failure()?.errorText || 'unknown').slice(0, 160) });
  });

  const response = await page.goto(baseURL + '/local-ai-lab.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  assert.ok(response && response.status() === 200, 'Local AI lab page did not load.');
  await page.waitForFunction(() => {
    const text = document.getElementById('device-status')?.textContent || '';
    return /WebGPU is detected|WebGPU is not available|did not provide a usable WebGPU adapter|WebGPU compatibility check failed/i.test(text);
  }, null, { timeout: 30000 });

  const environment = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    platform: navigator.platform || 'unknown',
    secureContext: Boolean(window.isSecureContext),
    crossOriginIsolated: Boolean(window.crossOriginIsolated),
    webGPUApiPresent: Boolean(navigator.gpu),
    hardwareConcurrency: Number(navigator.hardwareConcurrency) || null,
    deviceMemoryGB: Number(navigator.deviceMemory) || null,
    viewport: { width: innerWidth, height: innerHeight },
  }));
  assert.equal(environment.secureContext, true, 'Real smoke test requires a secure context or localhost.');
  assert.equal(environment.crossOriginIsolated, true, 'The isolated lab must enable cross-origin isolation.');

  let status = await readDeviceStatus();
  assert.match(status, /WebGPU is detected/i,
    'The real Chromium environment did not expose a usable WebGPU adapter. No model inference was attempted. Status: ' + status);

  await page.locator('#model-choice').selectOption('qwen35-08b');
  await page.locator('#start-local-ai').click();
  status = await waitForLoadResult(35 * 60 * 1000);
  if (!/model loaded in this browser/i.test(status)) {
    loadResult = 'failed';
    throw new Error('Real model load failed: ' + status);
  }
  loadResult = 'ready';

  const loadedModelConfig = await page.evaluate(() => ({
    pill: document.getElementById('engine-pill')?.textContent || '',
    status: document.getElementById('device-status')?.textContent || '',
    selectedModel: document.getElementById('model-choice')?.value || '',
  }));
  assert.match(loadedModelConfig.pill, /LOCAL MODEL READY/);
  assert.equal(loadedModelConfig.selectedModel, 'qwen35-08b');

  activePrompt = 'Reply with exactly one word: four.';
  await page.locator('#local-prompt').fill(activePrompt);
  await page.locator('#send-local-prompt').click();
  await page.waitForFunction(() => {
    const body = [...document.querySelectorAll('.message.assistant .message-body')].at(-1);
    const statusText = document.getElementById('device-status')?.textContent || '';
    return Boolean(body?.textContent?.trim()) || /local generation failed|local generation timed out/i.test(statusText);
  }, null, { timeout: 8 * 60 * 1000 });

  const answerState = await page.evaluate(() => {
    const body = [...document.querySelectorAll('.message.assistant .message-body')].at(-1);
    return {
      length: String(body?.textContent || '').trim().length,
      status: document.getElementById('device-status')?.textContent || '',
      stopVisible: !document.getElementById('stop-generation')?.classList.contains('hidden'),
      enginePill: document.getElementById('engine-pill')?.textContent || '',
    };
  });
  answerCharacterCount = answerState.length;
  assert.ok(answerState.length > 0, 'Local model did not produce a genuine answer token. Status: ' + answerState.status);
  if (/local generation failed|local generation timed out/i.test(answerState.status)) {
    throw new Error('Local generation did not complete normally: ' + answerState.status);
  }
  if (!/local response received from/i.test(answerState.status)) {
    throw new Error('A genuine token was produced, but generation did not reach a completed-response state: ' + answerState.status);
  }
  genuineResponseReceived = true;
  genuineResponseComplete = true;

  initialDiagnostics = await diagnostics();
  assert.ok(initialDiagnostics, 'Could not capture local model diagnostics after a genuine answer.');
  assert.equal(initialDiagnostics.modelLoad?.status, 'ready');
  assert.equal(initialDiagnostics.recentGenerationMetrics?.at(-1)?.status, 'complete');
  assert.ok(Number.isFinite(initialDiagnostics.recentGenerationMetrics?.at(-1)?.firstTokenMs),
    'The real local run must report time to first token.');
  assert.ok(Number.isFinite(initialDiagnostics.recentGenerationMetrics?.at(-1)?.totalDurationMs),
    'The real local run must report total response duration.');
  assert.ok(!JSON.stringify(initialDiagnostics).includes(activePrompt),
    'Diagnostics must not contain the prompt.');
  assert.ok(!JSON.stringify(initialDiagnostics).includes('four.'),
    'Diagnostics must not contain the answer/prompt text.');

  await page.locator('#unload-local-ai').click();
  await page.waitForFunction(() => document.getElementById('engine-pill')?.textContent?.includes('MODEL NOT LOADED'), null, { timeout: 30000 });

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => /WebGPU is detected/i.test(document.getElementById('device-status')?.textContent || ''), null, { timeout: 30000 });
  await page.locator('#model-choice').selectOption('qwen35-08b');
  await page.locator('#start-local-ai').click();
  await page.waitForFunction(() => {
    const progress = document.getElementById('progress-note')?.textContent || '';
    const statusText = document.getElementById('device-status')?.textContent || '';
    return /Model weights appear to be cached|Model weights are not cached/i.test(progress)
      || /local model initialization failed|setup stopped after 3 minutes/i.test(statusText);
  }, null, { timeout: 8 * 60 * 1000 });
  const cacheState = await page.evaluate(() => ({
    progress: document.getElementById('progress-note')?.textContent || '',
    status: document.getElementById('device-status')?.textContent || '',
  }));
  cachedModelDetectedAfterReload = /Model weights appear to be cached/i.test(cacheState.progress);
  assert.equal(cachedModelDetectedAfterReload, true,
    'The browser did not detect the model cache after a page reload. Progress: ' + cacheState.progress + ' Status: ' + cacheState.status);
  status = await waitForLoadResult(15 * 60 * 1000);
  if (!/model loaded in this browser/i.test(status)) {
    throw new Error('Cached model reload did not complete: ' + status);
  }
  cacheDiagnostics = await diagnostics();
  assert.ok(cacheDiagnostics, 'Could not capture diagnostics after the cached reload.');
  assert.equal(cacheDiagnostics.modelLoad?.status, 'ready');
  assert.equal(JSON.stringify([initialDiagnostics, cacheDiagnostics]).includes(activePrompt), false,
    'Diagnostic records must never contain prompt text.');
  assert.deepEqual(forbiddenRequests, [], 'A hosted AI inference API or OVYX AI route was contacted: ' + JSON.stringify(forbiddenRequests));
  assert.equal(promptEgressCount, 0, 'The test prompt appeared in an HTTP request URL/body.');

  const output = {
    schemaVersion: 1,
    testStartedAt: startedAt,
    testFinishedAt: new Date().toISOString(),
    runtime: '@mlc-ai/web-llm@0.2.86',
    realWeightsDownloadedAndLoaded: loadResult === 'ready',
    genuineLocalPromptResponse: genuineResponseReceived,
    genuineLocalPromptCompleted: genuineResponseComplete,
    answerCharacterCountOnly: answerCharacterCount,
    cacheDetectedAfterReload: cachedModelDetectedAfterReload,
    environment,
    model: { key: 'qwen35-08b', id: 'Qwen3.5-0.8B-q4f16_1-MLC', approximateWeightDownloadBytes: 447000000 },
    firstRunDiagnostics: initialDiagnostics,
    cachedReloadDiagnostics: cacheDiagnostics,
    networkAudit: {
      externalHostsObserved: [...externalHosts].sort(),
      forbiddenInferenceRequests: forbiddenRequests,
      promptEgressCount,
      trackedRequestCount: externalHosts.size,
      note: 'Request audit stores host/path metadata only, never request bodies, prompts, answers or credentials.',
    },
    failedRequests: failedRequests.slice(-20),
    pageErrors: failureMessage ? [failureMessage] : [],
  };
  fs.mkdirSync(new URL('.', 'file://' + reportPath).pathname, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(output, null, 2));
  console.log('REAL LOCAL INFERENCE PASSED: genuine Qwen3.5-0.8B answer, cache reuse after reload, and no hosted inference endpoints or prompt egress.');
} catch (error) {
  failureMessage = String(error?.message || error).slice(0, 1000);
  try {
    const extra = await diagnostics();
    if (extra) {
      if (!initialDiagnostics) initialDiagnostics = extra;
      else cacheDiagnostics = extra;
    }
  } catch (_) {}
  const output = {
    schemaVersion: 1,
    testStartedAt: startedAt,
    testFinishedAt: new Date().toISOString(),
    runtime: '@mlc-ai/web-llm@0.2.86',
    realWeightsDownloadedAndLoaded: loadResult === 'ready',
    genuineLocalPromptResponse: genuineResponseReceived,
    genuineLocalPromptCompleted: genuineResponseComplete,
    answerCharacterCountOnly: answerCharacterCount,
    cacheDetectedAfterReload: cachedModelDetectedAfterReload,
    diagnostics: initialDiagnostics,
    cachedReloadDiagnostics: cacheDiagnostics,
    networkAudit: {
      externalHostsObserved: [...externalHosts].sort(),
      forbiddenInferenceRequests: forbiddenRequests,
      promptEgressCount,
      trackedRequestCount: externalHosts.size,
      note: 'Request audit stores host/path metadata only, never request bodies, prompts, answers or credentials.',
    },
    failedRequests: failedRequests.slice(-20),
    pageErrors: failureMessage ? [failureMessage] : [],
    failure: failureMessage,
  };
  try {
    fs.mkdirSync('/tmp', { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(output, null, 2));
  } catch (_) {}
  console.error('REAL LOCAL INFERENCE SMOKE FAILED:', failureMessage);
  if (failureMessage) process.exitCode = 1;
} finally {
  try { await browser?.close(); } catch (_) {}
}
