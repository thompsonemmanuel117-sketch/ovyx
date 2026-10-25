import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const page = read('local-ai-lab.html');
const client = read('assets/ovyx-local-ai-prototype.js');
const worker = read('assets/ovyx-local-ai-worker.js');
const cpuWorker = read('assets/ovyx-local-ai-cpu-worker.js');
const realLabSmoke = read('scripts/ovyx-local-ai-real-lab.smoke.mjs');
const routes = JSON.parse(read('_routes.json'));
const headers = read('_headers');
const middleware = read('functions/_middleware.js');

for (const [file, source] of [
  ['assets/ovyx-local-ai-prototype.js', client],
  ['assets/ovyx-local-ai-worker.js', worker],
  ['assets/ovyx-local-ai-cpu-worker.js', cpuWorker],
  ['scripts/ovyx-local-ai-real-lab.smoke.mjs', realLabSmoke],
]) {
  assert.ok(source.length > 100, file + ' must not be empty');
  execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
}

assert.match(page, /STAGE 3 · ISOLATED PROTOTYPE/);
assert.match(page, /Download and start local AI/);
assert.match(page, /allow-model-download/);
assert.match(page, /Data-saver check/);
assert.match(page, /Use Wi-Fi if your data is limited/i);
assert.match(client, /function updateDownloadGuard\(\)/);
assert.match(client, /!downloadConsent\.checked/);
assert.match(client, /opfsModelWeightCached/);
assert.match(client, /could not confirm that the full model weights were saved in persistent browser storage/i);
assert.match(page, /Nothing is downloaded until you press the explicit start button/i);
assert.match(page, /assets\/ovyx-local-ai-prototype\.js/);
assert.match(page, /option value="smollm2-135m-cpu" selected/, 'the smallest data-saver model must be the explicit default selection, without auto-download');
assert.match(page, /about 136 MB weights/, 'the data-saver option must disclose its approximate weight size');
assert.match(page, /option value="qwen25-05b-cpu"/, 'the larger CPU/WASM model must remain explicitly selectable rather than a silent fallback');
assert.match(page, /OVYX never switches models or sends prompts to a cloud provider automatically/i);
assert.doesNotMatch(page, /ovyx-assistant-workspace\.js|assets\/ovyx-launch-polish\.js|index\.html/);

const middlewarePathCheck = "const normalizedPath = url.pathname.replace(/\\/+$/, '').toLowerCase();";
assert.ok(middleware.includes(middlewarePathCheck)
    && middleware.includes("normalizedPath === '/local-ai-lab.html'")
    && middleware.includes("normalizedPath === '/local-ai-lab'"),
  'global HTML middleware must bypass both the file URL and Cloudflare canonical extensionless local AI lab route');
assert.ok(routes.exclude.includes('/local-ai-lab.html')
    && routes.exclude.includes('/local-ai-lab'),
  '_routes.json must keep both local AI lab URL forms outside the main OVYX app middleware');
assert.match(headers, /\/local-ai-lab\.html[\s\S]*?Cross-Origin-Opener-Policy:\s*same-origin/i,
  'local lab must enable origin isolation for the WASM/WebGPU runtime');
assert.match(headers, /\/local-ai-lab\.html[\s\S]*?Cross-Origin-Embedder-Policy:\s*require-corp/i);
assert.match(headers, /\/assets\/ovyx-local-ai-worker\.js[\s\S]*?Cache-Control:\s*no-store/i);
assert.match(headers, /\/assets\/ovyx-local-ai-worker\.js[\s\S]*?Content-Type:\s*text\/javascript; charset=utf-8/i,
  'local AI worker must have a JavaScript MIME type when nosniff is enabled');
assert.match(headers, /\/assets\/ovyx-local-ai-worker\.js[\s\S]*?Cross-Origin-Opener-Policy:\s*same-origin/i);
assert.match(headers, /\/assets\/ovyx-local-ai-worker\.js[\s\S]*?Cross-Origin-Embedder-Policy:\s*require-corp/i);
assert.match(headers, /\/assets\/ovyx-local-ai-worker\.js[\s\S]*?Cross-Origin-Resource-Policy:\s*same-origin/i,
  'same-origin local worker must retain an explicit resource policy under the lab COEP policy');
