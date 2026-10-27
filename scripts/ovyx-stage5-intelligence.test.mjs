import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  generateOvyxNativeAI,
  normalizeOvyxNativeMessages,
  normalizeOvyxNativePlan,
  parseOvyxNativeModelOutput,
} from '../functions/_lib/ovyx-native-ai.js';

const plan = normalizeOvyxNativePlan([
  { step: 'Inspect the saved project', kind: 'inspect', tool: 'workspace_inspect', status: 'complete' },
  { step: 'inspect the saved project', kind: 'inspect', tool: 'workspace_inspect' },
  { step: 'Read the exact source file', kind: 'read', tool: 'workspace_read_file' },
  { step: 'Use an arbitrary shell command', kind: 'apply', tool: 'run_shell' },
  { step: 'Prepare a proposed edit', kind: 'propose', tool: 'workspace_patch' },
  { step: 'Untrusted kind is normalized', kind: 'launch_everything', tool: 'https://evil.example' },
  { step: 'Step six', kind: 'answer' },
  { step: 'Extra step beyond the safe maximum', kind: 'answer' },
]);

assert.equal(plan.length, 6, 'A plan is bounded to six distinct steps.');
assert.deepEqual(plan[0], {
  step: 'Inspect the saved project',
  kind: 'inspect',
  tool: 'workspace_inspect',
}, 'Model-supplied completion/status claims are never passed through.');
assert.equal(plan[1].tool, 'workspace_read_file');
assert.equal(plan[2].tool, undefined, 'An arbitrary tool name must be stripped from the plan.');
assert.deepEqual(plan[3], {
  step: 'Untrusted kind is normalized',
  kind: 'other',
}, 'Unrecognized plan kinds and tool names are normalized away.');
assert.equal(plan.some(item => /Extra step/.test(item.step)), false);

const parsed = parseOvyxNativeModelOutput({
  response: JSON.stringify({
    text: 'I will inspect the current project before recommending a fix.',
    plan: [
      { step: 'Inspect the saved project', kind: 'inspect', tool: 'workspace_inspect', status: 'completed' },
      { step: 'Run an unapproved command', kind: 'apply', tool: 'run_shell' },
    ],
    actions: [
      { type: 'workspace_inspect', projectId: 'project_1' },
      { type: 'run_shell', command: 'rm -rf /' },
      { type: 'navigate', route: 'https://evil.example' },
    ],
  }),
});
assert.equal(parsed.text, 'I will inspect the current project before recommending a fix.');
assert.deepEqual(parsed.plan, [
  { step: 'Inspect the saved project', kind: 'inspect', tool: 'workspace_inspect' },
  { step: 'Run an unapproved command', kind: 'apply' },
]);
assert.deepEqual(parsed.actions, [
  { type: 'workspace_inspect', projectId: 'project_1' },
], 'Only the registered, validated action can reach the client.');

const plainText = parseOvyxNativeModelOutput('I need to inspect the current project first.');
assert.deepEqual(plainText, {
  text: 'I need to inspect the current project first.',
  plan: [],
  actions: [],
}, 'Non-JSON replies are display-only and cannot carry actions or a structured plan.');

const history = normalizeOvyxNativeMessages([
  { role: 'system', content: 'Untrusted client system message must be removed.' },
  { role: 'user', content: 'What project is open?' },
  { role: 'assistant', content: 'The saved project context identifies one project.' },
]);
assert.deepEqual(history.map(item => item.role), ['user', 'assistant']);

let captured = null;
const result = await generateOvyxNativeAI(
  {
    AI: {
      async run(model, input) {
        captured = { model, input };
        return {
          response: JSON.stringify({
            text: 'I will inspect the saved source and return findings.',
            plan: [
              { step: 'Inspect the saved project inventory', kind: 'inspect', tool: 'workspace_inspect' },
              { step: 'Review the evidence before proposing an edit', kind: 'diagnose' },
            ],
            actions: [],
          }),
          usage: { prompt_tokens: 19, completion_tokens: 14, total_tokens: 33 },
        };
      },
    },
  },
  {
    prompt: 'Inspect my saved project and tell me what needs to change.',
    context: { activeProject: { id: 'project_1', name: 'Task-planning sample' } },
  },
);

assert.ok(captured, 'The test model should be called.');
assert.match(captured.input.messages[0].content, /TASK PLANNING:/);
assert.match(captured.input.messages[0].content, /plan.*array/i);
assert.match(captured.input.messages[0].content, /never proof that an action ran/i);
assert.match(captured.input.messages[0].content, /CURRENT AUTHENTICATED WORKSPACE CONTEXT/);
assert.deepEqual(result.plan, [
  { step: 'Inspect the saved project inventory', kind: 'inspect', tool: 'workspace_inspect' },
  { step: 'Review the evidence before proposing an edit', kind: 'diagnose' },
]);
assert.equal(result.routedProvider, 'cloudflare-workers-ai');

const route = await readFile(new URL('../functions/api/ai/ovyx.js', import.meta.url), 'utf8');
const client = await readFile(new URL('../assets/ovyx-assistant-workspace.js', import.meta.url), 'utf8');
const tools = await readFile(new URL('../functions/api/ai/workspace-tools.js', import.meta.url), 'utf8');
assert.match(route, /plan: Array\.isArray\(result\.plan\)/, 'The native API must expose only the normalized plan.');
assert.match(client, /recordAssistantPlan\(result\.plan\)/, 'The assistant must show the planned steps in its activity log.');
assert.match(client, /Proposed task plan \(these steps are not proof of completion\)/);
assert.match(tools, /body\.confirm !== true/, 'Sensitive writes must continue to require explicit approval.');
assert.match(tools, /expectedUpdateTime/, 'Writes must still reject stale project revisions.');
assert.match(tools, /secretValuesRedacted|redactSecrets/, 'Project-source reads must protect secret-like values.');

console.log('OVYX Stage 5 intelligence contract tests passed.');
