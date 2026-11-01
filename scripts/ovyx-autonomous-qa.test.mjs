import assert from 'node:assert/strict';
import {
  buildAutonomousRepairPrompt,
  createAutonomousQaReport,
  evaluateGeneratedWebsiteFiles,
  runAutonomousRepairCycle,
  selectAutonomousRepairTargets,
  validateAutonomousRepairCandidate,
} from '../functions/_lib/autonomous-qa.js';


const staticPass = evaluateGeneratedWebsiteFiles({
  'index.html': '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Working site</title></head><body><a href="/about.html">About</a><button type="button">Open menu</button></body></html>',
  'about.html': '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>About</title></head><body><h1>About us</h1></body></html>',
  'ovyx-qa-plan.json': JSON.stringify({ version: 1, backendRequired: false, journeys: [{ id: 'nav', steps: [{ action: 'click', selector: '[data-testid="about"]' }] }], apiChecks: [{ method: 'GET', route: '/api/health' }], backendChecks: [] }),
});
assert.equal(staticPass.channel, 'static');
assert.equal(staticPass.status, 'passed');
assert.ok(staticPass.testsRun >= 10);

const staticFailure = evaluateGeneratedWebsiteFiles({
  'index.html': '<html><body><h1>TODO</h1><a href="/missing.html">Broken</a><script src="app.js"></script></body></html>',
  'app.js': 'eval("alert(1)")',
  'ovyx-qa-plan.json': JSON.stringify({ version: 1, backendRequired: false, journeys: [{ id: 'unsafe', steps: [{ action: 'goto', route: 'https://example.com' }] }], apiChecks: [{ method: 'POST', route: '/api/charge' }], backendChecks: [] }),
});
assert.equal(staticFailure.status, 'failed');
assert.ok(staticFailure.findings.some(item => item.code === 'HTML_ENTRY_MISSING' || item.code === 'TITLE_MISSING'));
assert.ok(staticFailure.findings.some(item => item.code === 'DYNAMIC_CODE_EXECUTION'));
assert.ok(staticFailure.findings.some(item => item.code === 'QA_PLAN_MUTATING_API_PROBE'));
assert.ok(staticFailure.findings.some(item => item.code === 'QA_PLAN_ACTION_UNSUPPORTED'));
const overLimitPlan = evaluateGeneratedWebsiteFiles({
  'index.html': '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Bounded plan</title></head><body><h1>Bounded plan</h1></body></html>',
  'ovyx-qa-plan.json': JSON.stringify({ version: 1, backendRequired: false, journeys: Array.from({ length: 13 }, (_, index) => ({ id: 'journey-' + index, startRoute: '/', steps: [{ action: 'expectText', text: 'Bounded plan' }] })), apiChecks: [], backendChecks: [] }),
});
assert.equal(overLimitPlan.status, 'failed');
const missingBackendPlan = evaluateGeneratedWebsiteFiles({
  'index.html': '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Backend plan</title></head><body><h1>Backend plan</h1></body></html>',
  'ovyx-qa-plan.json': JSON.stringify({ version: 1, journeys: [{ id: 'home', startRoute: '/', steps: [{ action: 'expectText', text: 'Backend plan' }] }], apiChecks: [] }),
});
assert.ok(missingBackendPlan.findings.some(item => item.code === 'QA_BACKEND_PLAN_INVALID'),
  'A plan without backendChecks must not silently pass the backend-plan contract.');
const architectureRequiresBackend = evaluateGeneratedWebsiteFiles({
  'index.html': '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Architecture gate</title></head><body><h1>Architecture gate</h1></body></html>',
  'ovyx-qa-plan.json': JSON.stringify({ version: 1, backendRequired: false, journeys: [{ id: 'home', startRoute: '/', steps: [{ action: 'expectText', text: 'Architecture gate' }] }], apiChecks: [], backendChecks: [] }),
}, { backendRequired: true });
assert.ok(architectureRequiresBackend.findings.some(item => item.code === 'QA_BACKEND_REQUIRED_FLAG_MISSING'),
  'A generated model must not evade backend tests by declaring a frontend-only QA plan when the trusted architecture requires a backend.');
