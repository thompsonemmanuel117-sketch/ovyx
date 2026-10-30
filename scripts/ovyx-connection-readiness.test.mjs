import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('index.html');
const connectionsUiStart = html.indexOf('<script id="ovyx-v91-universal-connections-runtime">');
const connectionsUiEnd = html.indexOf('</script>', connectionsUiStart);
assert.ok(connectionsUiStart >= 0 && connectionsUiEnd > connectionsUiStart, 'Universal Connections runtime must exist.');
const ui = html.slice(connectionsUiStart, connectionsUiEnd);
const api = read('functions/api/settings/connections.js');
const connectionLib = read('functions/_lib/universal-connections.js');
const legacyUiStart = html.indexOf('async function renderConnectionsPanel()');
const legacyUiEnd = html.indexOf('</script>', legacyUiStart);
assert.ok(legacyUiStart >= 0 && legacyUiEnd > legacyUiStart, 'The compatibility connections renderer must remain bounded and available.');
const legacyUi = html.slice(legacyUiStart, legacyUiEnd);

// Universal Connections remains a real server-backed manager for non-AI
// services. Its authenticated ownership, encrypted secret and safe-health rules
// must not be removed by the model-provider migration.
assert.ok(ui.includes("const api=async(path,opts={})=>"), 'The V91 UI must use its authenticated API helper.');
assert.ok(ui.includes("const d=await api('/api/settings/connections')"), 'The V91 UI must read its saved service list.');
assert.ok(ui.includes("data-v91-delete"), 'The V91 UI must retain a way to remove old service records.');
assert.ok(ui.includes("Connection deleted."), 'The V91 UI must report successful service deletion.');
assert.ok(api.includes("if (request.method === 'GET')"), 'The API must retain authenticated read access.');
assert.ok(api.includes("if (request.method === 'DELETE')"), 'The API must retain safe deletion of user-owned connections.');
assert.ok(api.includes("if (action === 'test')"), 'The API must retain per-connection health tests for allowed non-AI services.');
assert.ok(api.includes("lastTestStatus: result.ok ? 'reachable' : 'unreachable'"), 'Successful non-AI tests must persist status.');
assert.ok(connectionLib.includes("method: 'GET'") && connectionLib.includes("'OVYX-Connection-Check/1.0'"),
  'Non-AI readiness checks must retain the bounded, read-only GET path.');
assert.ok(connectionLib.includes('delete copy.encryptedSecret') && connectionLib.includes('delete copy.secret'),
  'Public connection records must never return saved credentials.');

// Cloudflare Workers AI is the only model provider. The UI no longer permits
// creation or assignment of personal AI Brain connections.
assert.ok(api.includes('AI_PROVIDER_DISABLED'));
assert.ok(api.includes('Saved external AI credentials are preserved but are not tested or called'));
assert.ok(api.includes('OVYX uses Cloudflare Workers AI only'));
assert.ok(api.includes('activeBrainConnectionId: null'));
assert.ok(api.includes('activeWebStudioConnectionId: null'));
assert.doesNotMatch(ui, /<option value="ai">AI Brain<\/option>/);
const v91FormMarkup = ui.slice(0, ui.indexOf('  const connType='));
assert.doesNotMatch(v91FormMarkup, /openai-chat|anthropic-messages|gemini-generate-content/);
assert.doesNotMatch(ui, /MODEL \(AI BRAIN\)|Use as AI Brain|Use for Web Studio|Use for AI requests/);
const v91RowsStart = ui.indexOf('if(list)list.innerHTML=');
const v91RowsEnd = ui.indexOf("list?.querySelectorAll('[data-v91-test]')", v91RowsStart);
assert.ok(v91RowsStart >= 0 && v91RowsEnd > v91RowsStart, 'The active saved-connection renderer must remain bounded.');
const v91Rows = ui.slice(v91RowsStart, v91RowsEnd);
assert.match(v91Rows, /legacyAiModel/, 'The active renderer must classify legacy AI rows.');
assert.doesNotMatch(v91Rows, /data-v91-use-brain/, 'Legacy AI rows must not render an AI Brain selection action.');
assert.match(ui, /action:'use-ai'/, 'The legacy selection listener may remain inert; server-side action is rejected.');
assert.match(ui, /action:'test'/, 'Only the separate server gate can decide whether an old saved record may be checked.');
assert.match(ui, /const legacyAiModel=String\(row\.type\|\|''\)\.toLowerCase\(\)==='ai'/,
  'The active connection list must identify legacy AI model rows.');
assert.match(ui, /legacyAiModel\?'<span class="ovyx-v91-status"[^']*AI model disabled/,
  'Legacy AI model rows must not render a remote Test action in the active connections list.');
assert.match(legacyUi, /const legacyAiModel=String\(row\.type\|\|''\)\.toLowerCase\(\)==='ai'/,
  'The compatibility connection list must identify legacy AI model rows.');
assert.match(legacyUi, /legacyAiModel\?'<span class="ovyx-deep-status">AI model disabled/,
  'The compatibility renderer must suppress Test for legacy AI model rows.');
const testActionStart = api.indexOf("if (action === 'test')");
const aiProtocolGuard = api.indexOf('if (supportsAIProtocol(record.protocol))', testActionStart);
const remoteCheckCall = api.indexOf('const result = await testUserConnection(', testActionStart);
assert.ok(testActionStart >= 0 && aiProtocolGuard > testActionStart && remoteCheckCall > aiProtocolGuard,
  'Saved AI protocol records must be rejected before a remote health-check invocation.');

// The older renderer must not offer external model protocols or Brain selection.
assert.doesNotMatch(legacyUi, /<option value="ai">AI Brain<\/option>/);
assert.doesNotMatch(legacyUi, /<option[^>]+(?:openai-chat|anthropic-messages|gemini-generate-content)/,
  'The compatibility form must not offer legacy AI model protocol options.');
assert.match(legacyUi, /legacyAiModel/,
  'The compatibility renderer may recognize legacy protocols only to label old records disabled.');
assert.match(legacyUi, /legacyAiModel\?'<span class="ovyx-deep-status">AI model disabled/,
  'Legacy records must not be offered a remote AI model health test.');
assert.doesNotMatch(legacyUi, /Use for AI requests|Clear AI Brain/);
assert.match(legacyUi, /Cloudflare Workers AI · exclusive model provider/);
assert.match(legacyUi, /data-conn-delete/);

// Generic HTTP, webhook, database and tool integrations remain distinct from
// model inference and continue to support explicit non-AI service checks.
assert.match(ui, /<option value="webhook">Webhook<\/option>/);
assert.match(ui, /<option value="tool">Tool<\/option>/);
assert.match(ui, /<option value="database">Database<\/option>/);
assert.match(ui, /<option value="http">Web service<\/option>/);
assert.match(legacyUi, /Generic JSON HTTP/);
assert.match(legacyUi, /data-conn-test/);

console.log('Universal Connections tests passed: Cloudflare-only AI, legacy AI credentials retained without use, non-AI service integrations preserved.');
