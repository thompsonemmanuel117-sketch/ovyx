import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseOvyxNativeModelOutput } from '../functions/_lib/ovyx-native-ai.js';
import { evaluateSiteFiles } from './ovyx-webstudio-evaluation-runner.mjs';

const native = await readFile(new URL('../functions/_lib/ovyx-native-ai.js', import.meta.url), 'utf8');
const client = await readFile(new URL('../assets/ovyx-assistant-workspace.js', import.meta.url), 'utf8');
const inspector = await readFile(new URL('../assets/ovyx-webstudio-quality.js', import.meta.url), 'utf8');
const workspaceTools = await readFile(new URL('../functions/api/ai/workspace-tools.js', import.meta.url), 'utf8');
const middleware = await readFile(new URL('../functions/_middleware.js', import.meta.url), 'utf8');

const parsed = parseOvyxNativeModelOutput({
  response: JSON.stringify({
    text: 'I will run the real Web Studio quality checks before recommending changes.',
    actions: [
      { type: 'workspace_quality_check', projectId: 'project_123' },
      { type: 'run_shell', command: 'rm -rf /' },
      { type: 'workspace_quality_check', projectId: '../other-project' },
    ],
  }),
});
assert.deepEqual(parsed.actions, [
  { type: 'workspace_quality_check', projectId: 'project_123' },
], 'Only a valid project-scoped quality action should pass the server action allowlist.');

assert.match(native, /WEBSITE QUALITY VERIFICATION:/);
assert.match(native, /workspace_quality_check/);
assert.match(client, /const READ_ONLY_WORKSPACE_ACTIONS = new Set\([\s\S]*workspace_quality_check/);
assert.match(client, /async function runWorkspaceQualityCheck\(projectId\)/);
assert.match(client, /activeId !== projectId/, 'The tool must not silently test a different active project.');
assert.match(client, /window\.OVYXWebStudioQuality/);
assert.match(client, /inspector\.run\(\)/, 'The assistant must execute the existing Web Studio inspector.');
assert.match(client, /browser\.completed\) === Number\(browser\.total\)/, 'The result must distinguish complete browser coverage from partial runs.');
assert.match(client, /Live external integrations and form delivery were not tested/);
assert.match(client, /No source was changed/);
assert.match(client, /function redactQualityText/);
assert.match(client, /BEGIN \[A-Z \]\* PRIVATE KEY/, 'The quality report redaction must handle private key material.');
assert.match(inspector, /var WIDTHS = \[320, 390, 768, 1024, 1440\]/);
assert.match(inspector, /setAttribute\('sandbox', 'allow-scripts'\)/);
assert.match(inspector, /connect-src 'none'/);
assert.match(inspector, /form-action 'none'/);
assert.match(inspector, /function probeControls\(\)/);
assert.match(inspector, /function auditAssetReference\(/);
assert.match(inspector, /function performInspection\(/);
assert.match(inspector, /window\.OVYXWebStudioQuality =/);
assert.match(middleware, /ovyx-webstudio-quality\.js/);
assert.match(workspaceTools, /function diagnoseProject\(/, 'Existing saved-project diagnostics must remain available.');

const suite = JSON.parse(await readFile(new URL('../scripts/ovyx-webstudio-evaluation-cases.json', import.meta.url), 'utf8'));
const category = suite.siteCategories.find(item => item.id === 'agency');
assert.ok(category, 'The artifact evaluator fixture must include an agency category.');
const site = evaluateSiteFiles({
  'index.html': '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sample</title><link rel="stylesheet" href="missing.css"></head><body><main><h1>Sample website</h1><a href="#not-here">Jump</a><img src="missing.png" alt="Sample"></main></body></html>',
}, category);
assert.ok(site.findings.some(item => /CSS|stylesheet|asset|resource/i.test(item.code + ' ' + item.message)), 'The artifact evaluator should flag missing local assets.');
assert.ok(site.findings.some(item => item.code === 'ORPHAN_FRAGMENT'), 'The artifact evaluator should flag broken same-page anchors.');
assert.ok(site.functionalAcceptance.every(item => item.browserBehaviorVerified === false), 'Static evidence must never be reported as browser verification.');
assert.ok(site.integrationTruth.every(item => String(item.status).includes('unverified')), 'Static source analysis must not claim live integration success.');

console.log('OVYX Stage 6 website/coding contract tests passed.');
