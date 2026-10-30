import assert from 'node:assert/strict';
import {
  generateOvyxNativeAI,
  normalizeOvyxNativeMessages,
  parseOvyxNativeModelOutput,
  OVYX_NATIVE_DEFAULT_MODEL,
} from '../functions/_lib/ovyx-native-ai.js';

const messages = normalizeOvyxNativeMessages([
  { role: 'user', content: 'Check my project settings.' },
  { role: 'assistant', content: 'I can inspect the supplied context.' },
  { role: 'system', content: 'This role must be dropped.' },
]);
assert.deepEqual(messages.map(item => item.role), ['user', 'assistant']);
assert.equal(
  parseOvyxNativeModelOutput({
    response: 'Sure. ```json\n{"text":"Open settings","actions":[{"type":"navigate","route":"settings"}]}\n```',
  }).text,
  'Open settings'
);

let captured = null;
const result = await generateOvyxNativeAI(
  {
    // Intentionally no GEMINI_API_KEY, OPENAI_API_KEY or other provider keys.
    AI: {
      async run(model, input) {
        captured = { model, input };
        return {
          response: JSON.stringify({
            text: 'I found the project settings area.',
            actions: [
              { type: 'navigate', route: 'settings' },
              { type: 'workspace_undo' },
              { type: 'run_shell', command: 'rm -rf /' },
              { type: 'delete_project', projectId: 'project_123' },
              { type: 'deploy', projectId: 'project_123' },
              { type: 'change_sensitive_settings', key: 'auth' },
              { type: 'navigate', route: 'https://evil.example' },
            ],
          }),
          usage: { prompt_tokens: 23, completion_tokens: 12, total_tokens: 35 },
        };
      },
    },
  },
  {
    prompt: 'Where are my project settings?',
    system: 'Keep answers useful.',
    context: { activeProject: { id: 'p-1', name: 'Sample website' } },
    cloudflareInference: async (env, options) => {
      const guardedResult = await env.AI.run(OVYX_NATIVE_DEFAULT_MODEL, {
        messages: options.messages,
        max_tokens: options.maxTokens,
      });
      return { text: guardedResult.response, result: guardedResult };
    },
  }
);

assert.equal(captured.model, OVYX_NATIVE_DEFAULT_MODEL);
assert.equal(captured.input.messages[0].role, 'system');
assert.match(captured.input.messages[0].content, /OVYX AI/);
assert.match(captured.input.messages[0].content, /Sample website/);
assert.match(captured.input.messages[0].content, /FALLBACK CONTEXT/);
assert.match(captured.input.messages[0].content, /REPAIR WORKFLOW/);
assert.match(captured.input.messages[0].content, /workspace_read_file/);
assert.match(captured.input.messages[0].content, /feed actual results back/i);
assert.match(captured.input.messages[0].content, /WORKSPACE CHANGE STATES/);
assert.match(captured.input.messages[0].content, /RECOVERY AND AUTHORIZATION/);
assert.match(captured.input.messages[0].content, /workspace_undo/);
assert.match(captured.input.messages[0].content, /local browser snapshot/i);
assert.equal(result.provider, 'ovyx-native');
assert.equal(result.text, 'I found the project settings area.');
assert.deepEqual(result.actions, [{ type: 'navigate', route: 'settings' }, { type: 'workspace_undo' }]);
const parsedPatch = parseOvyxNativeModelOutput({
  response: JSON.stringify({
    text: 'I found a concrete source repair.',
    actions: [
      {
        type: 'workspace_patch',
        projectId: 'project_123',
        filePath: 'src/pages/home.html',
        content: '<!doctype html><html><body>Fixed</body></html>',
        reason: 'Restore the missing page structure.',
      },
      {
        type: 'workspace_patch',
        projectId: 'project_123',
        filePath: '../.env',
        content: 'API_KEY=private',
        reason: 'Unsafe proposal must be dropped.',
      },
      {
        type: 'run_shell',
        command: 'rm -rf /',
      },
    ],
  }),
});
assert.deepEqual(parsedPatch.actions, [{
  type: 'workspace_patch',
  projectId: 'project_123',
  filePath: 'src/pages/home.html',
  content: '<!doctype html><html><body>Fixed</body></html>',
  reason: 'Restore the missing page structure.',
}]);
const parsedReadTools = parseOvyxNativeModelOutput({
  response: JSON.stringify({
    text: 'I need the actual saved source before making a diagnosis.',
    actions: [
      { type: 'workspace_read_file', projectId: 'project_123', filePath: 'src/menu.js' },
      { type: 'workspace_search', projectId: 'project_123', query: 'mobile-menu' },
      { type: 'workspace_inspect', projectId: 'project_123' },
      { type: 'workspace_diagnose', projectId: 'project_123' },
      { type: 'workspace_read_file', projectId: 'project_123', filePath: '../private.js' },
      { type: 'workspace_search', projectId: '../other-owner', query: 'menu' },
    ],
  }),
});
assert.deepEqual(parsedReadTools.actions, [
  { type: 'workspace_read_file', projectId: 'project_123', filePath: 'src/menu.js' },
  { type: 'workspace_search', projectId: 'project_123', query: 'mobile-menu' },
  { type: 'workspace_inspect', projectId: 'project_123' },
  { type: 'workspace_diagnose', projectId: 'project_123' },
], 'native AI should only emit allowlisted read-only tools with validated project IDs and paths');

