import assert from 'node:assert/strict';

const keys=['GEMINI_API_KEY','ANTHROPIC_API_KEY','DEEPSEEK_API_KEY','OPENAI_API_KEY','OVYX_EVAL_LISTINGS_PUBLIC_BROWSER_URL','OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY','OVYX_EVAL_PUBLIC_ENQUIRY_URL','OVYX_EVAL_ENABLE_EXTERNAL_ENQUIRY_PROBE','OVYX_EVAL_ENQUIRY_TEST_RECIPIENT'];
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
  process.env.OVYX_EVAL_LISTINGS_PUBLIC_BROWSER_URL='https://feed.example.invalid/v1/properties';
  process.env.OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY='authoritative';
  process.env.OVYX_EVAL_PUBLIC_ENQUIRY_URL='https://forms.example.invalid/ovyx-qa';
  process.env.OVYX_EVAL_ENABLE_EXTERNAL_ENQUIRY_PROBE='true';
  process.env.OVYX_EVAL_ENQUIRY_TEST_RECIPIENT='ovyx-owner-test@example.invalid';
  const configured=module.publicIntegrationSettings();
  assert.equal(configured.listingsUrl.href,'https://feed.example.invalid/v1/properties');
  const liveCopy={'index.html':'<main><h1>Live listings available now</h1><p>Explore verified property listings around Lagos.</p></main>'};
  assert.equal(module.inventoryHonesty({industry:'real-estate'},liveCopy,false).passesHonestyGate,false,
    'copy must not claim active inventory when no public feed is configured');
  const configuredFeedCopy=module.inventoryHonesty({industry:'real-estate'},liveCopy,true);
  assert.equal(configuredFeedCopy.passesHonestyGate,true,
    'configured feed should avoid a false copy-only failure while the separate live integration audit verifies actual records');
  assert.equal(configuredFeedCopy.status,'public-feed-configured-inventory-awaiting-live-integration-proof');
  assert.equal(configured.enquiryUrl.href,'https://forms.example.invalid/ovyx-qa');
  const generatedPrompt=module.makeEvaluationPrompt({
    industry:'real-estate',
    prompt:'No real property inventory feed or client contact details are supplied. Show a clear honest live-inventory-not-connected empty state, or only visibly labelled illustrative sample cards.'
  },configured);
  assert.match(generatedPrompt,/https:\/\/feed\.example\.invalid\/v1\/properties/);
  assert.match(generatedPrompt,/Fetch the supplied property feed/);
  assert.match(generatedPrompt,/primary Contact page form action/);
  assert.match(module.qualityContractFor(configured),/two separate forms/);
  process.env.OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY='unverified';
  assert.equal(module.publicIntegrationSettings().listingsUrl,null,'An undeclared listing feed must not be passed off as authoritative.');
  process.env.OVYX_EVAL_LISTINGS_PUBLIC_BROWSER_URL='https://feed.example.invalid/v1/properties?api_key=must-not-appear';
  process.env.OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY='authoritative';
  assert.equal(module.publicIntegrationSettings().listingsUrl,null,'Credential-bearing feed URLs must never be placed into generated browser code.');
  process.env.OVYX_EVAL_PUBLIC_ENQUIRY_URL='';
  assert.equal(module.publicIntegrationSettings().enquiryUrl,null,'Enquiry routing requires an owner-approved public destination.');
  console.log('Live-generation evaluation refuses to report success when no real AI provider secret is configured.');
} finally {
  for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
  if(saved.OVYX_EVAL_PROVIDER===undefined)delete process.env.OVYX_EVAL_PROVIDER;else process.env.OVYX_EVAL_PROVIDER=saved.OVYX_EVAL_PROVIDER;
  if(saved.OVYX_EVAL_MODEL===undefined)delete process.env.OVYX_EVAL_MODEL;else process.env.OVYX_EVAL_MODEL=saved.OVYX_EVAL_MODEL;
}
