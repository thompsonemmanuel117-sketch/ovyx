import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const page = read('local-ai-lab.html');
const client = read('assets/ovyx-local-ai-prototype.js');
const worker = read('assets/ovyx-local-ai-worker.js');
const routes = JSON.parse(read('_routes.json'));
const headers = read('_headers');
const middleware = read('functions/_middleware.js');

for (const [file, source] of [
  ['assets/ovyx-local-ai-prototype.js', client],
  ['assets/ovyx-local-ai-worker.js', worker],
]) {
  assert.ok(source.length > 100, file + ' must not be empty');
  execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
}

assert.match(page, /STAGE 3 · ISOLATED PROTOTYPE/);
assert.match(page, /Download and start local AI/);
assert.match(page, /Nothing is downloaded until you press the explicit start button/i);
assert.match(page, /assets\/ovyx-local-ai-prototype\.js/);
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
assert.match(client, /currentEngine\.unload/);
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
assert.match(client, /resolve\/d835e5c/);
assert.match(client, /2\.59 GB/);
assert.match(client, /v0_2_86/);

assert.doesNotMatch(client, /\/api\/ai\/|\/api\/generate|api\.openai\.com|generativelanguage\.googleapis\.com|api\.anthropic\.com|api\.deepseek\.com|api\.groq\.com|openrouter\.ai\/api|api\.tavily\.com/i,
  'the prototype may not reference hosted model-inference or OVYX AI routes');
assert.doesNotMatch(worker, /\/api\/ai\/|\/api\/generate|api\.openai\.com|generativelanguage\.googleapis\.com|api\.anthropic\.com|api\.deepseek\.com|openrouter\.ai\/api/i);
assert.match(worker, /@mlc-ai\/web-llm@0\.2\.86/);

const startFunction = client.indexOf('async function startLocalModel()');
const runtimeImport = client.indexOf('await import(RUNTIME_URL)');
assert.ok(startFunction >= 0 && runtimeImport > startFunction,
  'runtime import must live inside the local model start function');
assert.match(client, /startButton\.addEventListener\('click',\s*\(\)\s*=>\s*\{\s*void startLocalModel\(\);/,
  'the local model start function must only be invoked through explicit user action');
assert.doesNotMatch(client.slice(0, startFunction), /CreateWebWorkerMLCEngine\(/,
  'no model initialization is allowed during page startup');
assert.ok(!/window\.OVYXAIService|firebase\.auth|localStorage\.setItem/.test(client),
  'isolated lab must not borrow main OVYX account/auth/request/storage code');

console.log('OVYX Stage 3 local-AI static contract passed. This is a static/privacy contract, not proof of genuine model inference.');