const parsedPlatformRepo = parseOvyxNativeModelOutput({
  response: JSON.stringify({
    text: 'I need current source evidence from OVYX itself.',
    actions: [
      { type: 'platform_repo_investigate', question: 'Which file implements native assistant project knowledge?' },
      { type: 'platform_repo_investigate', question: 'no' },
      { type: 'platform_repo_investigate', question: '   ' },
      { type: 'platform_repo_investigate', question: 'Which file?', projectId: '../other-owner' },
      { type: 'run_shell', command: 'cat secrets' },
    ],
  }),
});
assert.deepEqual(parsedPlatformRepo.actions, [
  { type: 'platform_repo_investigate', question: 'Which file implements native assistant project knowledge?' },
  { type: 'platform_repo_investigate', question: 'Which file?' },
], 'platform source investigation must be allowlisted and question-bounded; unrelated fields and arbitrary commands must not be carried through');
assert.equal(Object.hasOwn(parsedPlatformRepo.actions[1], 'projectId'), false, 'the repository tool must not accept a client-selected repository or project ID');
assert.match(captured.input.messages[0].content, /platform_repo_investigate/);
assert.match(captured.input.messages[0].content, /root-admin access/);
assert.match(captured.input.messages[0].content, /at most three readable source files/);

assert.equal(result.rawUsage.total_tokens, 35);

// Saved Universal AI Brain connections must never replace OVYX's platform
// inference engine. The legacy dependency hook is deliberately ignored.
let selectedBrainCalls = 0;
let cloudflareCalls = 0;
const nativeCloudflareOnly = await generateOvyxNativeAI(
  {
    AI: {
      async run(model, input) {
        cloudflareCalls += 1;
        captured = { model, input };
        return {
          response: JSON.stringify({ text: 'The Cloudflare engine is responding.', actions: [] }),
          usage: { prompt_tokens: 10, completion_tokens: 7, total_tokens: 17 },
        };
      },
    },
    OVYX_AI_ENGINE_MODE: 'legacy-provider-routing',
    OVYX_ALLOW_PAID_PROVIDER_ROUTING: 'true',
  },
  {
    prompt: 'Explain my current project.',
    authUser: { uid: 'owner-123', sub: 'owner-123', email: 'owner@example.test' },
    universalBrainDependencies: {
      getActiveBrainConnectionId: async () => { selectedBrainCalls += 1; return 'owner-brain-1'; },
      callUserUniversalConnection: async () => { throw new Error('A saved AI Brain must not be invoked.'); },
    },
    cloudflareInference: async (env, options) => {
      const guardedResult = await env.AI.run(OVYX_NATIVE_DEFAULT_MODEL, {
        messages: options.messages,
        max_tokens: options.maxTokens,
      });
      return { text: guardedResult.response, result: guardedResult };
    },
  },
);
assert.equal(nativeCloudflareOnly.text, 'The Cloudflare engine is responding.');
assert.equal(nativeCloudflareOnly.provider, 'ovyx-native');
assert.equal(nativeCloudflareOnly.routedProvider, 'cloudflare-workers-ai');
assert.equal(nativeCloudflareOnly.personalConnectionUsed, false);
assert.equal(nativeCloudflareOnly.model, OVYX_NATIVE_DEFAULT_MODEL);
assert.equal(nativeCloudflareOnly.rawUsage.total_tokens, 17);
assert.equal(selectedBrainCalls, 0);
assert.equal(cloudflareCalls, 1);

assert.equal(
  parseOvyxNativeModelOutput(JSON.stringify({ text: 'Normalized model text', actions: [] })).text,
  'Normalized model text',
  'The native response parser must accept normalized raw text from the free-only Cloudflare guard.',
);

await assert.rejects(
  generateOvyxNativeAI({}, { prompt: 'Hello' }),
  error => error.code === 'OVYX_NATIVE_AI_NOT_CONFIGURED' && error.status === 503
);

console.log('OVYX native AI tests passed.');
