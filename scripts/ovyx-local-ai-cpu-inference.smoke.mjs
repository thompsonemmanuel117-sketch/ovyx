import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim().replace(/\/+$/, '');
const reportPath = String(process.env.OVYX_CPU_SMOKE_REPORT || '/tmp/ovyx-cpu-local-ai-smoke.json');
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local OVYX Pages app.');

const startedAt = new Date().toISOString();
const prompt = 'Reply with exactly one word: four.';
const externalHosts = new Set();
const forbiddenRequests = [];
const failedRequests = [];
let promptEgressCount = 0;
let resultSummary = null;
let failure = '';

function safeParts(raw) {
  try {
    const url = new URL(raw);
    return { origin: url.origin, host: url.hostname, path: url.pathname };
  } catch (_) {
    return { origin: '', host: '', path: '' };
  }
}
function forbidden(raw) {
  const p = safeParts(raw);
  return ['api.openai.com', 'generativelanguage.googleapis.com', 'api.anthropic.com', 'api.deepseek.com', 'api.groq.com'].includes(p.host)
    || /\/api\/ai(?:\/|$)|\/api\/generate(?:\/|$)|\/ai\/run(?:\/|$)|\/v1\/(?:chat\/completions|responses)(?:\/|$)/i.test(p.path);
}

