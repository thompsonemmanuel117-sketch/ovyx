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

assert.ok(ui.includes("const testLabel=row.lastTestStatus==='reachable'?'Ready':row.lastTestStatus==='unreachable'?'Needs attention':'Not checked'"),
  'Saved connections must visibly show the latest readiness result.');
assert.ok(ui.includes("status.textContent='Connections refreshed. '+active+' active / '+limit+' active.'"),
  'A successful reload must end in a useful status, not remain stuck on Loading.');
assert.ok(ui.includes("const saved=await api('/api/settings/connections'"),
  'The UI must retain the saved connection ID to run an automatic check.');
assert.ok(ui.includes("if(type==='ai'&&saved.connection?.id)"),
  'New AI Brain connections must be checked automatically after saving.');
assert.ok(ui.includes("JSON.stringify({action:'test',id:saved.connection.id})"),
  'The automatic AI Brain check must target the exact saved connection.');
assert.ok(ui.includes("resultMessage=readiness.ok?'The AI option is ready. Select “Use for AI requests” to activate it.'"),
  'A passing check must distinguish reachable from selected/active.');
assert.ok(ui.includes("status.textContent=resultMessage;status.dataset.state=resultState"),
  'The UI must preserve the readiness result after refreshing the list.');
assert.ok(ui.includes("JSON.stringify({action:'test',id:btn.dataset.v91UseBrain})"),
  'Selecting an AI Brain must re-check readiness before activation.');
assert.ok(ui.indexOf("JSON.stringify({action:'test',id:btn.dataset.v91UseBrain})") <
          ui.indexOf("JSON.stringify({action:'use-ai',id:btn.dataset.v91UseBrain})"),
  'An AI Brain must not be activated before its readiness check succeeds.');
assert.ok(ui.includes("await load();status.textContent='AI option verified and saved."),
  'Successful AI Brain selection must refresh the list and keep the success message.');
assert.ok(ui.includes("await load();status.textContent=message;status.dataset.state=state"),
  'Manual Test must refresh the visible status after the test finishes.');
assert.ok(ui.includes("Connection added. Use Test to verify reachability."),
  'Non-AI endpoints must not be probed automatically because GET requests to arbitrary endpoints may have side effects.');

assert.ok(api.includes("if (action === 'test')"), 'The server must support an authenticated per-connection readiness check.');
assert.ok(api.includes("lastTestStatus: result.ok ? 'reachable' : 'unreachable'"),
  'Readiness outcomes must be persisted so the UI can show them after refresh.');
assert.ok(connectionLib.includes("method: 'GET'") && connectionLib.includes("'OVYX-Connection-Check/1.0'"),
  'Readiness checks must use the bounded, read-only GET health-check path.');
assert.ok(connectionLib.includes('delete copy.encryptedSecret') && connectionLib.includes('delete copy.secret'),
  'Public connection records must never return saved credentials.');

// Brain and Web Studio continuation must be assigned independently. A key
// assigned for one purpose is never silently reused for the other.
assert.ok(ui.includes("data-v91-use-webstudio"), 'The settings UI must expose an explicit Web Studio assignment action.');
assert.ok(ui.includes("activeWebStudioConnectionId"), 'The UI must distinguish the selected Brain from the Web Studio connection.');
assert.ok(ui.includes("JSON.stringify({action:'test',id:btn.dataset.v91UseWebstudio})"),
  'Web Studio assignment must test the chosen connection first.');
assert.ok(ui.includes("JSON.stringify({action:'use-webstudio',id:btn.dataset.v91UseWebstudio})"),
  'Web Studio assignment must be explicit and account-scoped.');
assert.ok(ui.includes("JSON.stringify({action:'clear-webstudio'})"),
  'Users must be able to clear the separate Web Studio assignment.');
assert.ok(api.includes("action === 'use-webstudio'") && api.includes("action === 'clear-webstudio'"),
  'The server must support separately assigning and clearing the Web Studio connection.');
assert.ok(api.includes("activeWebStudioConnectionId: state.activeWebStudioConnectionId"),
  'The authenticated connection list must return the Web Studio assignment separately.');
assert.ok(connectionLib.includes("export async function getActiveWebStudioConnectionId"),
  'Runtime routing needs an account-scoped getter for the separate Web Studio assignment.');
assert.ok(connectionLib.includes('canUseForWebStudio: copy.active === true && supportsAI'),
  'Only active supported AI protocols can be assigned to Web Studio.');

console.log('Universal Connection readiness tests passed: AI Brain and Web Studio selections are separate, checked and secret-safe.');
