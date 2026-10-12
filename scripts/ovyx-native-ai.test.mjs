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
assert.equal(result.rawUsage.total_tokens, 35);

await assert.rejects(
  generateOvyxNativeAI({}, { prompt: 'Hello' }),
  error => error.code === 'OVYX_NATIVE_AI_NOT_CONFIGURED' && error.status === 503
);

console.log('OVYX native AI tests passed.');
