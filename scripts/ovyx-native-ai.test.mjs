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

assert.equal(result.rawUsage.total_tokens, 35);

// The native assistant should honor an account-owned AI Brain even when the
// Cloudflare AI binding is not present, and parse the provider's text format.
let selectedBrainCalls = 0;
const selectedBrain = await generateOvyxNativeAI(
  { OVYX_AI_ENGINE_MODE: 'cloudflare-free-only' },
  {
    prompt: 'Explain my current project.',
    system: 'Keep answers useful.',
    context: { activeProject: { id: 'p-2', name: 'Selected Brain project' } },
    authUser: { uid: 'owner-123', sub: 'owner-123', email: 'owner@example.test' },
    universalBrainDependencies: {
      getActiveBrainConnectionId: async (_env, authUser) => {
        assert.equal(authUser.uid, 'owner-123');
        selectedBrainCalls += 1;
        return 'owner-brain-1';
      },
      callUserUniversalConnection: async (_env, input) => {
        assert.equal(input.connectionId, 'owner-brain-1');
        assert.equal(input.requireAIProtocol, true);
        assert.match(input.system, /Selected Brain project/);
        return {
          text: JSON.stringify({
            text: 'The selected account Brain is responding.',
            actions: [{ type: 'navigate', route: 'settings' }],
          }),
          provider: 'connection:owner-brain-1',
          routedProvider: 'universal-connection',
          model: 'gemini-2.5-flash',
          rawUsage: { prompt_tokens: 10, completion_tokens: 7, total_tokens: 17 },
        };
      },
    },
  },
);
assert.equal(selectedBrain.text, 'The selected account Brain is responding.');
assert.deepEqual(selectedBrain.actions, [{ type: 'navigate', route: 'settings' }]);
assert.equal(selectedBrain.provider, 'universal-connection');
assert.equal(selectedBrain.routedProvider, 'universal-connection');
assert.equal(selectedBrain.personalConnectionUsed, true);
assert.equal(selectedBrain.model, 'gemini-2.5-flash');
assert.equal(selectedBrain.rawUsage.total_tokens, 17);
assert.equal(selectedBrainCalls, 1);

// If the selected Brain fails, the native assistant must fail closed rather
// than silently trying Cloudflare or another platform provider.
await assert.rejects(
  () => generateOvyxNativeAI(
    { OVYX_AI_ENGINE_MODE: 'cloudflare-free-only' },
    {
      prompt: 'Continue with my selected Brain.',
      authUser: { uid: 'owner-123', sub: 'owner-123', email: 'owner@example.test' },
      universalBrainDependencies: {
        getActiveBrainConnectionId: async () => 'owner-brain-1',
        callUserUniversalConnection: async () => {
          throw Object.assign(new Error('provider unreachable'), {
            status: 503,
            code: 'CONNECTION_UPSTREAM_FAILED',
          });
        },
      },
    },
  ),
  error => error.code === 'CONNECTION_UPSTREAM_FAILED' &&
    /did not switch to another AI provider/.test(error.message),
);

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
