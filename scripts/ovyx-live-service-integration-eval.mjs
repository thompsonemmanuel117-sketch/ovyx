import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const OUT=path.resolve(process.env.OVYX_LIVE_EVAL_OUT||'artifacts/webstudio-generated-sites');
const REPORT=path.resolve(process.env.OVYX_INTEGRATION_REPORT_OUT||'artifacts/webstudio-evaluation-report/integration-report.json');
const MAX_RESPONSE_BYTES=5_000_000;
const TIMEOUT_MS=15000;
const SECRET_QUERY=/(?:api[-_]?key|token|secret|auth|credential|password|access[-_]?key)/i;
const ACTIVE_STATUS=new Set(['active','published','available','live','for sale','for rent','listed','open']);

function safeEndpoint(raw,{allowLocal=false}={}){
  let url;
  try{url=new URL(String(raw||''));}catch{return {ok:false,reason:'not-a-valid-url'};}
  if(!['https:','http:'].includes(url.protocol))return {ok:false,reason:'unsupported-protocol'};
  if(url.protocol!=='https:'&&!(allowLocal&&['localhost','127.0.0.1','::1'].includes(url.hostname)))return {ok:false,reason:'https-required'};
  if(url.username||url.password)return {ok:false,reason:'credentials-in-url-not-allowed'};
  for(const key of url.searchParams.keys())if(SECRET_QUERY.test(key))return {ok:false,reason:'credential-query-parameter-not-allowed'};
  const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(['localhost','localhost.localdomain','metadata','metadata.google.internal','host.docker.internal','0.0.0.0','::1','169.254.169.254'].includes(host)||host.endsWith('.local')||host.endsWith('.internal')) {
    if(!(allowLocal&&['localhost','127.0.0.1','::1'].includes(host)))return {ok:false,reason:'private-or-local-host-not-allowed'};
  }
  if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)){
    const n=host.split('.').map(Number);
    if(n.every(v=>v>=0&&v<=255)){
      const [a,b]=n;
      if((a===10)||(a===127)||(a===0)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)){
        if(!(allowLocal&&a===127))return {ok:false,reason:'private-ip-not-allowed'};
      }
    }
  }
  return {ok:true,url};
}
function displayEndpoint(url){
  try{const u=new URL(url);return u.origin+u.pathname;}catch{return '';}
}
async function readBounded(response){
  const reader=response.body?.getReader();
  if(!reader)return '';
  const chunks=[];let bytes=0;
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      bytes+=value.byteLength;
      if(bytes>MAX_RESPONSE_BYTES){await reader.cancel();throw new Error('response-size-limit-exceeded');}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const joined=new Uint8Array(bytes);let offset=0;
  for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}
  return new TextDecoder().decode(joined);
}
async function requestJson(rawUrl,{method='GET',token='',payload=null,allowLocal=false}={}){
  const parsed=safeEndpoint(rawUrl,{allowLocal});
  if(!parsed.ok)return {ok:false,error:parsed.reason};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  try{
    const headers={accept:'application/json'};
    if(token)headers.authorization='Bearer '+token;
    if(payload!==null)headers['content-type']='application/json';
    let response;
    try{
      response=await fetch(parsed.url,{method,headers,body:payload===null?undefined:JSON.stringify(payload),signal:controller.signal,redirect:'manual'});
    }catch(error){return {ok:false,error:error.name==='AbortError'?'request-timeout':String(error.message||error).slice(0,180)};}
    if(response.status>=300&&response.status<400)return {ok:false,status:response.status,error:'redirect-not-followed-for-safety'};
    const text=await readBounded(response).catch(error=>'__READ_ERROR__:'+String(error.message||error));
    if(text.startsWith('__READ_ERROR__:'))return {ok:false,status:response.status,error:text.slice(16,220)};
    const type=response.headers.get('content-type')||'';
    let json=null;
    if(/json/i.test(type)&&text){try{json=JSON.parse(text);}catch{return {ok:false,status:response.status,error:'invalid-json-response'};}}
    return {ok:true,status:response.status,contentType:type,json,text:text.slice(0,5000),endpoint:parsed.url};
  }finally{clearTimeout(timer);}
}
function pathValue(value,dottedPath){
  if(!dottedPath)return undefined;
  return String(dottedPath).split('.').reduce((v,k)=>v&&typeof v==='object'?v[k]:undefined,value);
}
function findListings(payload,configuredPath){
  if(configuredPath){
    const candidate=pathValue(payload,configuredPath);
    return Array.isArray(candidate)?candidate:null;
  }
  if(Array.isArray(payload))return payload;
  const options=[payload?.listings,payload?.properties,payload?.results,payload?.data?.listings,payload?.data?.properties,payload?.data?.results,payload?.data];
  return options.find(Array.isArray)||null;
}
function firstValue(row,keys){
  for(const key of keys){const val=key.includes('.')?pathValue(row,key):row?.[key];if(val!==undefined&&val!==null&&String(val).trim()!=='')return val;}
  return null;
}
function assessRecord(row,env){
  const id=firstValue(row,[env.OVYX_EVAL_LISTING_ID_FIELD,'id','listingId','propertyId','reference','ref'].filter(Boolean));
  const title=firstValue(row,[env.OVYX_EVAL_LISTING_TITLE_FIELD,'title','name','headline'].filter(Boolean));
  const location=firstValue(row,[env.OVYX_EVAL_LISTING_LOCATION_FIELD,'address','location','area','city','locality'].filter(Boolean));
  const status=firstValue(row,[env.OVYX_EVAL_LISTING_STATUS_FIELD,'status','listingStatus','state'].filter(Boolean));
  const active=status!==null&&ACTIVE_STATUS.has(String(status).toLowerCase().replace(/[_-]+/g,' ').trim());
  return {hasStableId:id!==null,hasTitle:title!==null,hasLocation:location!==null,hasStatus:status!==null,activeStatus:active};
}
async function evaluateListings(env){
  const endpoint=String(env.OVYX_EVAL_LISTINGS_API_URL||'').trim();
  if(!endpoint)return {status:'not-configured',endpointConfigured:false,sourceHttpStatus:null,recordsReceived:0,usableRecordCount:0,liveStatusRecordCount:0,realListingsConfirmed:false,websiteFeedWiringVerified:false,note:'No authoritative property-feed endpoint was configured; no live properties are confirmed.'};
  const response=await requestJson(endpoint,{token:String(env.OVYX_EVAL_LISTINGS_API_TOKEN||'').trim()});
  if(!response.ok)return {status:'source-request-failed',endpointConfigured:true,endpoint:displayEndpoint(endpoint),sourceHttpStatus:response.status||null,error:response.error||'request-failed',recordsReceived:0,usableRecordCount:0,liveStatusRecordCount:0,realListingsConfirmed:false,websiteFeedWiringVerified:false,note:'Configured source could not be read as a successful JSON response.'};
  if(response.status<200||response.status>=300)return {status:'source-http-not-successful',endpoint:displayEndpoint(endpoint),sourceHttpStatus:response.status,recordsReceived:0,usableRecordCount:0,liveStatusRecordCount:0,realListingsConfirmed:false,websiteFeedWiringVerified:false};
  if(!response.json)return {status:'source-response-not-json',endpoint:displayEndpoint(endpoint),sourceHttpStatus:response.status,recordsReceived:0,usableRecordCount:0,liveStatusRecordCount:0,realListingsConfirmed:false,websiteFeedWiringVerified:false};
  const records=findListings(response.json,env.OVYX_EVAL_LISTINGS_JSON_PATH);
  if(!records)return {status:'listing-array-not-found',endpoint:displayEndpoint(endpoint),sourceHttpStatus:response.status,recordsReceived:0,usableRecordCount:0,liveStatusRecordCount:0,realListingsConfirmed:false,websiteFeedWiringVerified:false,note:'Configure OVYX_EVAL_LISTINGS_JSON_PATH to the array that contains listing records.'};
  const assessments=records.slice(0,1000).map(row=>assessRecord(row,env));
  const usable=assessments.filter(r=>r.hasStableId&&r.hasTitle&&r.hasLocation).length;
  const withStatus=assessments.filter(r=>r.hasStatus).length;
  const live=assessments.filter(r=>r.hasStableId&&r.hasTitle&&r.hasLocation&&r.activeStatus).length;
  let websiteFeedWiringVerified=false;
  const endpointUrl=new URL(endpoint);
  // A literal URL in page copy is not enough. Require the endpoint to appear in an executable
  // HTML/JS source alongside an actual request primitive, and inspect the full returned set.
  const applicationFiles=await findFiles(OUT,/\.(?:html?|js|mjs)$/i);
  for(const file of applicationFiles){
    let source=await fs.readFile(file,'utf8').catch(()=>'');
    source=source
      .replace(/<!--[\s\S]*?-->/g,' ')
      .replace(/\/\*[\s\S]*?\*\//g,' ')
      .replace(/(^|[^:])\/\/[^\n\r]*/g,'$1 ');
    const endpointReferenced=source.includes(endpointUrl.origin)||source.includes(endpointUrl.href)||source.includes(endpointUrl.pathname);
    const requestPrimitive=/\bfetch\s*\(|\baxios\.(?:get|post|put|request)\s*\(|\bXMLHttpRequest\b|\.open\s*\(\s*["'](?:GET|POST)["']/i.test(source);
    if(endpointReferenced&&requestPrimitive){websiteFeedWiringVerified=true;break;}
  }
  const authoritative=String(env.OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY||'').trim().toLowerCase()==='authoritative';
  const inspectedAllRecords=records.length<=1000&&assessments.length===records.length;
  const confirmed=authoritative&&inspectedAllRecords&&records.length>0&&live===records.length&&withStatus===records.length&&usable===records.length;
  return {
    status:confirmed&&websiteFeedWiringVerified?'authoritative-feed-live-records-and-site-reference-detected'
      :confirmed?'authoritative-feed-returned-live-records-but-site-wiring-unverified'
      :records.length===0?'source-returned-no-listings'
      :usable===Math.min(records.length,1000)?'records-usable-live-status-or-authority-not-proven':'records-fail-required-field-validation',
    endpointConfigured:true,endpoint:displayEndpoint(endpoint),sourceHttpStatus:response.status,
    recordsReceived:records.length,recordsInspected:assessments.length,inspectedAllRecords,usableRecordCount:usable,
    recordsWithExplicitStatus:withStatus,liveStatusRecordCount:live,
    authoritativeSourceDeclared:authoritative,websiteFeedWiringVerified,
    realListingsConfirmed:confirmed&&websiteFeedWiringVerified,
    note:'A configured endpoint returning JSON does not alone prove authenticity. Confirmation requires a declared authoritative source, inspection of the complete bounded result set, stable record identifiers, title/location fields, explicit active statuses, and a source-code request primitive alongside the endpoint reference. If the source returns more than 1000 records, confirmation is withheld until an explicit bounded query is used.',
  };
}
async function findFiles(dir,pattern,prefix=''){
  const found=[];let entries=[];try{entries=await fs.readdir(dir,{withFileTypes:true});}catch{return found;}
  for(const e of entries){if(e.name.startsWith('.')||e.name==='node_modules')continue;const rel=prefix?prefix+'/'+e.name:e.name;const absolute=path.join(dir,e.name);if(e.isDirectory())found.push(...await findFiles(absolute,pattern,rel));else if(e.isFile()&&pattern.test(rel))found.push(absolute);}
  return found;
}
async function evaluateEnquiry(env){
  const endpoint=String(env.OVYX_EVAL_REAL_ENQUIRY_URL||'').trim();
  if(!endpoint)return {status:'not-configured',endpointConfigured:false,probeSent:false,endpointAcceptedTestPayload:false,realEnquiryDeliveryConfirmed:false,note:'No client-approved enquiry destination was configured.'};
  const validation=safeEndpoint(endpoint);
  if(!validation.ok)return {status:'invalid-endpoint',endpointConfigured:true,probeSent:false,error:validation.reason,endpointAcceptedTestPayload:false,realEnquiryDeliveryConfirmed:false};
  if(String(env.OVYX_EVAL_ENABLE_EXTERNAL_ENQUIRY_PROBE||'').trim().toLowerCase()!=='true')
    return {status:'configured-probe-disabled',endpointConfigured:true,endpoint:displayEndpoint(endpoint),probeSent:false,endpointAcceptedTestPayload:false,realEnquiryDeliveryConfirmed:false,note:'External probes are opt-in because the destination may send a real message or create a lead.'};
  const testRecipient=String(env.OVYX_EVAL_ENQUIRY_TEST_RECIPIENT||'').trim();
  if(!testRecipient)return {status:'probe-blocked-no-test-recipient',endpointConfigured:true,endpoint:displayEndpoint(endpoint),probeSent:false,endpointAcceptedTestPayload:false,realEnquiryDeliveryConfirmed:false,note:'Provide a recipient controlled by the project owner before sending the test payload.'};
  let extra={};
  if(String(env.OVYX_EVAL_ENQUIRY_TEST_PAYLOAD_JSON||'').trim()){
    try{extra=JSON.parse(env.OVYX_EVAL_ENQUIRY_TEST_PAYLOAD_JSON);}catch{return {status:'invalid-test-payload-json',endpointConfigured:true,probeSent:false,endpointAcceptedTestPayload:false,realEnquiryDeliveryConfirmed:false};}
    if(!extra||typeof extra!=='object'||Array.isArray(extra))return {status:'invalid-test-payload-json',endpointConfigured:true,probeSent:false,endpointAcceptedTestPayload:false,realEnquiryDeliveryConfirmed:false};
  }
  const payload={...extra,name:'OVYX automated integration test',email:testRecipient,subject:'OVYX integration test — no action needed',message:'This is a pre-authorized OVYX integration-test enquiry, not a customer lead. Please do not act on it.',source:'OVYX QA',test:true,dryRun:true};
  const response=await requestJson(endpoint,{method:'POST',token:String(env.OVYX_EVAL_REAL_ENQUIRY_TOKEN||'').trim(),payload});
  if(!response.ok)return {status:'test-request-failed',endpointConfigured:true,endpoint:displayEndpoint(endpoint),probeSent:true,httpStatus:response.status||null,error:response.error||'request-failed',endpointAcceptedTestPayload:false,realEnquiryDeliveryConfirmed:false,note:'The QA payload was attempted but accepted delivery was not confirmed.'};
  const data=response.json||{};
  const affirmative=data.ok===true||data.accepted===true||data.success===true||data.queued===true||String(data.status||'').toLowerCase()==='accepted';
  const httpAccepted=response.status>=200&&response.status<300;
  const accepted=httpAccepted&&affirmative;
  return {
    status:accepted?'endpoint-accepted-test-payload-delivery-unverified':'endpoint-did-not-confirm-test-acceptance',
    endpointConfigured:true,endpoint:displayEndpoint(endpoint),probeSent:true,httpStatus:response.status,
    acknowledgementShape:response.json?Object.keys(response.json).slice(0,30):[],
    endpointAcceptedTestPayload:accepted,
    realEnquiryDeliveryConfirmed:false,
    note:accepted?'Endpoint explicitly acknowledged a QA payload. This proves acceptance by the configured endpoint only, not mailbox delivery, WhatsApp/social delivery, lead persistence or that a generated page is correctly wired to it.':'The endpoint did not return an explicit JSON acceptance acknowledgement; real delivery remains unverified.',
  };
}
export async function runLiveServiceIntegrationEvaluation(env=process.env){
  const report={
    schemaVersion:1,generatedAt:new Date().toISOString(),
    status:'evaluated-with-unverified-or-missing-integrations',
    listings:await evaluateListings(env),
    enquiry:await evaluateEnquiry(env),
    safeguards:[
      'No endpoint is inferred or invented.',
      'External enquiry probes require explicit opt-in and a project-owner-controlled test recipient.',
      'A successful HTTP response alone is not reported as a delivered enquiry.',
      'A listing feed is not reported as authoritative without explicit source-authority configuration, usable IDs/titles/locations and live status fields.',
    ],
  };
  if(report.listings.realListingsConfirmed&&report.enquiry.realEnquiryDeliveryConfirmed)report.status='configured-source-and-delivery-evidence-collected';
  await fs.mkdir(path.dirname(REPORT),{recursive:true});
  await fs.writeFile(REPORT,JSON.stringify(report,null,2)+'\n');
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  runLiveServiceIntegrationEvaluation().then(report=>{
    console.log(JSON.stringify({status:report.status,listings:report.listings.status,enquiry:report.enquiry.status,realListingsConfirmed:report.listings.realListingsConfirmed===true,realEnquiryDeliveryConfirmed:report.enquiry.realEnquiryDeliveryConfirmed===true,report:REPORT},null,2));
  }).catch(error=>{console.error('Live-service integration evaluation failed:',error);process.exitCode=1;});
}