let browser;
try {
  browser = await chromium.launch({ headless: true, timeout: 120000 });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'allow',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  context.on('request', request => {
    const p = safeParts(request.url());
    if (p.origin && p.origin !== baseURL) externalHosts.add(p.host);
    if (forbidden(request.url())) forbiddenRequests.push({ method: request.method(), host: p.host, path: p.path });
    if (request.url().includes(prompt) || String(request.postData() || '').includes(prompt)) promptEgressCount += 1;
  });
  context.on('requestfailed', request => {
    const p = safeParts(request.url());
    failedRequests.push({ host: p.host, path: p.path, reason: String(request.failure()?.errorText || 'unknown').slice(0, 160) });
  });

  const pageResponse = await page.goto(baseURL + '/local-ai-lab.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  assert.ok(pageResponse && pageResponse.status() === 200, 'Local AI lab page did not load.');
  await page.waitForFunction(() => Boolean(document.querySelector('#device-status')), null, { timeout: 30000 });

  // This is an evaluation-only CPU path, not a product route change. The actual
  // model runtime and q8 ONNX weights are downloaded by the browser; inference
  // runs with Transformers.js' WASM backend and no hosted inference endpoint.
  resultSummary = await page.evaluate(async ({ promptText }) => {
    const started = performance.now();
    const progress = [];
    const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1');

    env.allowRemoteModels = true;
    env.allowLocalModels = false;
    env.logLevel = 'error';

    const loadStarted = performance.now();
    const generator = await pipeline('text-generation', 'onnx-community/Qwen2.5-0.5B-Instruct', {
      dtype: 'q8',
      progress_callback: event => {
        if (progress.length < 200) progress.push({
          status: String(event?.status || ''),
          file: String(event?.file || ''),
          progress: Number.isFinite(Number(event?.progress)) ? Number(event.progress) : null,
        });
      },
    });
    const modelReadyMs = Math.round(performance.now() - loadStarted);
    const generationStarted = performance.now();
    const output = await generator([{ role: 'user', content: promptText }], {
      max_new_tokens: 12,
      do_sample: false,
      temperature: 0,
    });
    const generationDurationMs = Math.round(performance.now() - generationStarted);
    const candidate = output?.[0]?.generated_text;
    const assistantText = typeof candidate === 'string'
      ? candidate
      : Array.isArray(candidate)
        ? candidate.filter(item => item?.role === 'assistant').map(item => String(item.content || '')).join(' ')
        : '';
    const answer = String(assistantText || '').trim();
    const storageKeys = await caches.keys().catch(() => []);
    return {
      runtime: '@huggingface/transformers@4.3.1',
      modelId: 'onnx-community/Qwen2.5-0.5B-Instruct',
      dtype: 'q8',
      device: 'wasm',
      secureContext: Boolean(window.isSecureContext),
      crossOriginIsolated: Boolean(window.crossOriginIsolated),
      webGPUApiPresent: Boolean(navigator.gpu),
      hardwareConcurrency: Number(navigator.hardwareConcurrency) || null,
      modelReadyMs,
      generationDurationMs,
      answerCharacterCount: answer.length,
      genuineAnswerReceived: answer.length > 0,
      progressEvents: progress.length,
      cacheKeys: storageKeys.map(String).slice(0, 20),
      totalElapsedMs: Math.round(performance.now() - started),
    };
  }, { promptText: prompt });

  assert.ok(resultSummary.genuineAnswerReceived, 'The WASM CPU model returned no generated text.');
  assert.ok(Number.isFinite(resultSummary.modelReadyMs) && resultSummary.modelReadyMs > 0, 'No model load timing was recorded.');
  assert.ok(Number.isFinite(resultSummary.generationDurationMs) && resultSummary.generationDurationMs > 0, 'No CPU inference timing was recorded.');
  assert.deepEqual(forbiddenRequests, [], 'A hosted inference endpoint was contacted: ' + JSON.stringify(forbiddenRequests));
  assert.equal(promptEgressCount, 0, 'The prompt appeared in an external request URL/body.');

  const report = {
    schemaVersion: 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    environment: await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      platform: navigator.platform || 'unknown',
      secureContext: Boolean(window.isSecureContext),
      crossOriginIsolated: Boolean(window.crossOriginIsolated),
      hardwareConcurrency: Number(navigator.hardwareConcurrency) || null,
      deviceMemoryGB: Number(navigator.deviceMemory) || null,
    })),
    model: {
      id: resultSummary.modelId,
      runtime: resultSummary.runtime,
      dtype: resultSummary.dtype,
      device: resultSummary.device,
      genuineAnswerReceived: resultSummary.genuineAnswerReceived,
      answerCharacterCount: resultSummary.answerCharacterCount,
      modelReadyMs: resultSummary.modelReadyMs,
      generationDurationMs: resultSummary.generationDurationMs,
      progressEvents: resultSummary.progressEvents,
      cacheKeys: resultSummary.cacheKeys,
    },
    networkAudit: {
      externalHostsObserved: [...externalHosts].sort(),
      forbiddenInferenceRequests: forbiddenRequests,
      promptEgressCount,
      trackedExternalHostCount: externalHosts.size,
      note: 'No prompt/answer text, full URLs, credentials or request bodies are written to this record.',
    },
    failedRequests: failedRequests.slice(-20),
    caveat: 'Evaluation-only CPU/WASM experiment; not merged into the OVYX user-facing local AI prototype.',
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log('CPU/WASM LOCAL INFERENCE PASSED. Sanitized report: ' + reportPath);
} catch (error) {
  failure = String(error?.message || error).slice(0, 1000);
  const report = {
    schemaVersion: 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    model: resultSummary ? {
      id: resultSummary.modelId,
      runtime: resultSummary.runtime,
      dtype: resultSummary.dtype,
      device: resultSummary.device,
      genuineAnswerReceived: resultSummary.genuineAnswerReceived,
      modelReadyMs: resultSummary.modelReadyMs,
      generationDurationMs: resultSummary.generationDurationMs,
      progressEvents: resultSummary.progressEvents,
    } : null,
    networkAudit: {
      externalHostsObserved: [...externalHosts].sort(),
      forbiddenInferenceRequests: forbiddenRequests,
      promptEgressCount,
      note: 'No prompt/answer text, full URLs, credentials or request bodies are written to this record.',
    },
    failedRequests: failedRequests.slice(-20),
    failure,
    caveat: 'Evaluation-only CPU/WASM experiment; not merged into the OVYX user-facing local AI prototype.',
  };
  try { fs.writeFileSync(reportPath, JSON.stringify(report, null, 2)); } catch (_) {}
  console.error('CPU/WASM LOCAL INFERENCE FAILED: ' + failure);
  process.exitCode = 1;
} finally {
  try { await browser?.close(); } catch (_) {}
}
