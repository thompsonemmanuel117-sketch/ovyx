import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const keys=[
  'OVYX_EVAL_LISTINGS_API_URL','OVYX_EVAL_LISTINGS_API_TOKEN','OVYX_EVAL_LISTINGS_JSON_PATH',
  'OVYX_EVAL_LISTING_ID_FIELD','OVYX_EVAL_LISTING_TITLE_FIELD','OVYX_EVAL_LISTING_LOCATION_FIELD','OVYX_EVAL_LISTING_STATUS_FIELD',
  'OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY','OVYX_EVAL_REAL_ENQUIRY_URL','OVYX_EVAL_REAL_ENQUIRY_TOKEN',
  'OVYX_EVAL_ENABLE_EXTERNAL_ENQUIRY_PROBE','OVYX_EVAL_ENQUIRY_TEST_RECIPIENT','OVYX_EVAL_ENQUIRY_TEST_PAYLOAD_JSON',
  'OVYX_INTEGRATION_REPORT_OUT',
];
const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
const root=await fs.mkdtemp(path.join(os.tmpdir(),'ovyx-live-integration-contract-'));
process.env.OVYX_INTEGRATION_REPORT_OUT=path.join(root,'integration.json');
for(const key of keys)delete process.env[key];
process.env.OVYX_INTEGRATION_REPORT_OUT=path.join(root,'integration.json');
try{
  const module=await import('./ovyx-live-service-integration-eval.mjs?contract-test');
  assert.deepEqual(
    module.assessEnquiryAcknowledgement(202,{ok:true}),
    {endpointAcceptedTestPayload:true,explicitDeliveryReceipt:false,realEnquiryDeliveryConfirmed:false,deliveryStatusReported:null}
  );
  assert.equal(module.assessEnquiryAcknowledgement(202,{ok:true,deliveryStatus:'delivered'}).realEnquiryDeliveryConfirmed,true);
  assert.equal(module.assessEnquiryAcknowledgement(202,{ok:true,status:'queued'}).realEnquiryDeliveryConfirmed,false);
  const absent=await module.runLiveServiceIntegrationEvaluation(process.env);
  assert.equal(absent.listings.status,'not-configured');
  assert.equal(absent.listings.realListingsConfirmed,false);
  assert.equal(absent.enquiry.status,'not-configured');
  assert.equal(absent.enquiry.probeSent,false);
  assert.equal(absent.enquiry.realEnquiryDeliveryConfirmed,false);

  const rejectedTargets=await module.runLiveServiceIntegrationEvaluation({
    ...process.env,
    OVYX_EVAL_LISTINGS_API_URL:'http://127.0.0.1:1/should-not-be-contacted',
    OVYX_EVAL_REAL_ENQUIRY_URL:'http://example.invalid/enquiries',
    OVYX_EVAL_ENABLE_EXTERNAL_ENQUIRY_PROBE:'true',
    OVYX_EVAL_ENQUIRY_TEST_RECIPIENT:'ovyx-qa@example.invalid',
  });
  assert.equal(rejectedTargets.listings.status,'source-request-failed');
  assert.equal(rejectedTargets.listings.realListingsConfirmed,false);
  assert.equal(rejectedTargets.enquiry.status,'invalid-endpoint');
  assert.equal(rejectedTargets.enquiry.probeSent,false);
  assert.equal(rejectedTargets.enquiry.endpointAcceptedTestPayload,false);
  assert.equal(rejectedTargets.enquiry.realEnquiryDeliveryConfirmed,false);
  const stored=JSON.parse(await fs.readFile(path.join(root,'integration.json'),'utf8'));
  assert.equal(stored.listings.realListingsConfirmed,false);
  assert.equal(stored.enquiry.realEnquiryDeliveryConfirmed,false);
  console.log('Live-service evaluator refuses to confirm missing, unsafe or unproven listing/enquiry integrations.');
} finally {
  for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
  await fs.rm(root,{recursive:true,force:true});
}
