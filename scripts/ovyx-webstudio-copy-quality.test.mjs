import assert from 'node:assert/strict';
import {
  WEB_STUDIO_SYSTEM_PROMPT,
  WEB_STUDIO_EXCELLENCE,
  planPrompt,
  executePrompt,
  polishPrompt,
} from '../functions/_lib/prompts.js';

const sources = [
  ['system prompt', WEB_STUDIO_SYSTEM_PROMPT],
  ['excellence prompt', WEB_STUDIO_EXCELLENCE],
  ['planning prompt', planPrompt({ prompt: 'Build a neighborhood bakery website.', tree: '', hints: '', experience: {} })],
  ['implementation prompt', executePrompt({
    prompt: 'Build a neighborhood bakery website.',
    plan: {},
    files: '',
    hints: '',
    experience: {},
    allowDeletes: false,
    allowWorkflowChanges: false,
  })],
  ['polish prompt', polishPrompt({
    prompt: 'Build a neighborhood bakery website.',
    plan: {},
    experience: {},
    files: '',
    currentScore: 70,
    hints: '',
  })],
];

for (const [label, source] of sources) {
  assert.match(source, /proofread|proofreading/i, label + ' must require an editorial review.');
  assert.match(source, /typography/i, label + ' must require deliberate typography.');
  assert.match(source, /placeholder|filler/i, label + ' must reject placeholder or filler copy.');
}
assert.match(WEB_STUDIO_EXCELLENCE, /unsupported claims/i, 'Polished writing must not invent facts.');
assert.match(WEB_STUDIO_EXCELLENCE, /responsive widths/i, 'Typography must be checked responsively.');

console.log('OVYX Web Studio copy and typography quality contract passed.');