const unsafeBackendPlan = evaluateGeneratedWebsiteFiles({
  'index.html': '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Unsafe backend plan</title></head><body><h1>Unsafe backend plan</h1></body></html>',
  'ovyx-qa-plan.json': JSON.stringify({ version: 1, backendRequired: true, journeys: [{ id: 'home', startRoute: '/', steps: [{ action: 'expectText', text: 'Unsafe backend plan' }] }], apiChecks: [], backendChecks: [{ id: 'charge', method: 'POST', route: '/api/payments/charge', sourceFile: 'functions/api/payments.js', body: { amount: 5000 }, sideEffect: 'external-provider' }] }),
});
assert.ok(unsafeBackendPlan.findings.some(item => item.code === 'QA_BACKEND_CHECK_UNSAFE'),
  'Mutating backend checks must be explicitly restricted to disposable local side effects.');
assert.ok(overLimitPlan.findings.some(item => item.code === 'QA_PLAN_LIMIT_EXCEEDED'),
  'QA plan limits must be enforced before a runner silently truncates tests.');

const requiredChannels = ['static', 'browser', 'backend', 'journeys'];
const allPassed = requiredChannels.map(channel => ({ channel, status: 'passed', testsRun: 12, findings: [] }));

const missing = createAutonomousQaReport({
  requiredChannels,
  evidence: [{ channel: 'static', status: 'passed', testsRun: 4 }],
});
assert.equal(missing.status, 'incomplete', 'Missing browser/backend/journey evidence must never be treated as a pass.');
assert.equal(missing.summary.notRunChannels, 3);

const zeroRun = createAutonomousQaReport({
  requiredChannels: ['browser'],
  evidence: [{ channel: 'browser', status: 'passed', testsRun: 0 }],
});
assert.equal(zeroRun.status, 'incomplete', 'A claimed pass with zero executed tests must be downgraded.');

const passed = createAutonomousQaReport({ requiredChannels, evidence: allPassed });
assert.equal(passed.status, 'passed');
assert.equal(passed.summary.testsRun, 48);

const falsePass = createAutonomousQaReport({
  requiredChannels: ['browser'],
  evidence: [{
    channel: 'browser', status: 'passed', testsRun: 2,
    findings: [{ severity: 'blocker', code: 'BUTTON_DEAD', message: 'The primary button did not navigate.', file: 'index.html' }],
  }],
});
assert.equal(falsePass.status, 'needs-attention', 'A blocker finding must override a channel pass claim.');

const blocked = createAutonomousQaReport({
  requiredChannels: ['backend'],
  evidence: [{ channel: 'backend', status: 'blocked', testsRun: 0, blockedReason: 'Disposable database binding unavailable.' }],
});
assert.equal(blocked.status, 'blocked');
assert.equal(blocked.channels[0].blockedReason, 'Disposable database binding unavailable.');

const files = {
  'index.html': '<!doctype html><html><body><button id="buy">Buy</button></body></html>',
  'src/checkout.js': 'export function checkout(){ return false; }',
  'src/theme.css': 'body { color: black; }',
  '.env': 'API_KEY=secret-value-must-not-be-read',
  'migrations/0001.sql': 'DROP TABLE customers;',
  'package.json': '{ "scripts": { "build": "vite build" } }',
  'src/credentials.json': '{ "private_key": "not-for-repair" }',
  'src/secret.js': 'const token = "sk_live_12345678901234567890";',
  'src/firebase.js': 'export const firebaseConfig = { apiKey: "AIzaSyDUMMY0123456789abcdefghijklmnopqrstuv" };',
};

