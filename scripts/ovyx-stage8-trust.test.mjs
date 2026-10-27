import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateOvyxNativeAI, normalizeOvyxNativeMode } from '../functions/_lib/ovyx-native-ai.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [packageSource, html, settingsClient, nativeClient, chatRoute, readinessRoute, trustClient, middleware, connectionReadiness] = await Promise.all([
  read('../package.json'),
  read('../index.html'),
  read('../assets/ovyx-assistant-workspace.js'),
  read('../functions/_lib/ovyx-native-ai.js'),
  read('../functions/api/ai/ovyx.js'),
  read('../functions/api/ai/readiness.js'),
  read('../assets/ovyx-ai-trust.js'),
  read('../functions/_middleware.js'),
  read('../scripts/ovyx-connection-readiness.test.mjs'),
]);

const scripts = JSON.parse(packageSource).scripts;
assert.match(scripts.test, /node scripts\/ovyx-ai-readiness\.test\.mjs/);
assert.match(scripts.test, /node scripts\/ovyx-stage8-trust\.test\.mjs/);

// The end-user AI preference UI must describe OVYX modes, not imply that a
// Gemini/Claude/OpenAI dropdown controls the guarded Cloudflare engine.
for (const obsolete of [
  'data-legacy-control="set-provider"',
  'id="set-provider"',
  'id="set-ai-model"',
  'id="set-ai-routing"',
  'id="set-ai-fallback"',
]) assert.equal(html.includes(obsolete), false, 'Obsolete provider/model selector remains: ' + obsolete);
assert.match(html, /OVYX Everyday/);
assert.match(html, /OVYX Quick/);
assert.match(html, /OVYX Deep/);
assert.match(html, /These modes change response depth, not providers/);
assert.match(html, /data-ovyx-ai-readiness="settings"/);
assert.match(html, /data-ai-readiness-refresh/);
assert.match(html, /provider:'automatic'/);
assert.match(html, /st\.provider='automatic'/);
assert.match(html, /st\.model='automatic'/);
assert.match(html, /ovyx:ai-preferences-changed/);

// A selected OVYX mode reaches the actual native endpoint and changes bounded
// output length. Invalid client-supplied values safely return to Everyday.
assert.equal(normalizeOvyxNativeMode('fast'), 'fast');
assert.equal(normalizeOvyxNativeMode('quality'), 'quality');
assert.equal(normalizeOvyxNativeMode('provider=gemini'), 'balanced');
assert.equal(normalizeOvyxNativeMode('../external-model'), 'balanced');

async function capturedMode(mode) {
  let captured;
  const result = await generateOvyxNativeAI({
    AI: {
      async run(model, input) {
        captured = { model, input };
        return { response: JSON.stringify({ text: 'The request was handled.', actions: [] }), usage: { total_tokens: 5 } };
      },
    },
  }, { prompt: 'Explain this task.', mode });
  return { captured, result };
}
const quick = await capturedMode('fast');
const everyday = await capturedMode('balanced');
const deep = await capturedMode('quality');
const invalid = await capturedMode('choose-another-provider');
assert.equal(quick.captured.input.max_tokens, 900);
assert.equal(everyday.captured.input.max_tokens, 1800);
assert.equal(deep.captured.input.max_tokens, 2800);
assert.equal(quick.result.mode, 'fast');
assert.equal(everyday.result.mode, 'balanced');
assert.equal(deep.result.mode, 'quality');
assert.equal(invalid.result.mode, 'balanced');
assert.match(quick.captured.input.messages[0].content, /OVYX Quick mode/);
assert.match(deep.captured.input.messages[0].content, /OVYX Deep mode/);

// Readiness is a setup-only check and must not call model inference or suggest
// that configuration presence proves live provider success.
assert.match(readinessRoute, /liveInferenceTested: false/);
assert.match(readinessRoute, /No AI request was sent/);
assert.match(readinessRoute, /getActiveBrainConnectionId/);
assert.match(readinessRoute, /Cache-Control.*no-store/);
assert.match(trustClient, /\/api\/ai\/readiness/);
assert.match(trustClient, /not live-tested/);
assert.match(trustClient, /Check again/);
assert.match(trustClient, /No AI request is sent and no AI usage is spent/);
assert.match(middleware, /ovyx-ai-trust\.js\?v=/);

// Failures should guide recovery while keeping selected-Brain exclusivity and
// the Stage 7 quota stop intact.
assert.match(settingsClient, /friendlyAiRecoveryMessage/);
assert.match(settingsClient, /did not switch to another provider/);
assert.match(settingsClient, /protected Cloudflare AI allowance/);
assert.match(settingsClient, /Settings → External Services & Plan Limits/);
assert.match(chatRoute, /mode: payload\.mode/);
assert.match(chatRoute, /mode: result\.mode/);
assert.match(nativeClient, /Quota exhaustion is a stop condition/);
assert.match(connectionReadiness, /activeBrainConnectionId/);

console.log('OVYX Stage 8 trust tests passed: OVYX modes, bounded mode behavior, setup-only readiness, recovery messages and guarded routing.');
