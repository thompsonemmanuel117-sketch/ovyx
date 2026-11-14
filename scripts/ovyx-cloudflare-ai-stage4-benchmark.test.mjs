import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  validateBaseUrl, makeRequestPayload, assessCloudflareRouting, objectiveChecks,
  sanitizeRelativeFilePath, extractGeneratedFiles, loadStage4Cases
} from './ovyx-cloudflare-ai-stage4-benchmark.mjs';

assert.equal(validateBaseUrl('https://ovyx.example'),'https://ovyx.example');
assert.equal(validateBaseUrl('http://127.0.0.1:8788'),'http://127.0.0.1:8788');
assert.throws(()=>validateBaseUrl('http://ovyx.example'),/HTTPS/);
assert.throws(()=>validateBaseUrl('https://user:pass@ovyx.example'),/credentials/);
assert.throws(()=>validateBaseUrl('https://ovyx.example/path'),/origin only/);
assert.throws(()=>validateBaseUrl('https://ovyx.example/?token=x'),/query string/);

const suite=await loadStage4Cases();
assert.equal(suite.version,'ovyx-cloudflare-ai-stage4-v1');
assert.equal(suite.provider,'cloudflare-workers-ai');
assert.deepEqual(suite.tasks.map(t=>t.id),['T01','T02','T03','T04','T05','T06','T07','T08','T09','T10','T11','T12']);
assert.ok(suite.tasks.every(t=>t.title&&t.criteria&&Array.isArray(t.prompts)&&t.prompts.length>=1));
assert.equal(suite.tasks.find(t=>t.id==='T12').prompts.length,3);
assert.ok(suite.tasks.every(t=>t.prompts.every(p=>p.length>50&&p.length<20_000)));

const chat=suite.tasks.find(t=>t.id==='T01');
const chatPayload=makeRequestPayload({task:chat,prompt:chat.prompts[0],conversationId:'stage4_test_t01'});
assert.equal(chatPayload.mode,'assistant');
assert.equal(chatPayload.provider,'cloudflare-workers-ai');
assert.equal(chatPayload.fallback,'stop');
assert.equal(chatPayload.conversationId,'stage4_test_t01');
assert.equal(chatPayload.model,undefined,'The runner must use server-side Cloudflare model configuration.');
assert.equal(chatPayload.context,undefined);

const build=suite.tasks.find(t=>t.id==='T04');
const buildPayload=makeRequestPayload({task:build,prompt:build.prompts[0],conversationId:'stage4_test_t04'});
assert.equal(buildPayload.mode,'build');
assert.equal(buildPayload.provider,'cloudflare-workers-ai');
assert.equal(buildPayload.fallback,'stop');
assert.equal(buildPayload.context.activeView,'webstudio');
assert.equal(buildPayload.useUniversalConnectionAfterCloudflareLimit,false);

assert.equal(assessCloudflareRouting({provider:'cloudflare-workers-ai',routedProvider:'cloudflare-workers-ai'}).verified,true);
assert.equal(assessCloudflareRouting({provider:'gemini',routedProvider:'gemini'}).verified,false);
assert.equal(assessCloudflareRouting({provider:'cloudflare-workers-ai',routedProvider:'universal-connection'}).verified,false);
assert.equal(assessCloudflareRouting({provider:'cloudflare-workers-ai'}).verified,false);

assert.deepEqual(objectiveChecks('T01','Sales ₦18,900; purchase cost ₦13,500; gross profit ₦5,400; net profit ₦3,000.'),{type:'deterministic-arithmetic',sales18900:true,purchaseCost13500:true,grossProfit5400:true,netProfit3000:true});
const structure=objectiveChecks('T05',JSON.stringify({pages:[{route:'/'},{route:'/subjects/'},{route:'/contact/'}],sharedComponents:[],navigation:[],interactions:[],responsiveChecks:[]}));
assert.equal(structure.validJson,true);assert.equal(structure.exactTopLevelKeys,true);assert.equal(structure.exactlyThreePages,true);
const exact=objectiveChecks('T11',JSON.stringify({status:'needs_input',missing:['business','audience'],next_step:'Describe the website.'}));
assert.equal(exact.correctNeedsInputStatus,true);assert.equal(exact.exactTopLevelKeys,true);

assert.equal(sanitizeRelativeFilePath('index.html'),'index.html');
assert.equal(sanitizeRelativeFilePath('assets/site.css'),'assets/site.css');
assert.equal(sanitizeRelativeFilePath('../index.html'),null);
assert.equal(sanitizeRelativeFilePath('/index.html'),null);
assert.equal(sanitizeRelativeFilePath('.env'),null);
assert.equal(sanitizeRelativeFilePath('node_modules/x.js'),null);
assert.equal(sanitizeRelativeFilePath('ovyx-live-generation.json'),null);
const files=extractGeneratedFiles({files:{'index.html':'<html><body>test</body></html>','assets/site.css':{content:'body{margin:0}'},'../secret.txt':'nope','.env':'nope'}});
assert.deepEqual(Object.keys(files).sort(),['assets/site.css','index.html']);
assert.equal(files['index.html'],'<html><body>test</body></html>');

const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
assert.match(pkg.scripts['benchmark:cloudflare-ai-stage4'],/ovyx-cloudflare-ai-stage4-benchmark\.mjs/);
assert.match(pkg.scripts.test,/ovyx-cloudflare-ai-stage4-benchmark\.test\.mjs/);
const runner=fs.readFileSync('scripts/ovyx-cloudflare-ai-stage4-benchmark.mjs','utf8');
assert.match(runner,/\/api\/ai\/assistant/);
assert.match(runner,/provider:\s*REQUIRED_PROVIDER/);
assert.match(runner,/fallback:\s*'stop'/);
assert.match(runner,/OVYX_STAGE4_CONFIRM_LIVE_BENCHMARK/);
assert.match(runner,/OVYX_STAGE4_FIREBASE_ID_TOKEN/);
assert.match(runner,/routedProvider/);
assert.doesNotMatch(runner,/local-ai-lab\.html|web-llm|CreateWebWorkerMLCEngine/i,'Stage 4 must not attach to or load the local AI lab.');
assert.doesNotMatch(runner,/api\.openai\.com|generativelanguage\.googleapis\.com|api\.anthropic\.com|api\.deepseek\.com|openrouter\.ai\/api/,'The benchmark must not call another model vendor directly.');
console.log('OVYX Cloudflare AI Stage 4 benchmark contract tests passed.');