const findings = [
  { channel: 'browser', severity: 'blocker', code: 'BUTTON_NOOP', message: 'Buy button did not change route or state.', file: 'index.html' },
  { channel: 'browser', severity: 'blocker', code: 'BUTTON_NOOP', message: 'Checkout handler returned without a result.', file: 'src/checkout.js' },
  { channel: 'static', severity: 'warning', code: 'THEME', message: 'Theme needs refinement.', file: 'src/theme.css' },
  { channel: 'backend', severity: 'blocker', code: 'MIGRATION', message: 'Migration must be reviewed manually.', file: 'migrations/0001.sql' },
  { channel: 'security', severity: 'blocker', code: 'SECRET', message: 'Secret file must never be sent to repair.', file: '.env' },
  { channel: 'security', severity: 'blocker', code: 'SECRET', message: 'Credential-shaped source must not be sent.', file: 'src/secret.js' },
  { channel: 'security', severity: 'blocker', code: 'FIREBASE_KEY', message: 'Firebase config key must not be included in AI repair context.', file: 'src/firebase.js' },
  { channel: 'security', severity: 'blocker', code: 'TRAVERSAL', message: 'Traversal is rejected.', file: '../outside.js' },
];

const targets = selectAutonomousRepairTargets(files, findings);
assert.deepEqual(targets.map(item => item.path), ['index.html', 'src/checkout.js', 'src/theme.css']);
assert.ok(targets.every(item => !item.path.includes('..')));
const prompt = buildAutonomousRepairPrompt({ originalBrief: 'Build a working checkout.', findings, targets });
assert.match(prompt, /EXACT REPAIR ALLOWLIST/);
assert.match(prompt, /src\/checkout\.js/);
assert.doesNotMatch(prompt, /API_KEY=secret-value/);
assert.doesNotMatch(prompt, /sk_live_12345678901234567890/);

const validCandidate = validateAutonomousRepairCandidate({
  originalFiles: files,
  targets,
  repairOutput: JSON.stringify({ files: {
    'src/checkout.js': 'export function checkout(){ return { ok: true }; }',
  } }),
});
assert.equal(validCandidate.ok, true);
assert.deepEqual(validCandidate.changedPaths, ['src/checkout.js']);
assert.equal(validCandidate.files['index.html'], files['index.html'], 'Untargeted files must remain byte-for-byte unchanged.');

for (const [repairOutput, reason] of [
  ['not-json', 'invalid-json'],
  [JSON.stringify({ files: { '../outside.js': 'export const ok = true;' } }), 'repair-path-not-allowlisted'],
  [JSON.stringify({ files: { 'src/checkout.js': 'const api_key = "abcdefghijklmnop123456";' } }), 'secret-shaped-repair-content'],
  [JSON.stringify({ files: { 'src/checkout.js': '' } }), 'repair-content-invalid'],
  [JSON.stringify({ files: { 'src/checkout.js': files['src/checkout.js'] } }), 'repair-made-no-changes'],
]) {
  const result = validateAutonomousRepairCandidate({ originalFiles: files, targets, repairOutput });
  assert.equal(result.ok, false);
  assert.equal(result.reason, reason);
}

const sensitivePrompt = buildAutonomousRepairPrompt({
  originalBrief: 'Connect with sk_live_12345678901234567890 and API_KEY=abcdef0123456789 and Firebase key AIzaSyDUMMY0123456789abcdefghijklmnopqrstuv',
  findings: [{ channel: 'backend', severity: 'blocker', code: 'PROVIDER_ERROR', message: 'Provider rejected sk_test_12345678901234567890', file: 'src/checkout.js' }],
  targets: [{ path: 'src/checkout.js', content: 'export function checkout(){ return false; }' }],
});
assert.doesNotMatch(sensitivePrompt, /sk_live_12345678901234567890/);
assert.doesNotMatch(sensitivePrompt, /sk_test_12345678901234567890/);
assert.doesNotMatch(sensitivePrompt, /abcdef0123456789/);
assert.doesNotMatch(sensitivePrompt, /AIzaSyDUMMY0123456789abcdefghijklmnopqrstuv/);


const initialEvidence = [
  { channel: 'static', status: 'passed', testsRun: 5 },
  { channel: 'browser', status: 'failed', testsRun: 8, findings: [
    { severity: 'blocker', code: 'BUTTON_NOOP', message: 'Buy button did not navigate.', file: 'index.html' },
  ] },
  { channel: 'backend', status: 'passed', testsRun: 4 },
  { channel: 'journeys', status: 'failed', testsRun: 2, findings: [
    { severity: 'blocker', code: 'CHECKOUT_FAILED', message: 'Checkout journey did not reach confirmation.', file: 'src/checkout.js' },
  ] },
];

