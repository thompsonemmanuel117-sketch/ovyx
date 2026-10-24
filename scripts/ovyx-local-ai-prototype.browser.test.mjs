import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim().replace(/\/+$/, '');
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local or deployed OVYX Pages app.');

const runtimeFixture = [
  "export const prebuiltAppConfig = { model_list: [",
  "  { model_id: 'Qwen3.5-4B-q4f16_1-MLC', model_lib: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_86/base/Qwen3.5-4B-q4f16_1_cs1k-webgpu.wasm' },",
  "  { model_id: 'Qwen3.5-2B-q4f16_1-MLC', model_lib: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_86/base/Qwen3.5-2B-q4f16_1_cs1k-webgpu.wasm' }",
  "] };",
  "export async function hasModelInCache(modelId, appConfig) {",
  "  globalThis.__OVYX_MOCK_CACHE_CONFIGS = globalThis.__OVYX_MOCK_CACHE_CONFIGS || [];",
  "  globalThis.__OVYX_MOCK_CACHE_CONFIGS.push({ modelId, appConfig });",
  "  return false;",
  "}",
  "export class WebWorkerMLCEngineHandler { onmessage() {} }",
  "export async function CreateWebWorkerMLCEngine(worker, modelId, engineConfig = {}) {",
  "  globalThis.__OVYX_MOCK_ENGINE_CONFIGS = globalThis.__OVYX_MOCK_ENGINE_CONFIGS || [];",
  "  globalThis.__OVYX_MOCK_ENGINE_CONFIGS.push({ modelId, appConfig: engineConfig.appConfig });",
  "  engineConfig.initProgressCallback?.({ progress: 0.22, text: 'Mock initialization progress - test fixture only' });",
  "  if (globalThis.__OVYX_MOCK_HOLD_FIRST_INIT) {",
  "    globalThis.__OVYX_MOCK_HOLD_FIRST_INIT = false;",
  "    await new Promise((resolve) => { globalThis.__OVYX_MOCK_RELEASE_INIT = resolve; });",
  "  } else {",
  "    await new Promise((resolve) => setTimeout(resolve, 700));",
  "  }",
  "  engineConfig.initProgressCallback?.({ progress: 0.9, text: 'Mock initialization finished - test fixture only' });",
  "  let interrupted = false;",
  "  let mockGenerationCount = 0;",
  "  let releaseHeldGeneration = null;",
  "  return {",
  "    modelId,",
  "    chat: { completions: {",
  "      create(options) {",
  "        const generationNumber = ++mockGenerationCount;",
  "        globalThis.__OVYX_MOCK_MESSAGES = options.messages;",
  "        interrupted = false;",
  "        return (async function* () {",
  "          yield { choices: [{ delta: { content: 'Mock local test-fixture response' } }] };",
  "          if (generationNumber === 1) {",
  "            await new Promise((resolve) => setTimeout(resolve, 450));",
  "          } else {",
  "            await new Promise((resolve) => { releaseHeldGeneration = resolve; });",
  "          }",
  "          if (!interrupted) yield { choices: [{ delta: { content: ' (not real model evidence).' } }] };",
  "        })();",
  "      }",
  "    } },",
  "    interruptGenerate() {",
  "      interrupted = true;",
  "      if (typeof releaseHeldGeneration === 'function') {",
  "        const release = releaseHeldGeneration;",
  "        releaseHeldGeneration = null;",
  "        release();",
  "      }",
  "    },",
  "    async unload() {}",
  "  };",
  "}"
].join('\n');

