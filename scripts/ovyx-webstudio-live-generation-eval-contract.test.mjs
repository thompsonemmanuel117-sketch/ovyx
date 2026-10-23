import assert from 'node:assert/strict';

const keys=['GEMINI_API_KEY','ANTHROPIC_API_KEY','DEEPSEEK_API_KEY','OPENAI_API_KEY'];
const saved=Object.fromEntries([...keys,'OVYX_EVAL_PROVIDER','OVYX_EVAL_MODEL'].map(key=>[key,process.env[key]]));
for(const key of keys)delete process.env[key];
process.env.OVYX_EVAL_PROVIDER='gemini';
delete process.env.OVYX_EVAL_MODEL;
try{
  const module=await import('./ovyx-webstudio-live-generation-eval.mjs?contract-test');
  await assert.rejects(
    module.runLiveGenerationEvaluation(),
    error=>error?.code==='LIVE_GENERATION_BLOCKED_NO_PROVIDER_SECRET'&&/blocked, not passed/i.test(error.message)
  );
  console.log('Live-generation evaluation refuses to report success when no real AI provider secret is configured.');
} finally {
  for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
  if(saved.OVYX_EVAL_PROVIDER===undefined)delete process.env.OVYX_EVAL_PROVIDER;else process.env.OVYX_EVAL_PROVIDER=saved.OVYX_EVAL_PROVIDER;
  if(saved.OVYX_EVAL_MODEL===undefined)delete process.env.OVYX_EVAL_MODEL;else process.env.OVYX_EVAL_MODEL=saved.OVYX_EVAL_MODEL;
}