let repairCalls = 0;
let verifyCalls = 0;
const repaired = await runAutonomousRepairCycle({
  files,
  originalBrief: 'Build a working product checkout.',
  requiredChannels,
  initialEvidence,
  repair: async request => {
    repairCalls += 1;
    assert.match(request.prompt, /CHECKOUT_FAILED/);
    return { files: { 'src/checkout.js': 'export function checkout(){ return { ok: true, status: "confirmed" }; }' } };
  },
  verify: async ({ files: candidate }) => {
    verifyCalls += 1;
    assert.match(candidate['src/checkout.js'], /confirmed/);
    return allPassed;
  },
});
assert.equal(repairCalls, 1, 'The repair loop must be bounded to one attempt.');
assert.equal(verifyCalls, 1, 'The same verification suite must run after repair.');
assert.equal(repaired.repair.status, 'repaired-and-passed');
assert.equal(repaired.report.status, 'passed');
assert.deepEqual(repaired.repair.changedPaths, ['src/checkout.js']);

let rejectedRepairCalls = 0;
const rejected = await runAutonomousRepairCycle({
  files,
  originalBrief: 'Build a working product checkout.',
  requiredChannels,
  initialEvidence,
  repair: async () => {
    rejectedRepairCalls += 1;
    return { files: { 'src/checkout.js': 'export function checkout(){ return { ok: true }; }' } };
  },
  verify: async () => [
    { channel: 'static', status: 'passed', testsRun: 5 },
    { channel: 'browser', status: 'failed', testsRun: 8, findings: [
      { severity: 'blocker', code: 'NEW_OVERFLOW', message: 'A new horizontal overflow was introduced.', file: 'index.html' },
    ] },
    { channel: 'backend', status: 'passed', testsRun: 4 },
    { channel: 'journeys', status: 'failed', testsRun: 2, findings: [
      { severity: 'blocker', code: 'CHECKOUT_FAILED', message: 'Checkout journey did not reach confirmation.', file: 'src/checkout.js' },
    ] },
  ],
});
assert.equal(rejectedRepairCalls, 1);
assert.equal(rejected.repair.status, 'rejected', 'A repair that introduces a new finding must be rolled back.');
assert.equal(rejected.repair.reason, 'repair-introduced-new-findings');
assert.equal(rejected.files['src/checkout.js'], files['src/checkout.js'], 'Rejected candidates must not replace the original project files.');

const reducedCoverage = await runAutonomousRepairCycle({
  files,
  requiredChannels,
  initialEvidence,
  repair: async () => ({ files: { 'src/checkout.js': 'export function checkout(){ return { ok: true }; }' } }),
  verify: async () => [
    { channel: 'static', status: 'passed', testsRun: 5 },
    { channel: 'browser', status: 'not-run', testsRun: 0 },
    { channel: 'backend', status: 'passed', testsRun: 4 },
    { channel: 'journeys', status: 'failed', testsRun: 2, findings: [
      { severity: 'blocker', code: 'CHECKOUT_FAILED', message: 'Checkout journey did not reach confirmation.', file: 'src/checkout.js' },
    ] },
  ],
});
assert.equal(reducedCoverage.repair.status, 'rejected');
assert.equal(reducedCoverage.repair.reason, 'repair-reduced-or-blocked-test-coverage',
  'A repair must not pass by skipping or reducing a previously executed test channel.');
assert.equal(reducedCoverage.files['src/checkout.js'], files['src/checkout.js']);

const unavailable = await runAutonomousRepairCycle({
  files,
  requiredChannels,
  initialEvidence,
});
assert.equal(unavailable.repair.status, 'unavailable');
assert.equal(unavailable.files['src/checkout.js'], files['src/checkout.js']);

console.log('OVYX autonomous QA report, safe target selection, bounded repair and regression rejection tests passed.');