assert.match(headers, /\/assets\/ovyx-local-ai-cpu-worker\.js[\s\S]*?Cache-Control:\s*no-store/i);
assert.match(headers, /\/assets\/ovyx-local-ai-cpu-worker\.js[\s\S]*?Content-Type:\s*text\/javascript; charset=utf-8/i);
assert.match(headers, /\/assets\/ovyx-local-ai-cpu-worker\.js[\s\S]*?Cross-Origin-Embedder-Policy:\s*require-corp/i);
assert.match(headers, /\/assets\/ovyx-local-ai-cpu-worker\.js[\s\S]*?Cross-Origin-Resource-Policy:\s*same-origin/i);

assert.match(client, /https:\/\/esm\.run\/@mlc-ai\/web-llm@0\.2\.86/);
assert.match(client, /const webllm = await import\(RUNTIME_URL\)/);
assert.match(client, /navigator\.gpu\.requestAdapter\(\)/);
assert.match(client, /const baseConfig = webllm\.prebuiltAppConfig/);
assert.match(client, /buildPinnedAppConfig\(webllm, model\)/);
assert.match(client, /const MLC_BINARY_COMMIT = '[0-9a-f]{40}'/);
assert.match(client, /model: model\.artifactUrl/);
assert.match(client, /hasModelInCache\(model\.id, appConfig\)/);
assert.match(client, /CreateWebWorkerMLCEngine/);
assert.match(client, /appConfig,/);
assert.match(client, /webllm\.hasModelInCache/);
assert.match(client, /CreateWebWorkerMLCEngine/);
assert.match(client, /initProgressCallback/);
assert.match(client, /engine\.chat\.completions\.create/);
assert.match(client, /stream:\s*true/);
assert.match(client, /engine\.interruptGenerate\(\)/);
assert.match(client, /currentEngine\?\.unload/);
assert.match(client, /conversation\.slice\(0,\s*-1\)\.slice\(-8\)/,
  'the current prompt must not be duplicated in the local conversation request');
assert.match(client, /max_tokens:\s*768/);
assert.match(client, /LOAD_INACTIVITY_TIMEOUT_MS = 180000/);
assert.match(client, /GENERATION_INACTIVITY_TIMEOUT_MS = 120000/);
assert.match(client, /LOCAL_GENERATION_IDLE_TIMEOUT/);
assert.match(client, /slice\(0, 2500\)/);
assert.match(client, /let remaining = 1800/);
assert.match(client, /slice\(0, 2500\)/);
assert.match(client, /Qwen3\.5-4B-q4f16_1-MLC/);
assert.match(client, /resolve\/44b4246/);
assert.match(client, /Qwen3\.5-2B-q4f32_1-MLC/);
assert.match(client, /Qwen3\.5-0\.8B-q4f16_1-MLC/,
  'a lower-resource local model must be available for target devices that cannot load 2B/4B candidates');
assert.match(client, /resolve\/0ec1389/);
assert.match(client, /447 MB/);
assert.match(client, /prepareDiagnosticRecord/);
assert.match(client, /recentGenerationMetrics/);
assert.match(client, /navigator\.clipboard\.writeText/);
assert.match(page, /id="prepare-diagnostics"/);
assert.match(page, /id="diagnostics-output"/);
assert.match(page, /never prompts, answers, project data or credentials/i);
assert.match(client, /resolve\/d835e5c/);
assert.match(client, /2\.59 GB/);
assert.match(client, /v0_2_86/);

assert.doesNotMatch(client, /\/api\/ai\/|\/api\/generate|api\.openai\.com|generativelanguage\.googleapis\.com|api\.anthropic\.com|api\.deepseek\.com|api\.groq\.com|openrouter\.ai\/api|api\.tavily\.com/i,
  'the prototype may not reference hosted model-inference or OVYX AI routes');
assert.doesNotMatch(worker, /\/api\/ai\/|\/api\/generate|api\.openai\.com|generativelanguage\.googleapis\.com|api\.anthropic\.com|api\.deepseek\.com|openrouter\.ai\/api/i);
assert.match(worker, /@mlc-ai\/web-llm@0\.2\.86/);
assert.match(cpuWorker, /@huggingface\/transformers@4\.3\.1/);
assert.match(cpuWorker, /onnx-community\/Qwen2\.5-0\.5B-Instruct/);
assert.match(cpuWorker, /onnx-community\/SmolLM2-135M-Instruct-ONNX/);
assert.match(cpuWorker, /b8a5c0f183b78c55955a5364f610c36668b5e681/);
assert.match(client, /sizeBytes: 136_000_000/);
assert.match(client, /SmolLM2 135M Data Saver CPU\/WASM/);
assert.match(cpuWorker, /revision:\s*MODEL_REVISION/);
assert.match(cpuWorker, /device:\s*'wasm'/);
assert.match(cpuWorker, /dtype:\s*'q8'/);
assert.match(cpuWorker, /MODEL_CACHE_VERSION\s*=\s*1/);
assert.match(cpuWorker, /url\.origin \+ url\.pathname/,
  'cache identity must ignore non-content download query parameters so reloads reuse the same pinned model asset');
