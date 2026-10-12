import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  extractNativeModelText,
  resolveNativeIntent,
  sanitizeNativeContext,
} from '../functions/_lib/ovyx-native-assistant.js';
import { onRequestPost } from '../functions/api/ai/ovyx.js';

const context = {
  workspace: {
    workspace: { name: 'OVYX Test Workspace', tier: 'free', currentView: 'home' },
    activeProject: {
      id: 'project-1',
      name: 'Sunrise Bakery',
      description: 'A bakery website',
      status: 'draft',
      pages: [{ id: 'home', name: 'Home', slug: '/' }, { id: 'menu', name: 'Menu', slug: '/menu' }],
      filePaths: ['src/index.html'],
      fileCount: 1,
      historyCount: 2,
    },
    projectInventory: [
      { id: 'project-1', name: 'Sunrise Bakery', status: 'draft', pagesCount: 2 },
      { id: 'project-2', name: 'Portfolio', status: 'published', pagesCount: 5 },
    ],
    activeProjectSource: [{
      path: 'src/config.js',
      content: 'const apiKey = "should-not-be-sent";\\nconst publicLabel = "demo";\\n',
    }],
    activeAssets: [{ id: 'asset-1', name: 'logo.svg', type: 'image/svg+xml', size: 1240 }],
    connections: [{ id: 'connection-1', name: 'Cloudflare', provider: 'cloudflare', connected: true }],
  },
  diagnostics: { activeView: 'home', routeExists: true, routerHealthy: true, graphFileCount: 1, duplicateIds: [], runtimeErrors: [] },
};

const projectIntent = resolveNativeIntent('Tell me about my active project', context);
assert.equal(projectIntent.handled, true);
assert.match(projectIntent.text, /Sunrise Bakery/);
assert.match(projectIntent.text, /Pages: 2/);

const routeIntent = resolveNativeIntent('Open Settings', context);
assert.equal(routeIntent.handled, true);
assert.deepEqual(routeIntent.actions, [{ type: 'navigate', route: 'settings' }]);

const buildIntent = resolveNativeIntent('Build a website for my bakery', context);
assert.equal(buildIntent.handled, true);
assert.equal(buildIntent.actions[0].route, 'webstudio');
assert.equal(buildIntent.actions[0].handoffPrompt, true);

const sanitized = sanitizeNativeContext(context);
assert.equal(sanitized.activeProject.name, 'Sunrise Bakery');
assert.equal(sanitized.projectInventory.length, 2);
assert.doesNotMatch(sanitized.activeProjectSource[0].content, /should-not-be-sent/);
assert.match(sanitized.activeProjectSource[0].content, /\[redacted\]/);

assert.equal(extractNativeModelText({ response: 'Native response' }), 'Native response');
assert.equal(extractNativeModelText({ choices: [{ message: { content: 'Choice response' } }] }), 'Choice response');

async function post(payload, env, uid) {
  const request = new Request('https://ovyx.test/api/ai/ovyx', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': 'test-request' },
    body: JSON.stringify(payload),
  });
  const response = await onRequestPost({
    request,
    env: env || {},
    data: { user: { sub: uid } },
  });
  return { response, body: await response.json() };
}

const noKeyIntent = await post({
  prompt: 'Tell me about my active project',
  context,
}, {}, 'native-intent-test');
assert.equal(noKeyIntent.response.status, 200);
assert.equal(noKeyIntent.body.ok, true);
assert.equal(noKeyIntent.body.provider, 'ovyx-native');
assert.match(noKeyIntent.body.text, /Sunrise Bakery/);

let modelName = '';
let modelMessages = null;
const nativeModel = {
  AI: {
    async run(model, input) {
      modelName = model;
      modelMessages = input.messages;
      return { response: 'Project documentation should live next to the relevant code and explain setup, decisions, and maintenance.', usage: { prompt_tokens: 17, completion_tokens: 22 } };
    },
  },
};
const generated = await post({
  prompt: 'How should I organize documentation for this project?',
  messages: [{ role: 'user', content: 'How should I organize documentation for this project?' }],
  context,
}, nativeModel, 'native-model-test');
assert.equal(generated.response.status, 200);
assert.equal(generated.body.ok, true);
assert.equal(generated.body.provider, 'ovyx-native-workers-ai');
assert.match(generated.body.text, /documentation/i);
assert.equal(modelName, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
assert.ok(Array.isArray(modelMessages));
assert.equal(modelMessages[0].role, 'system');
assert.doesNotMatch(JSON.stringify(modelMessages), /should-not-be-sent/);

const fallback = await post({
  prompt: 'Explain the trade-off between two frontend architecture patterns.',
  context,
}, {}, 'native-fallback-test');
assert.equal(fallback.response.status, 200);
assert.equal(fallback.body.ok, true);
assert.equal(fallback.body.limitedMode, true);
assert.equal(fallback.body.provider, 'ovyx-native');
assert.match(fallback.body.text, /not sent it to a third-party AI provider/i);

const unauthenticated = await onRequestPost({
  request: new Request('https://ovyx.test/api/ai/ovyx', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'hello' }),
  }),
  env: {},
  data: {},
});
assert.equal(unauthenticated.status, 401);

const backendSource = fs.readFileSync(new URL('../functions/api/ai/ovyx.js', import.meta.url), 'utf8');
assert.match(backendSource, /env\.AI\.run/);
assert.doesNotMatch(backendSource, /callModel|GEMINI_API_KEY|OPENAI_API_KEY|DEEPSEEK_API_KEY|ANTHROPIC_API_KEY|callUserUniversalConnection/);

console.log('OVYX native assistant tests passed.');