const browser = await chromium.launch({ headless: true });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    const context = await browser.newContext({ viewport: target.viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const requests = [];
    const pageErrors = [];
    const consoleErrors = [];
    const workerErrors = [];
    const failedRequests = [];
    const workerResponses = [];
    let runtimeRequests = 0;

    await context.addInitScript(() => {
      // Hold the first fake initialization open until the test cancels it.
      // This removes the race between a quick mock response and the Cancel click.
      globalThis.__OVYX_MOCK_HOLD_FIRST_INIT = true;
      Object.defineProperty(navigator, 'gpu', {
        configurable: true,
        value: { requestAdapter: async () => ({ requestDevice: async () => ({}) }) },
      });
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: {
          estimate: async () => ({ quota: 10_000_000_000, usage: 0 }),
          persist: async () => true,
        },
      });
    });
    context.on('request', (request) => requests.push({
      url: request.url(),
      method: request.method(),
      postData: request.postData() || '',
    }));
    context.on('requestfailed', request => failedRequests.push({
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText || 'unknown',
    }));
    context.on('response', async response => {
      if (response.url().includes('/assets/ovyx-local-ai-worker.js')) {
        let responseHeaders = {};
        try { responseHeaders = await response.allHeaders(); } catch (_) {}
        workerResponses.push({
          url: response.url(),
          status: response.status(),
          headers: responseHeaders,
          redirectedFrom: response.request().redirectedFrom()?.url() || null,
        });
      }
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('worker', localWorker => {
      localWorker.on('pageerror', error => workerErrors.push(error.message));
      localWorker.on('console', message => {
        if (message.type() === 'error') workerErrors.push(message.text());
      });
    });

    await context.route(/https:\/\/esm\.run\/@mlc-ai\/web-llm@0\.2\.86(?:$|\?)/, async route => {
      runtimeRequests += 1;
      assert.equal(route.request().method(), 'GET', 'runtime fixture must be fetched with GET only');
      await route.fulfill({
        status: 200,
        contentType: 'text/javascript; charset=utf-8',
        headers: {
          'access-control-allow-origin': '*',
          'cross-origin-resource-policy': 'cross-origin',
          'cache-control': 'no-store',
        },
        body: runtimeFixture,
      });
    });

    const response = await page.goto(baseURL + '/local-ai-lab.html', { waitUntil: 'domcontentloaded' });
    assert.ok(response && response.status() === 200, '[' + target.name + '] local AI lab did not load.');
    await page.waitForFunction(
      () => document.getElementById('device-status')?.textContent?.includes('WebGPU is detected'),
      null,
      { timeout: 8000 },
    );

    assert.equal(runtimeRequests, 0, '[' + target.name + '] runtime must not download before explicit user opt-in.');
    assert.equal(await page.locator('#start-local-ai').isDisabled(), false);
    const pageContent = await page.content();
    assert.doesNotMatch(pageContent, /ovyx-assistant-workspace\.js|ovyx-launch-polish\.js/,
      '[' + target.name + '] isolated lab must not receive main-app shell injection.');

    await page.locator('#start-local-ai').click();
    await page.waitForFunction(
      () => document.getElementById('progress-note')?.textContent?.includes('Mock initialization progress - test fixture only'),
      null,
      { timeout: 10000 },
    );

    const loadingState = await page.evaluate(() => {
      const button = document.getElementById('cancel-local-ai');
      const style = button ? getComputedStyle(button) : null;
      const rect = button?.getBoundingClientRect();
      const parent = button?.parentElement;
      const parentStyle = parent ? getComputedStyle(parent) : null;
      const parentRect = parent?.getBoundingClientRect();
      return {
        cancelHidden: button?.classList.contains('hidden'),
        cancelDisabled: button?.disabled,
        cancelComputedDisplay: style?.display,
        cancelVisibility: style?.visibility,
        cancelOpacity: style?.opacity,
        cancelRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom } : null,
        cancelClientRects: button?.getClientRects().length,
        rowDisplay: parentStyle?.display,
        rowVisibility: parentStyle?.visibility,
        rowRect: parentRect ? { x: parentRect.x, y: parentRect.y, width: parentRect.width, height: parentRect.height, top: parentRect.top, bottom: parentRect.bottom } : null,
        viewport: { width: innerWidth, height: innerHeight, scrollY },
        startDisabled: document.getElementById('start-local-ai')?.disabled,
        status: document.getElementById('device-status')?.textContent,
        progress: document.getElementById('progress-note')?.textContent,
        holdFlag: globalThis.__OVYX_MOCK_HOLD_FIRST_INIT,
        released: typeof globalThis.__OVYX_MOCK_RELEASE_INIT === 'function',
      };
    });
    assert.equal(loadingState.cancelHidden, false,
      '[' + target.name + '] cancellation control should stay visible during model initialization. State: '
      + JSON.stringify({ ...loadingState, runtimeRequests, pageErrors, consoleErrors, workerErrors, failedRequests, workerResponses }));
    assert.equal(loadingState.cancelDisabled, false,
      '[' + target.name + '] cancellation control should be enabled during model initialization. State: '
      + JSON.stringify({ ...loadingState, runtimeRequests, pageErrors, consoleErrors, workerErrors, failedRequests }));
    assert.equal(await page.locator('#cancel-local-ai').isVisible(), true,
      '[' + target.name + '] cancellation control should be rendered and clickable during model initialization. State: '
      + JSON.stringify({ ...loadingState, runtimeRequests, pageErrors, consoleErrors, workerErrors, failedRequests }));
    try {
      await page.locator('#cancel-local-ai').click({ timeout: 3000 });
    } catch (error) {
      const afterCancelBecameUnavailable = await page.evaluate(() => ({
        status: document.getElementById('device-status')?.textContent,
        progress: document.getElementById('progress-note')?.textContent,
        engine: document.getElementById('engine-pill')?.textContent,
        loadingPill: document.getElementById('engine-pill')?.textContent?.includes('LOADING LOCALLY'),
        cancelHidden: document.getElementById('cancel-local-ai')?.classList.contains('hidden'),
        cancelDisabled: document.getElementById('cancel-local-ai')?.disabled,
        holdFlag: globalThis.__OVYX_MOCK_HOLD_FIRST_INIT,
        released: typeof globalThis.__OVYX_MOCK_RELEASE_INIT === 'function',
      }));
      throw new Error('Cancel control disappeared or became unclickable during mocked initialization: '
        + JSON.stringify({ ...afterCancelBecameUnavailable, runtimeRequests, pageErrors, consoleErrors, workerErrors, failedRequests, workerResponses })
        + ' Original click error: ' + String(error?.message || error));
    }
    await page.waitForFunction(
      () => document.getElementById('device-status')?.textContent?.includes('Cancelled.'),
      null,
      { timeout: 5000 },
    );
    assert.match(await page.locator('#engine-pill').textContent(), /MODEL NOT LOADED/);
    assert.equal(await page.locator('#start-local-ai').isDisabled(), false);

    await page.locator('#start-local-ai').click();
    await page.waitForFunction(
      () => document.getElementById('device-status')?.textContent?.includes('model loaded in this browser'),
      null,
      { timeout: 15000 },
    );
    assert.match(await page.locator('#engine-pill').textContent(), /LOCAL MODEL READY/);
    const pinnedRuntimeConfig = await page.evaluate(() => ({
      cache: globalThis.__OVYX_MOCK_CACHE_CONFIGS?.at(-1),
      engine: globalThis.__OVYX_MOCK_ENGINE_CONFIGS?.at(-1),
    }));
    assert.equal(pinnedRuntimeConfig.cache?.modelId, 'Qwen3.5-4B-q4f16_1-MLC');
    assert.equal(pinnedRuntimeConfig.engine?.modelId, 'Qwen3.5-4B-q4f16_1-MLC');
    const pinnedRecord = pinnedRuntimeConfig.engine?.appConfig?.model_list?.find(
      item => item.model_id === 'Qwen3.5-4B-q4f16_1-MLC',
    );
    assert.match(pinnedRecord?.model || '', /Qwen3\.5-4B-q4f16_1-MLC\/resolve\/44b4246$/);
    assert.match(pinnedRecord?.model_lib || '', /00fe7a40e57e5e8eb9fef87526a4bf28ad5846c0\/web-llm-models\/v0_2_86\/base\/Qwen3\.5-4B-q4f16_1_cs1k-webgpu\.wasm$/);

    const prompt = 'Tell me exactly one short line about responsive layout.';
    await page.locator('#local-prompt').fill(prompt);
    await page.locator('#send-local-prompt').click();
    await page.getByText(/Mock local test-fixture response/).waitFor();
    await page.waitForFunction(
      () => [...document.querySelectorAll('.message.assistant .message-body')]
        .some(node => node.textContent?.includes('(not real model evidence).')),
      null,
      { timeout: 10000 },
    );

    const seenMessages = await page.evaluate(() => globalThis.__OVYX_MOCK_MESSAGES || []);
    assert.equal(seenMessages.filter(item => item.role === 'user' && item.content === prompt).length, 1,
      '[' + target.name + '] current prompt must appear exactly once in local inference messages.');

    const stopPrompt = 'Start a local response that I will stop.';
    await page.locator('#local-prompt').fill(stopPrompt);
    await page.locator('#send-local-prompt').click();
    await page.locator('#stop-generation').waitFor({ state: 'visible' });
    await page.locator('#stop-generation').click();
    await page.waitForFunction(
      () => document.getElementById('device-status')?.textContent?.includes('Local response was stopped'),
      null,
      { timeout: 10000 },
    );

    await page.locator('#unload-local-ai').click();
    await page.waitForFunction(
      () => document.getElementById('engine-pill')?.textContent?.includes('MODEL NOT LOADED'),
      null,
      { timeout: 5000 },
    );

    // This fixture delivers runtime JS only. It deliberately does not download
    // model weights; tests of this mock do not count as genuine local inference.
    assert.ok(runtimeRequests >= 2, '[' + target.name + '] main and worker should use the pinned runtime after opt-in.');
    assert.deepEqual(pageErrors, [], '[' + target.name + '] local AI lab should not throw browser errors.');
    assert.ok(requests.every(request => !/\/api\/ai\/|\/api\/generate(?:\?|$)/.test(request.url)),
      '[' + target.name + '] isolated lab must not call main OVYX AI routes.');
    assert.ok(requests.every(request => !request.url.includes(prompt) && !request.postData.includes(prompt) &&
      !request.url.includes(stopPrompt) && !request.postData.includes(stopPrompt)),
      '[' + target.name + '] prompts must not be placed in network URLs or request bodies.');
    assert.ok(requests.filter(request => !request.url.startsWith(baseURL)).every(request =>
      new URL(request.url).host === 'esm.run' && request.method === 'GET'),
    '[' + target.name + '] only the pinned runtime module host is allowed during mocked local inference.');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    assert.equal(overflow, false, '[' + target.name + '] prototype must not create horizontal page overflow.');
    await context.close();
  }
  console.log('OVYX local AI prototype browser contract passed on desktop/mobile with a mocked engine. This proves UI/privacy wiring only; it is not genuine model-load or intelligence evidence.');
} finally {
  await browser.close();
}