assert.match(cpuWorker, /url\.pathname\.includes\('\/resolve\/main\/'\)/,
  'the CPU worker must recognize mutable main aliases');
assert.match(cpuWorker, /url\.pathname\.replace\('\/resolve\/main\//,
  'the CPU worker must pin mutable model aliases before network access');
assert.match(cpuWorker, /navigator\.storage\.getDirectory\(\)/);
assert.match(cpuWorker, /persistModelAsset\(url, response\.clone\(\)\)/);
assert.match(cpuWorker, /await response\.body\.pipeTo\(writable\)/);
assert.match(cpuWorker, /readCachedModelRangeProbe\(url\)/,
  'the CPU worker must serve the runtime’s one-byte range probe from the cached model instead of re-downloading metadata');
assert.match(cpuWorker, /await flushModelCacheWrites\(\)/);
assert.match(cpuWorker, /env\.useBrowserCache\s*=\s*false/,
  'CPU model assets must use the explicit cache wrapper rather than the unreliable library cache path');
assert.match(cpuWorker, /env\.useWasmCache\s*=\s*true/);
assert.match(cpuWorker, /callback_function\(text\)/);
assert.match(cpuWorker, /let TextStreamerClass = null/);
assert.match(cpuWorker, /TextStreamerClass = RuntimeTextStreamer/);
assert.match(cpuWorker, /new TextStreamerClass\(generator\.tokenizer/);
assert.match(cpuWorker, /Unable to add response to browser cache/i);
assert.doesNotMatch(cpuWorker, /\/api\/ai\/|\/api\/generate|api\.openai\.com|generativelanguage\.googleapis\.com|api\.anthropic\.com|api\.deepseek\.com|api\.groq\.com|openrouter\.ai\/api/i,
  'the CPU/WASM worker may not reference hosted inference endpoints');
assert.match(realLabSmoke, /baseURL \+ '\/local-ai-lab\.html'/);
assert.match(realLabSmoke, /selectOption\('smollm2-135m-cpu'\)/,
  'real CPU acceptance must use the user-facing lab and explicit CPU/WASM selection');
assert.match(realLabSmoke, /reloadWeightRequests/);
assert.match(realLabSmoke, /forbiddenRequests/);
assert.match(realLabSmoke, /promptEgressCount/);
assert.match(realLabSmoke, /CPU response stopped/i);

const startFunction = client.indexOf('async function startLocalModel()');
const runtimeImport = client.indexOf('await import(RUNTIME_URL)');
assert.ok(startFunction >= 0 && runtimeImport > startFunction,
  'WebLLM runtime import must live inside the explicit local model start function');
assert.match(client, /if \(isCpuModelKey\(key\)\) \{\s*await startCpuLocalModel\(key, model\);/,
  'CPU/WASM runtime must be selected by the user, not by a failed WebGPU model');
assert.match(client, /new Worker\('\/assets\/ovyx-local-ai-cpu-worker\.js'/);
assert.match(client, /requestCpuGeneration\(buildMessages\(prompt\)/);
assert.match(client, /CPU response stopped\. Its worker was terminated/);
assert.match(client, /revision:\s*'cc5cc01a65cc3ff17bdb73a7de33d879f62599b0'/);
assert.match(client, /startButton\.addEventListener\('click',\s*\(\)\s*=>\s*\{\s*if\s*\(!downloadConsent\.checked\)/,
  'the Start handler must enforce explicit data-download consent before model initialization');
assert.doesNotMatch(client.slice(0, startFunction), /CreateWebWorkerMLCEngine\(/,
  'no model initialization is allowed during page startup');
assert.ok(!/window\.OVYXAIService|firebase\.auth|localStorage\.setItem/.test(client),
  'isolated lab must not borrow main OVYX account/auth/request/storage code');

console.log('OVYX Stage 3 local-AI static contract passed. This is a static/privacy contract, not proof of genuine model inference.');
