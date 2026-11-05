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

// The legacy settings forms remain backward compatible. The injected Connect control center
// provides the secure personal-key and project-grant workflows without replacing those forms.
const controlCenter = read('assets/ovyx-connect-ai-fallback.js');
const middleware = read('functions/_middleware.js');
const grantApi = read('functions/api/settings/connection-grants.js');
const projectAction = read('functions/api/projects/connection-action.js');
assert.match(api, /aiRoutingPolicy: state\.activeBrainConnectionId \? 'cloudflare-then-personal-key' : 'cloudflare-only'/);
assert.match(api, /action === 'use-ai'/);
assert.match(api, /AI_CONNECTION_NOT_READY/);
assert.match(api, /activeBrainConnectionId: state\.activeBrainConnectionId/);
assert.match(controlCenter, /Personal AI fallback/);
assert.match(controlCenter, /type: 'ai'/);
assert.match(controlCenter, /api\.openai\.com/);
assert.match(controlCenter, /api\.anthropic\.com/);
assert.match(controlCenter, /generativelanguage\.googleapis\.com/);
assert.match(controlCenter, /api\/settings\/connection-grants/);
assert.match(controlCenter, /getIdToken\(false\)/);
assert.match(controlCenter, /OVYX monthly, booster and daily AI allowances are exhausted/);
assert.match(middleware, /ovyx-connect-ai-fallback\.js/);
assert.match(grantApi, /ownerUid !== uid/);
assert.match(projectAction, /callProjectUniversalConnection/);
assert.doesNotMatch(ui, /<option value="ai">AI Brain<\/option>/);
assert.match(ui, /action:'use-ai'/, 'The legacy listener remains available for the new authenticated selector.');
const testActionStart = api.indexOf("if (action === 'test')");
const remoteCheckCall = api.indexOf('const result = await testUserConnection(', testActionStart);
assert.ok(testActionStart >= 0 && remoteCheckCall > testActionStart, 'Connection health checks remain server-side and authenticated.');

// Generic HTTP, webhook, database and tool integrations remain distinct from
// model inference and continue to support explicit non-AI service checks.
assert.match(ui, /<option value="webhook">Webhook<\/option>/);
assert.match(ui, /<option value="tool">Tool<\/option>/);
assert.match(ui, /<option value="database">Database<\/option>/);
assert.match(ui, /<option value="http">Web service<\/option>/);
assert.match(legacyUi, /Generic JSON HTTP/);
assert.match(legacyUi, /data-conn-test/);

console.log('Universal Connections tests passed: secure personal AI fallback, official provider setup, project grants and non-AI service integrations.');
