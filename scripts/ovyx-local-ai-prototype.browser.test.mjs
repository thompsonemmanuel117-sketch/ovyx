import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim().replace(/\/+$/, '');
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local or deployed OVYX Pages app.');

const runtimeFixture = [
  "export const prebuiltAppConfig = { model_list: [",
  "  { model_id: 'Qwen3.5-4B-q4f16_1-MLC', model_lib: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_86/base/Qwen3.5-4B-q4f16_1_cs1k-webgpu.wasm' },",
  "  { model_id: 'Qwen3.5-2B-q4f32_1-MLC', model_lib: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_86/base/Qwen3.5-2B-q4f32_1_cs1k-webgpu.wasm' },",
  "  { model_id: 'Qwen3.5-0.8B-q4f16_1-MLC', model_lib: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_86/base/Qwen3.5-0.8B-q4f16_1_cs1k-webgpu.wasm' }",
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
  "        globalThis.__OVYX_MOCK_GENERATION_HELD = false;",
  "        globalThis.__OVYX_MOCK_INTERRUPT_CALLED = false;",
  "        globalThis.__OVYX_MOCK_GENERATION_RELEASED = false;",
  "        interrupted = false;",
  "        return (async function* () {",
  "          yield { choices: [{ delta: { content: 'Mock local test-fixture response' } }] };",
  "          if (generationNumber === 1) {",
  "            await new Promise((resolve) => setTimeout(resolve, 450));",
  "          } else {",
  "            await new Promise((resolve) => {",
  "              if (interrupted) resolve();",
  "              else {",
  "                releaseHeldGeneration = resolve;",
  "                globalThis.__OVYX_MOCK_GENERATION_HELD = true;",
  "              }",
  "            });",
  "          }",
  "          if (!interrupted) yield { choices: [{ delta: { content: ' (not real model evidence).' } }] };",
  "        })();",
  "      }",
  "    } },",
  "    interruptGenerate() {",
  "      globalThis.__OVYX_MOCK_INTERRUPT_CALLED = true;",
  "      interrupted = true;",
  "      if (typeof releaseHeldGeneration === 'function') {",
  "        const release = releaseHeldGeneration;",
  "        releaseHeldGeneration = null;",
  "        globalThis.__OVYX_MOCK_GENERATION_RELEASED = true;",
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
      // Simulate Android/mobile-data hints so the data warning is exercised deterministically.
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        value: { type: 'cellular', effectiveType: '4g', saveData: true, addEventListener() {} },
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
    assert.equal(await page.locator('#start-local-ai').isDisabled(), true,
      '[' + target.name + '] model load must remain blocked until download consent is checked.');
    assert.match(await page.locator('#data-guard-heading').textContent(), /2\.39 GB/);
    assert.match(await page.locator('#data-guard-heading').textContent(), /reports a mobile-data/i);
    const pageContent = await page.content();
    assert.doesNotMatch(pageContent, /ovyx-assistant-workspace\.js|ovyx-launch-polish\.js/,
      '[' + target.name + '] isolated lab must not receive main-app shell injection.');

    await page.locator('#allow-model-download').check();
    assert.equal(await page.locator('#start-local-ai').isDisabled(), false);
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
    assert.equal(await page.locator('#start-local-ai').isDisabled(), true,
      '[' + target.name + '] cancellation must clear download consent before retry.');
    await page.locator('#allow-model-download').check();
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
    await page.waitForFunction(
      () => globalThis.__OVYX_MOCK_GENERATION_HELD === true,
      null,
      { timeout: 5000 },
    );
    await page.locator('#stop-generation').click();
    // The stream may settle immediately and skip the transient “Stopping…”
    // status. Assert the final stopped state instead of a timing-sensitive message.
    await page.waitForFunction(
      () => /local response was stopped/i.test(document.getElementById('device-status')?.textContent || ''),
      null,
      { timeout: 5000 },
    );
    const stoppedState = await page.evaluate(() => ({
      interruptCalled: globalThis.__OVYX_MOCK_INTERRUPT_CALLED,
      generationReleased: globalThis.__OVYX_MOCK_GENERATION_RELEASED,
      stopButtonHidden: document.getElementById('stop-generation')?.classList.contains('hidden'),
      engineReady: document.getElementById('engine-pill')?.textContent?.includes('LOCAL MODEL READY'),
    }));
    assert.equal(stoppedState.interruptCalled, true,
      '[' + target.name + '] Stop must call the local engine interrupt API.');
    assert.equal(stoppedState.generationReleased, true,
      '[' + target.name + '] Stop must release a held local stream.');
    assert.equal(stoppedState.stopButtonHidden, true,
      '[' + target.name + '] Stop control must hide after the stream settles.');
    assert.equal(stoppedState.engineReady, true,
      '[' + target.name + '] cancelling one response must preserve the loaded local model.');

    await page.locator('#unload-local-ai').click();
    await page.waitForFunction(
      () => document.getElementById('engine-pill')?.textContent?.includes('MODEL NOT LOADED'),
      null,
      { timeout: 5000 },
    );

    // Confirm the smaller comparison uses its own pinned q4f32_1 model and library.
    await page.locator('#model-choice').selectOption('qwen35-2b');
    await page.locator('#allow-model-download').check();
    await page.locator('#start-local-ai').click();
    await page.waitForFunction(
      () => document.getElementById('device-status')?.textContent?.includes('model loaded in this browser'),
      null,
      { timeout: 15000 },
    );
    const smallerModelConfig = await page.evaluate(() => ({
      cache: globalThis.__OVYX_MOCK_CACHE_CONFIGS?.at(-1),
      engine: globalThis.__OVYX_MOCK_ENGINE_CONFIGS?.at(-1),
    }));
    assert.equal(smallerModelConfig.cache?.modelId, 'Qwen3.5-2B-q4f32_1-MLC');
    assert.equal(smallerModelConfig.engine?.modelId, 'Qwen3.5-2B-q4f32_1-MLC');
    const smallerRecord = smallerModelConfig.engine?.appConfig?.model_list?.find(
      item => item.model_id === 'Qwen3.5-2B-q4f32_1-MLC',
    );
    assert.match(smallerRecord?.model || '', /Qwen3\.5-2B-q4f32_1-MLC\/resolve\/d835e5c$/);
    assert.match(smallerRecord?.model_lib || '', /00fe7a40e57e5e8eb9fef87526a4bf28ad5846c0\/web-llm-models\/v0_2_86\/base\/Qwen3\.5-2B-q4f32_1_cs1k-webgpu\.wasm$/);

    // Diagnostics are explicitly user-requested and omit prompt/answer text.
    await page.locator('#prepare-diagnostics').click();
    await page.locator('#diagnostics-output').waitFor({ state: 'visible' });
    const diagnosticText = await page.locator('#diagnostics-output').inputValue();
    const diagnosticRecord = JSON.parse(diagnosticText);
    assert.equal(diagnosticRecord.runtime, '@mlc-ai/web-llm@0.2.86');
    assert.equal(diagnosticRecord.environment.webGPUAdapterAvailable, true);
    assert.equal(diagnosticRecord.selectedModel.modelId, 'Qwen3.5-2B-q4f32_1-MLC');
    assert.equal(diagnosticRecord.selectedModel.loadedInPage, true);
    assert.equal(diagnosticRecord.modelLoad.status, 'ready');
    assert.equal(diagnosticRecord.recentGenerationMetrics.length, 2);
    assert.equal(diagnosticRecord.recentGenerationMetrics[0].status, 'complete');
    assert.equal(diagnosticRecord.recentGenerationMetrics[1].status, 'stopped-with-partial');
    assert.ok(Number.isFinite(diagnosticRecord.recentGenerationMetrics[0].firstTokenMs));
    assert.ok(Number.isFinite(diagnosticRecord.recentGenerationMetrics[0].totalDurationMs));
    assert.ok(!diagnosticText.includes(prompt), '[' + target.name + '] diagnostics must never contain submitted prompt text.');
    assert.ok(!diagnosticText.includes(stopPrompt), '[' + target.name + '] diagnostics must never contain stopped prompt text.');
    assert.ok(!diagnosticText.includes('Mock local test-fixture response'), '[' + target.name + '] diagnostics must never contain answer text.');
    assert.match(diagnosticRecord.privacy, /not sent to OVYX|not sent automatically/i);

    await page.locator('#unload-local-ai').click();
    await page.waitForFunction(
      () => document.getElementById('engine-pill')?.textContent?.includes('MODEL NOT LOADED'),
      null,
      { timeout: 5000 },
    );

    // Check the smallest manually selectable model, without any silent fallback.
    await page.locator('#model-choice').selectOption('qwen35-08b');
    await page.locator('#allow-model-download').check();
    await page.locator('#start-local-ai').click();
    await page.waitForFunction(
      () => document.getElementById('device-status')?.textContent?.includes('model loaded in this browser'),
      null,
      { timeout: 15000 },
    );
    const smallestModelConfig = await page.evaluate(() => ({
      cache: globalThis.__OVYX_MOCK_CACHE_CONFIGS?.at(-1),
      engine: globalThis.__OVYX_MOCK_ENGINE_CONFIGS?.at(-1),
    }));
    assert.equal(smallestModelConfig.cache?.modelId, 'Qwen3.5-0.8B-q4f16_1-MLC');
    assert.equal(smallestModelConfig.engine?.modelId, 'Qwen3.5-0.8B-q4f16_1-MLC');
    const smallestRecord = smallestModelConfig.engine?.appConfig?.model_list?.find(
      item => item.model_id === 'Qwen3.5-0.8B-q4f16_1-MLC',
    );
    assert.match(smallestRecord?.model || '', /Qwen3\.5-0\.8B-q4f16_1-MLC\/resolve\/0ec1389$/);
    assert.match(smallestRecord?.model_lib || '', /00fe7a40e57e5e8eb9fef87526a4bf28ad5846c0\/web-llm-models\/v0_2_86\/base\/Qwen3\.5-0\.8B-q4f16_1_cs1k-webgpu\.wasm$/);
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

    // CPU/WASM route: a separate isolated browser with WebGPU deliberately absent.
    // The Transformers.js module is mocked here for fast UI/worker contract checks;
    // genuine weights and inference are exercised by the separate real CPU smoke workflow.
    const cpuContext = await browser.newContext({ viewport: target.viewport });
    const cpuPage = await cpuContext.newPage();
    cpuPage.setDefaultTimeout(15000);
    const cpuRequests = [];
    const cpuErrors = [];
    const cpuWorkerResponses = [];
    let cpuRuntimeRequests = 0;

    await cpuContext.addInitScript(() => {
      Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: {
          estimate: async () => ({ quota: 8_000_000_000, usage: 0 }),
          persist: async () => true,
        },
      });
    });
    cpuContext.on('request', request => cpuRequests.push({
      url: request.url(),
      method: request.method(),
      postData: request.postData() || '',
    }));
    cpuContext.on('response', async response => {
      if (response.url().includes('/assets/ovyx-local-ai-cpu-worker.js')) {
        let headers = {};
        try { headers = await response.allHeaders(); } catch (_) {}
        cpuWorkerResponses.push({ status: response.status(), headers });
      }
    });
    cpuPage.on('pageerror', error => cpuErrors.push(error.message));
    cpuPage.on('console', message => {
      if (message.type() === 'error') cpuErrors.push(message.text());
    });

    const cpuRuntimeFixture = [
      'export const env = {};',
      'export const LogLevel = { WARNING: 2 };',
      'export class TextStreamer { constructor(tokenizer, options = {}) { this.tokenizer = tokenizer; this.options = options; } }',
      'export async function pipeline(task, modelId, options = {}) {',
      '  if (task !== "text-generation" || modelId !== "onnx-community/Qwen2.5-0.5B-Instruct") throw new Error("Unexpected CPU fixture model.");',
      '  options.progress_callback?.({ status: "progress_total", progress: 42, file: "model_quantized.onnx" });',
      '  let generationCount = 0;',
      '  const run = async (messages, generationOptions = {}) => {',
      '    generationCount += 1;',
      '    const streamer = generationOptions.streamer;',
      '    if (generationCount === 1) {',
      '      streamer?.options?.callback_function?.("CPU fixture response.");',
      '      return [{ generated_text: [...messages, { role: "assistant", content: "CPU fixture response." }] }];',
      '    }',
      '    streamer?.options?.callback_function?.("Partial CPU response.");',
      '    await new Promise(resolve => setTimeout(resolve, 60000));',
      '    streamer?.options?.callback_function?.(" should never complete.");',
      '    return [{ generated_text: [...messages, { role: "assistant", content: "Partial CPU response." }] }];',
      '  };',
      '  run.tokenizer = {};',
      '  return run;',
      '}',
    ].join('\n');

    await cpuContext.route(/https:\/\/cdn\.jsdelivr\.net\/npm\/@huggingface\/transformers@4\.3\.1(?:$|\?)/, async route => {
      cpuRuntimeRequests += 1;
      assert.equal(route.request().method(), 'GET', 'CPU runtime fixture must only be fetched with GET.');
      await route.fulfill({
        status: 200,
        contentType: 'text/javascript; charset=utf-8',
        headers: {
          'access-control-allow-origin': '*',
          'cross-origin-resource-policy': 'cross-origin',
          'cache-control': 'no-store',
        },
        body: cpuRuntimeFixture,
      });
    });

    const cpuPageResponse = await cpuPage.goto(baseURL + '/local-ai-lab.html', { waitUntil: 'domcontentloaded' });
    assert.ok(cpuPageResponse && cpuPageResponse.status() === 200,
      '[' + target.name + '] CPU test local AI lab did not load.');
    assert.equal(
      await cpuPage.evaluate(() => typeof navigator.gpu === 'undefined'),
      true,
      '[' + target.name + '] CPU route test must run with WebGPU genuinely absent.',
    );
    await cpuPage.locator('#model-choice').selectOption('qwen25-05b-cpu');
    assert.equal(await cpuPage.locator('#start-local-ai').isDisabled(), true,
      '[' + target.name + '] CPU/WASM start must require download consent even without WebGPU.');
    await cpuPage.locator('#allow-model-download').check();
    assert.equal(await cpuPage.locator('#start-local-ai').isDisabled(), false,
      '[' + target.name + '] explicit CPU/WASM start must remain available without WebGPU after consent.');
    await cpuPage.locator('#start-local-ai').click();
    await cpuPage.waitForFunction(
      () => document.getElementById('device-status')?.textContent?.includes('model loaded in this browser and runs on CPU/WASM'),
      null,
      { timeout: 10000 },
    );
    assert.equal(cpuRuntimeRequests, 1, '[' + target.name + '] the pinned CPU runtime should only load after explicit user action.');
    assert.equal(cpuWorkerResponses.length, 1, '[' + target.name + '] same-origin CPU worker must load once.');
    assert.equal(cpuWorkerResponses[0].status, 200);
    assert.match(cpuWorkerResponses[0].headers['cache-control'] || '', /no-store/i);
    assert.match(cpuWorkerResponses[0].headers['cross-origin-embedder-policy'] || '', /require-corp/i);
    assert.match(cpuWorkerResponses[0].headers['cross-origin-resource-policy'] || '', /same-origin/i);

    const cpuPrompt = 'Reply briefly with a local CPU test response.';
    await cpuPage.locator('#local-prompt').fill(cpuPrompt);
    await cpuPage.locator('#send-local-prompt').click();
    await cpuPage.waitForFunction(
      () => [...document.querySelectorAll('.message.assistant .message-body')]
        .some(node => node.textContent?.includes('CPU fixture response.')),
      null,
      { timeout: 8000 },
    );

    const cpuStopPrompt = 'Start a response that I will stop.';
    await cpuPage.locator('#local-prompt').fill(cpuStopPrompt);
    await cpuPage.locator('#send-local-prompt').click();
    await cpuPage.locator('#stop-generation').waitFor({ state: 'visible' });
    await cpuPage.waitForFunction(
      () => [...document.querySelectorAll('.message.assistant .message-body')]
        .some(node => node.textContent?.includes('Partial CPU response.')),
      null,
      { timeout: 8000 },
    );
    await cpuPage.locator('#stop-generation').click();
    await cpuPage.waitForFunction(
      () => document.getElementById('device-status')?.textContent?.includes('CPU response stopped.'),
      null,
      { timeout: 8000 },
    );
    assert.match(await cpuPage.locator('#engine-pill').textContent(), /MODEL NOT LOADED/,
      '[' + target.name + '] stopping CPU generation must terminate its worker and release model state.');
    assert.equal(await cpuPage.locator('#start-local-ai').isDisabled(), false);

    assert.equal(cpuRuntimeRequests, 1);
    assert.ok(cpuRequests.some(request => new URL(request.url).host === 'cdn.jsdelivr.net'),
      '[' + target.name + '] CPU runtime should be fetched from its explicit pinned CDN.');
    const forbiddenCpuRequests = cpuRequests.filter(request => {
      const url = new URL(request.url);
      return ['api.openai.com', 'generativelanguage.googleapis.com', 'api.anthropic.com',
        'api.deepseek.com', 'api.groq.com', 'openrouter.ai'].includes(url.hostname)
        || /\/api\/ai(?:\/|$)|\/api\/generate(?:\/|$)|\/v1\/(?:chat\/completions|responses)(?:\/|$)/i.test(url.pathname)
        || request.url.includes(cpuPrompt) || request.postData.includes(cpuPrompt)
        || request.url.includes(cpuStopPrompt) || request.postData.includes(cpuStopPrompt);
    });
    assert.deepEqual(forbiddenCpuRequests, [],
      '[' + target.name + '] CPU/WASM prompts must not leave the browser or hit hosted inference APIs.');
    assert.ok(cpuRequests.filter(request => !request.url.startsWith(baseURL)).every(request =>
      new URL(request.url).host === 'cdn.jsdelivr.net' && request.method === 'GET'),
    '[' + target.name + '] mocked CPU route should only contact the pinned runtime module host.');
    assert.deepEqual(cpuErrors, [], '[' + target.name + '] CPU/WASM UI/worker must not emit browser errors.');
    const cpuOverflow = await cpuPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    assert.equal(cpuOverflow, false, '[' + target.name + '] CPU/WASM UI must not create horizontal overflow.');
    await cpuContext.close();

    // The CPU path must also be cancellable while its model is still loading,
    // not only after generation starts. Hold the fake runtime in initialization
    // until the user clicks Cancel and assert that the worker is released.
    const cancelCpuContext = await browser.newContext({ viewport: target.viewport });
    const cancelCpuPage = await cancelCpuContext.newPage();
    cancelCpuPage.setDefaultTimeout(15000);
    const cancelCpuErrors = [];
    const cancelCpuWorkerResponses = [];
    await cancelCpuContext.addInitScript(() => {
      Object.defineProperty(navigator, 'gpu', {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: {
          estimate: async () => ({ quota: 10_000_000_000, usage: 0 }),
          persist: async () => true,
        },
      });
    });
    cancelCpuContext.on('response', async response => {
      if (response.url().includes('/assets/ovyx-local-ai-cpu-worker.js')) {
        cancelCpuWorkerResponses.push(response.status());
      }
    });
    cancelCpuPage.on('pageerror', error => cancelCpuErrors.push(error.message));
    const heldCpuRuntimeFixture = [
      'export const env = {};',
      'export const LogLevel = { WARNING: 2 };',
      'export class TextStreamer { constructor(tokenizer, options = {}) { this.tokenizer = tokenizer; this.options = options; } }',
      'export async function pipeline(task, modelId, options = {}) {',
      '  options.progress_callback?.({ status: "progress_total", progress: 20, file: "model_quantized.onnx" });',
      '  await new Promise(() => {});',
      '}',
    ].join('\n');
    await cancelCpuContext.route(/https:\/\/cdn\.jsdelivr\.net\/npm\/@huggingface\/transformers@4\.3\.1(?:$|\?)/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'text/javascript; charset=utf-8',
        headers: {
          'access-control-allow-origin': '*',
          'cross-origin-resource-policy': 'cross-origin',
          'cache-control': 'no-store',
        },
        body: heldCpuRuntimeFixture,
      });
    });
    const cancelCpuPageResponse = await cancelCpuPage.goto(baseURL + '/local-ai-lab.html', { waitUntil: 'domcontentloaded' });
    assert.ok(cancelCpuPageResponse && cancelCpuPageResponse.status() === 200,
      '[' + target.name + '] CPU cancellation test lab did not load.');
    await cancelCpuPage.locator('#model-choice').selectOption('qwen25-05b-cpu');
    await cancelCpuPage.locator('#allow-model-download').check();
    await cancelCpuPage.locator('#start-local-ai').click();
    await cancelCpuPage.locator('#cancel-local-ai').waitFor({ state: 'visible' });
    await cancelCpuPage.waitForFunction(
      () => (document.getElementById('progress-note')?.textContent || '').includes('CPU/WASM model download and preparation'),
      null,
      { timeout: 8000 },
    );
    assert.equal(cancelCpuWorkerResponses.length, 1,
      '[' + target.name + '] CPU worker should be active before cancellation.');
    await cancelCpuPage.locator('#cancel-local-ai').click();
    await cancelCpuPage.waitForFunction(
      () => (document.getElementById('device-status')?.textContent || '').includes('Cancelled.'),
      null,
      { timeout: 8000 },
    );
    assert.match(await cancelCpuPage.locator('#engine-pill').textContent(), /MODEL NOT LOADED/,
      '[' + target.name + '] cancelling CPU model initialization must release the worker and leave no ready model.');
    assert.equal(await cancelCpuPage.locator('#cancel-local-ai').isHidden(), true);
    assert.equal(await cancelCpuPage.locator('#start-local-ai').isDisabled(), false);
    assert.deepEqual(cancelCpuErrors, [], '[' + target.name + '] CPU load cancellation must not cause browser errors.');
    await cancelCpuContext.close();

    // A low-storage WebGPU device may fetch the pinned runtime, but must refuse before engine initialization or model-weight download.
    const lowStorageContext = await browser.newContext({ viewport: target.viewport });
    const lowStoragePage = await lowStorageContext.newPage();
    lowStoragePage.setDefaultTimeout(12000);
    let lowStorageRuntimeRequests = 0;
    await lowStorageContext.addInitScript(() => {
      Object.defineProperty(navigator, 'gpu', {
        configurable: true,
        value: { requestAdapter: async () => ({ requestDevice: async () => ({}) }) },
      });
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: {
          estimate: async () => ({ quota: 600_000_000, usage: 0 }),
          persist: async () => true,
        },
      });
    });
    await lowStorageContext.route(/https:\/\/esm\.run\/@mlc-ai\/web-llm@0\.2\.86(?:$|\?)/, async route => {
      lowStorageRuntimeRequests += 1;
      await route.fulfill({ status: 200, contentType: 'text/javascript', body: runtimeFixture });
    });
    const lowStorageResponse = await lowStoragePage.goto(baseURL + '/local-ai-lab.html', { waitUntil: 'domcontentloaded' });
    assert.ok(lowStorageResponse && lowStorageResponse.status() === 200,
      '[' + target.name + '] low-storage test lab did not load.');
    await lowStoragePage.waitForFunction(
      () => document.getElementById('device-status')?.textContent?.includes('WebGPU is detected'),
      null,
      { timeout: 8000 },
    );
    await lowStoragePage.locator('#allow-model-download').check();
    await lowStoragePage.locator('#start-local-ai').click();
    await lowStoragePage.waitForFunction(
      () => /free site storage/i.test(document.getElementById('device-status')?.textContent || ''),
      null,
      { timeout: 8000 },
    );
    assert.ok(lowStorageRuntimeRequests <= 1,
      '[' + target.name + '] low-storage refusal must not repeatedly download the pinned runtime.');
    assert.equal(await lowStoragePage.evaluate(() => globalThis.__OVYX_MOCK_ENGINE_CONFIGS?.length || 0), 0,
      '[' + target.name + '] low-storage refusal must happen before WebLLM engine initialization or model-weight download.');
    assert.match(await lowStoragePage.locator('#engine-pill').textContent(), /MODEL NOT LOADED/);
    assert.equal(await lowStoragePage.locator('#start-local-ai').isDisabled(), false,
      '[' + target.name + '] low-storage refusal must leave retry/model selection usable.');
    await lowStorageContext.close();

    // A transient CPU runtime network failure must be visible, stay local, and
    // recover only after the user explicitly retries.
    const retryContext = await browser.newContext({ viewport: target.viewport });
    const retryPage = await retryContext.newPage();
    retryPage.setDefaultTimeout(15000);
    let retryRuntimeRequests = 0;
    const retryErrors = [];
    await retryContext.addInitScript(() => {
      Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: { estimate: async () => ({ quota: 3_000_000_000, usage: 0 }), persist: async () => true },
      });
    });
    retryPage.on('pageerror', error => retryErrors.push(error.message));
    const retryCpuRuntimeFixture = [
      'export const env = {};',
      'export const LogLevel = { WARNING: 2 };',
      'export class TextStreamer { constructor(tokenizer, options = {}) { this.tokenizer = tokenizer; this.options = options; } }',
      'export async function pipeline(task, modelId, options = {}) {',
      '  if (task !== "text-generation" || modelId !== "onnx-community/Qwen2.5-0.5B-Instruct") throw new Error("Unexpected retry fixture model.");',
      '  options.progress_callback?.({ status: "progress_total", progress: 100, file: "model_quantized.onnx" });',
      '  const run = async (messages) => [{ generated_text: [...messages, { role: "assistant", content: "Retry fixture response." }] }];',
      '  run.tokenizer = {};',
      '  return run;',
      '}',
    ].join('\n');
    await retryContext.route(/https:\/\/cdn\.jsdelivr\.net\/npm\/@huggingface\/transformers@4\.3\.1(?:$|\?)/, async route => {
      retryRuntimeRequests += 1;
      if (retryRuntimeRequests === 1) {
        await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Simulated transient runtime download failure.' });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'text/javascript; charset=utf-8',
        headers: { 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin', 'cache-control': 'no-store' },
        body: retryCpuRuntimeFixture,
      });
    });
    const retryResponse = await retryPage.goto(baseURL + '/local-ai-lab.html', { waitUntil: 'domcontentloaded' });
    assert.ok(retryResponse && retryResponse.status() === 200,
      '[' + target.name + '] retry test lab did not load.');
    await retryPage.locator('#model-choice').selectOption('qwen25-05b-cpu');
    await retryPage.locator('#allow-model-download').check();
    await retryPage.locator('#start-local-ai').click();
    await retryPage.waitForFunction(
      () => /CPU\/WASM model initialization failed/i.test(document.getElementById('device-status')?.textContent || ''),
      null,
      { timeout: 10000 },
    );
    assert.match(await retryPage.locator('#device-status').textContent(), /Nothing was sent to a hosted AI provider/i);
    assert.match(await retryPage.locator('#engine-pill').textContent(), /MODEL NOT LOADED/);
    assert.equal(await retryPage.locator('#start-local-ai').isDisabled(), true,
      '[' + target.name + '] runtime failure must require renewed consent before retry.');
    await retryPage.locator('#allow-model-download').check();
    assert.equal(await retryPage.locator('#start-local-ai').isDisabled(), false,
      '[' + target.name + '] runtime failure must leave explicit retry available after renewed consent.');
    await retryPage.locator('#start-local-ai').click();
    await retryPage.waitForFunction(
      () => document.getElementById('device-status')?.textContent?.includes('model loaded in this browser and runs on CPU/WASM'),
      null,
      { timeout: 10000 },
    );
    assert.equal(retryRuntimeRequests, 2,
      '[' + target.name + '] retry must re-fetch the failed runtime and only succeed after explicit retry.');
    assert.deepEqual(retryErrors, [], '[' + target.name + '] failed-runtime recovery must not throw uncaught page errors.');
    await retryContext.close();
  }
  console.log('OVYX local AI browser contract passed on desktop/mobile, including cancellation, low-storage refusal and explicit recovery after a transient CPU runtime download failure. Genuine model acceptance is reported separately by the real CPU smoke workflow.');
} finally {
  await browser.close();
}
