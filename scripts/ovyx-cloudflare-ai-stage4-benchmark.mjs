import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { evaluateSiteFiles } from './ovyx-webstudio-evaluation-runner.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const CASES_PATH = path.join(SCRIPT_DIR, 'ovyx-cloudflare-ai-stage4-benchmark-cases.json');
const REQUIRED_PROVIDER = 'cloudflare-workers-ai';
const API_PATH = '/api/ai/assistant';
const CONFIRM = 'YES';
const RECOVERY_PROMPT = 'A previous AI request returned a timeout or service error. Give a safe recovery procedure: preserve failure evidence, make at most one bounded retry when safe, verify provider and response, never report a failed request as successful, and never switch providers without explicit authorization.';

function isLoopback(host) {
  return ['localhost','127.0.0.1','::1'].includes(String(host || '').toLowerCase());
}

export function validateBaseUrl(raw) {
  let url;
  try { url = new URL(String(raw || '').trim()); }
  catch { throw new Error('OVYX_STAGE4_BASE_URL must be a valid origin URL.'); }
  if (url.username || url.password || url.search || url.hash) throw new Error('OVYX_STAGE4_BASE_URL must not contain credentials, a query string or a fragment.');
  if (url.pathname && url.pathname !== '/') throw new Error('OVYX_STAGE4_BASE_URL must be the site origin only, without a path.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) {
    throw new Error('Use HTTPS for a deployed OVYX site; plain HTTP is permitted only for localhost testing.');
  }
  return url.origin;
}

export function makeRequestPayload({task,prompt,messages=null,conversationId}) {
  const websiteBuild = task?.id === 'T04';
  const body = {
    mode: websiteBuild ? 'build' : 'assistant',
    provider: REQUIRED_PROVIDER,
    fallback: 'stop',
    providerRouting: 'automatic',
    conversationId,
    prompt: String(prompt || '')
  };
  if (Array.isArray(messages) && messages.length) {
    body.messages = messages;
    delete body.prompt;
  }
  if (websiteBuild) {
    body.context = {
      activeView:'webstudio',
      evaluationArtifact:true,
      project:{name:'Cedar & Crumb',description:'Fictional bakery benchmark fixture, not a real business.',location:'Fictional sample location, Nigeria'},
      files:{}
    };
    body.useUniversalConnectionAfterCloudflareLimit = false;
  }
  return body;
}

export function assessCloudflareRouting(data) {
  const provider = String(data?.provider || '').trim().toLowerCase();
  const routedProvider = String(data?.routedProvider || '').trim().toLowerCase();
  return {provider:provider || null,routedProvider:routedProvider || null,verified:provider===REQUIRED_PROVIDER&&routedProvider===REQUIRED_PROVIDER};
}

export function strictJson(value) {
  try { return JSON.parse(String(value || '').trim()); } catch { return null; }
}

function numbersIn(answer) {
  return String(answer || '').replace(/,/g,'').match(/\d+(?:\.\d+)?/g) || [];
}

export function objectiveChecks(taskId,answer,siteEvaluation=null,generatedFiles={}) {
  if (taskId==='T01') {
    const values=numbersIn(answer);
    return {type:'deterministic-arithmetic',sales18900:values.includes('18900'),purchaseCost13500:values.includes('13500'),grossProfit5400:values.includes('5400'),netProfit3000:values.includes('3000')};
  }
  if (taskId==='T05') {
    const parsed=strictJson(answer),keys=['pages','sharedComponents','navigation','interactions','responsiveChecks'].sort();
    return {type:'strict-json-architecture',validJson:Boolean(parsed),exactTopLevelKeys:Boolean(parsed&&JSON.stringify(Object.keys(parsed).sort())===JSON.stringify(keys)),exactlyThreePages:Boolean(parsed&&Array.isArray(parsed.pages)&&parsed.pages.length===3)};
  }
  if (taskId==='T11') {
    const parsed=strictJson(answer),keys=['missing','next_step','status'].sort();
    return {type:'strict-json-instruction-following',validJson:Boolean(parsed),exactTopLevelKeys:Boolean(parsed&&JSON.stringify(Object.keys(parsed).sort())===JSON.stringify(keys)),correctNeedsInputStatus:Boolean(parsed&&parsed.status==='needs_input'),missingIsArray:Boolean(parsed&&Array.isArray(parsed.missing)),nextStepNonEmpty:Boolean(parsed&&typeof parsed.next_step==='string'&&parsed.next_step.trim())};
  }
  if (taskId==='T04') {
    const files=Object.keys(generatedFiles||{}),html=files.filter(file=>/\.html?$/i.test(file));
    return {type:'generated-site-static-evaluation',htmlFileCount:html.length,hasHtmlEntry:html.length>0,staticEvaluationStatus:siteEvaluation?.status||'not-run',technicalReadinessScore:Number.isFinite(siteEvaluation?.technicalReadinessScore)?siteEvaluation.technicalReadinessScore:null,blockerCount:Array.isArray(siteEvaluation?.findings)?siteEvaluation.findings.filter(f=>f.severity==='blocker').length:null};
  }
  if (taskId==='T12') {
    const lower=String(answer||'').toLowerCase();
    return {type:'context-retention',productName:lower.includes('kitedesk'),navyPalette:lower.includes('navy'),amberPalette:lower.includes('amber'),nigerianSmallBusinessAudience:/nigerian|nigeria/.test(lower)&&/small business|small-business|business owner|small enterprise/.test(lower),preservesNoPaymentConstraint:/no payment|without payment|payment processing.*not|not.*payment processing|exclude.*payment/i.test(String(answer||''))};
  }
  return {type:'manual-review-required'};
}

export function sanitizeRelativeFilePath(raw) {
  const value=String(raw||'').replace(/\\/g,'/').trim();
  if(!value||value.startsWith('/')||/^[A-Za-z]:/.test(value)||value.includes('\0'))return null;
  const parts=value.split('/');
  if(parts.some(part=>!part||part==='.'||part==='..'))return null;
  if(parts.some(part=>/^\.env(?:\.|$)/i.test(part)||part.toLowerCase()==='node_modules'||part.toLowerCase()==='.git'))return null;
  if(value.toLowerCase()==='ovyx-live-generation.json')return null;
  return value;
}

export function extractGeneratedFiles(data) {
  let candidate=data?.files||data?.data?.files||data?.project?.files||null;
  if(!candidate){
    const parsed=strictJson(data?.text||data?.answer||data?.message||'');
    candidate=parsed?.files||parsed?.fileEdits||parsed?.patch?.files||null;
  }
  const entries=[];
  if(Array.isArray(candidate)){
    for(const item of candidate){
      if(!item||typeof item!=='object')continue;
      const file=sanitizeRelativeFilePath(item.path||item.name||item.file||'');
      const content=typeof item.content==='string'?item.content:typeof item.code==='string'?item.code:typeof item.text==='string'?item.text:null;
      if(file&&content!==null)entries.push([file,content]);
    }
  }else if(candidate&&typeof candidate==='object'){
    for(const [rawPath,item] of Object.entries(candidate)){
      const file=sanitizeRelativeFilePath(rawPath);
      const content=typeof item==='string'?item:typeof item?.content==='string'?item.content:typeof item?.code==='string'?item.code:typeof item?.text==='string'?item.text:null;
      if(file&&content!==null)entries.push([file,content]);
    }
  }
  const output={};let total=0;
  for(const [file,content] of entries){
    const size=Buffer.byteLength(content,'utf8');
    if(size>2*1024*1024||total+size>20*1024*1024)continue;
    output[file]=content;total+=size;
  }
  return output;
}

function scrub(value,token='') {
  let text=String(value??'');
  if(token)text=text.split(token).join('[REDACTED]');
  return text.replace(/Bearer\s+[A-Za-z0-9._~-]{16,}/gi,'Bearer [REDACTED]');
}

function safeError(data,raw,token) {
  const value=data?.message||data?.error?.message||data?.error||raw||'Unclassified API failure.';
  return scrub(value,token).replace(/\s+/g,' ').slice(0,600);
}

export async function requestCloudflareAssistant({baseUrl,token,payload,timeoutMs=90_000,fetchImpl=fetch}) {
  const url=new URL(API_PATH,baseUrl),body=JSON.stringify(payload),started=performance.now();
  let response;
  try{
    response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','Authorization':'Bearer '+token,'Cache-Control':'no-store'},body,signal:AbortSignal.timeout(timeoutMs)});
  }catch(error){
    return {status:'network-error',httpStatus:null,totalMs:Math.round(performance.now()-started),requestBytes:Buffer.byteLength(body,'utf8'),responseBytes:0,errorCode:error?.name==='TimeoutError'||error?.name==='AbortError'?'REQUEST_TIMEOUT':'REQUEST_FAILED',errorMessage:scrub(error?.message||error,token).slice(0,600),payload:null,headersReceivedMs:null};
  }
  const headersAt=performance.now(),raw=await response.text(),totalMs=Math.round(performance.now()-started);
  let data=null;try{data=JSON.parse(raw);}catch{}
  const routing=assessCloudflareRouting(data);
  const usable=typeof data?.text==='string'||typeof data?.answer==='string'||(data?.files&&typeof data.files==='object');
  const status=!response.ok?'http-error':!routing.verified?'provider-unverified':data?.ok===false||!usable?'empty-or-invalid-response':'complete';
  return {
    status,httpStatus:response.status,totalMs,headersReceivedMs:Math.round(headersAt-started),
    requestBytes:Buffer.byteLength(body,'utf8'),responseBytes:Buffer.byteLength(raw,'utf8'),
    outputChars:typeof data?.text==='string'?data.text.length:typeof data?.answer==='string'?data.answer.length:0,
    errorCode:data?.code||data?.error?.code||null,
    errorMessage:!response.ok?safeError(data,raw,token):status==='provider-unverified'?'The API did not confirm provider and routedProvider as cloudflare-workers-ai. This response will not be scored.':status==='empty-or-invalid-response'?'The route returned no usable text or generated files.':null,
    requestId:response.headers.get('X-OVYX-Request-ID')||null,cfRay:response.headers.get('CF-Ray')||null,
    provider:routing.provider,routedProvider:routing.routedProvider,model:data?.model||null,
    usage:data?.usage&&typeof data.usage==='object'?data.usage:null,payload:data
  };
}

function percentile(values,fraction){
  const sorted=values.filter(Number.isFinite).slice().sort((a,b)=>a-b);
  return sorted.length?sorted[Math.max(0,Math.ceil(fraction*sorted.length)-1)]:null;
}
function createRunId(){return 'run_'+new Date().toISOString().replace(/\D/g,'').slice(0,14)+'_'+randomUUID().replace(/-/g,'').slice(0,10);}

async function runBrowserEvaluation(runDirectory,report){
  try{await import('playwright');}
  catch{report.generatedSite.browserEvaluation={status:'not-run-playwright-not-installed'};return;}
  const out=path.join(runDirectory,'browser-evaluation'),script=path.join(SCRIPT_DIR,'ovyx-webstudio-generated-site-browser-eval.mjs');
  const childEnv={...process.env};
  for(const key of ['OVYX_EVAL_ENABLE_EXTERNAL_ENQUIRY_PROBE','OVYX_EVAL_PUBLIC_ENQUIRY_URL','OVYX_EVAL_ENQUIRY_TEST_RECIPIENT','OVYX_EVAL_LISTINGS_PUBLIC_BROWSER_URL','OVYX_EVAL_LISTINGS_API_URL','OVYX_EVAL_REAL_ENQUIRY_URL'])delete childEnv[key];
  const child=spawnSync(process.execPath,[script,path.join(runDirectory,'generated-sites'),out],{cwd:ROOT,env:childEnv,encoding:'utf8',timeout:240_000,maxBuffer:4*1024*1024});
  let browserReport=null;try{browserReport=JSON.parse(await fs.readFile(path.join(out,'browser-report.json'),'utf8'));}catch{}
  report.generatedSite.browserEvaluation={status:child.status===0&&browserReport?(browserReport.status||'completed'):'failed-or-incomplete',reportPath:path.relative(ROOT,path.join(out,'browser-report.json')).replace(/\\/g,'/'),exitCode:child.status,error:child.error?scrub(child.error.message).slice(0,300):null,browserReport};
}

async function captureGeneratedSite({data,files,runDirectory,report}){
  const names=Object.keys(files||{});
  if(!names.some(name=>/\.html?$/i.test(name))){report.generatedSite={status:'not-generated-or-no-html',fileCount:names.length,files:names};return null;}
  const target=path.join(runDirectory,'generated-sites','cedar-crumb');await fs.mkdir(target,{recursive:true});
  for(const [relative,content] of Object.entries(files)){
    const safe=sanitizeRelativeFilePath(relative);if(!safe)continue;
    const destination=path.resolve(target,safe);if(destination!==target&&!destination.startsWith(target+path.sep))continue;
    await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,content,'utf8');
  }
  const siteMap=data?.siteMap||data?.data?.siteMap||null;
  await fs.writeFile(path.join(target,'ovyx-live-generation.json'),JSON.stringify({generatedAt:new Date().toISOString(),provider:data?.provider||null,routedProvider:data?.routedProvider||null,model:data?.model||null,siteMap},null,2)+'\n','utf8');
  let evaluation=null;
  try{evaluation=evaluateSiteFiles(files,'restaurant');}
  catch(error){evaluation={status:'evaluation-error',findings:[],error:scrub(error?.message||error).slice(0,500)};}
  report.generatedSite={
    status:'files-saved-for-isolated-review',fileCount:names.length,files:names,
    relativeDirectory:path.relative(ROOT,target).replace(/\\/g,'/'),
    staticEvaluation:{status:evaluation?.status||'unknown',technicalReadinessScore:Number.isFinite(evaluation?.technicalReadinessScore)?evaluation.technicalReadinessScore:null,counts:evaluation?.counts||null,findings:Array.isArray(evaluation?.findings)?evaluation.findings.slice(0,100):[],functionalAcceptance:Array.isArray(evaluation?.functionalAcceptance)?evaluation.functionalAcceptance:[]}
  };
  if(process.env.OVYX_STAGE4_RUN_BROWSER_EVAL===CONFIRM)await runBrowserEvaluation(runDirectory,report);
  else report.generatedSite.browserEvaluation={status:'not-run',note:'Set OVYX_STAGE4_RUN_BROWSER_EVAL=YES to run the existing isolated Playwright evaluator; external requests are blocked by its default policy.'};
  return evaluation;
}

function updatePerformance(report){
  const durations=[],headers=[];let requestBytes=0,responseBytes=0;
  for(const task of report.tasks||[])for(const turn of task.turns||[]){
    if(turn.status==='complete'&&Number.isFinite(turn.totalMs))durations.push(turn.totalMs);
    if(turn.status==='complete'&&Number.isFinite(turn.headersReceivedMs))headers.push(turn.headersReceivedMs);
    requestBytes+=Number(turn.requestBytes)||0;responseBytes+=Number(turn.responseBytes)||0;
  }
  report.performance={completedTurnCount:durations.length,totalRequestBytes:requestBytes,totalResponseBytes:responseBytes,medianTotalResponseMs:percentile(durations,.5),p95TotalResponseMs:percentile(durations,.95),medianTimeToResponseHeadersMs:percentile(headers,.5),p95TimeToResponseHeadersMs:percentile(headers,.95),note:'The endpoint returns JSON after generation rather than token streaming; response-header timing is not token latency.'};
}

async function finish(report,reportPath,rssStart,heapStart){
  report.finishedAt=new Date().toISOString();
  report.environment.rssAtEndBytes=process.memoryUsage().rss;report.environment.heapAtEndBytes=process.memoryUsage().heapUsed;
  report.environment.rssDeltaBytes=report.environment.rssAtEndBytes-rssStart;report.environment.heapDeltaBytes=report.environment.heapAtEndBytes-heapStart;
  updatePerformance(report);await fs.mkdir(path.dirname(reportPath),{recursive:true});await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');
  console.log(JSON.stringify({reportPath:path.relative(ROOT,reportPath).replace(/\\/g,'/'),provider:report.provider,targetRoute:report.targetRoute,overallDecision:report.overallDecision,taskCount:report.tasks.length,completedTasks:report.tasks.filter(t=>t.status==='captured').length,preflight:report.preflight?.status||'not-run',performance:report.performance,generatedSite:report.generatedSite?.status||'not-run'},null,2));
  return report;
}

async function main(){
  const env=process.env;
  if(env.OVYX_STAGE4_CONFIRM_LIVE_BENCHMARK!==CONFIRM)throw new Error('This is a live authenticated Cloudflare AI benchmark. Set OVYX_STAGE4_CONFIRM_LIVE_BENCHMARK=YES only when you approve using live OVYX AI quota and writing benchmark conversations to the signed-in account history.');
  if(!String(env.OVYX_STAGE4_FIREBASE_ID_TOKEN||'').trim())throw new Error('OVYX_STAGE4_FIREBASE_ID_TOKEN is required. Keep the Firebase ID token in an environment variable or secret; do not paste it into source code or a report.');
  const baseUrl=validateBaseUrl(env.OVYX_STAGE4_BASE_URL),token=String(env.OVYX_STAGE4_FIREBASE_ID_TOKEN).trim();
  const suite=JSON.parse(await fs.readFile(CASES_PATH,'utf8')),id=createRunId();
  const runDirectory=path.join(ROOT,'artifacts','ovyx-stage4-cloudflare-ai',id);await fs.mkdir(runDirectory,{recursive:true});
  const reportPath=path.join(runDirectory,'report.json'),rssStart=process.memoryUsage().rss,heapStart=process.memoryUsage().heapUsed;
  const report={
    schemaVersion:1,suite:suite.version,createdAt:new Date().toISOString(),runId:id,provider:REQUIRED_PROVIDER,targetRoute:API_PATH,targetBaseOrigin:baseUrl,
    modelPolicy:'Use the model returned by the deployed route. No model override is sent; server-side Cloudflare configuration remains authoritative.',
    environment:{runner:'Node.js CLI, not phone/browser device',node:process.version,platform:process.platform,architecture:process.arch,logicalCpuCount:os.cpus().length,rssAtStartBytes:rssStart,heapAtStartBytes:heapStart,targetDeviceMemory:'not measured by this CLI',cloudflareInferenceMemory:'not exposed by the current Workers AI response'},
    usageWarning:"This makes real authenticated requests, consumes the signed-in account's normal OVYX AI allowance, and writes turns to separate benchmark conversations in that account's chat history. No fallback provider is allowed.",
    preflight:null,tasks:[],consistencyProbes:[],recoveryProbe:null,generatedSite:{status:'not-run'},hardFail:false,overallDecision:'incomplete',
    privacy:'Only fixed benchmark prompts and generated answers are included. The Firebase token is never written to the report. No automatic report upload occurs.'
  };
  try{
    const pre=await requestCloudflareAssistant({baseUrl,token,timeoutMs:30_000,payload:{mode:'assistant',provider:REQUIRED_PROVIDER,fallback:'stop',providerRouting:'automatic',conversationId:'stage4_'+id+'_preflight'}});
    report.preflight={status:pre.httpStatus===400&&/PROMPT_REQUIRED/i.test(String(pre.errorCode||''))?'pass-invalid-request-rejected-without-inference':'failed-or-blocked',httpStatus:pre.httpStatus,errorCode:pre.errorCode,requestId:pre.requestId,responseMs:pre.totalMs,note:"This deliberately omits a prompt; the route must reject it with HTTP 400/PROMPT_REQUIRED before inference."};
    if(report.preflight.status!=='pass-invalid-request-rejected-without-inference'){
      report.overallDecision='blocked-preflight-auth-entitlement-or-route-contract';
      return await finish(report,reportPath,rssStart,heapStart);
    }

    const runTask=async task=>{
      const result={id:task.id,title:task.title,reviewCriteria:task.criteria,status:'running',turns:[],score0to4:null,reviewerNotes:'',objectiveChecks:null,buildChecks:task.id==='T04'?'pending-generated-files':'not-applicable',routeAssertion:'Both provider and routedProvider must equal cloudflare-workers-ai.'};
      report.tasks.push(result);
      const history=[],responseData=[];
      for(let index=0;index<task.prompts.length;index++){
        const prompt=task.prompts[index],conversationId='stage4_'+id+'_'+task.id.toLowerCase();
        const payload=makeRequestPayload({task,prompt,messages:task.id==='T12'?[...history,{role:'user',content:prompt}]:null,conversationId});
        const response=await requestCloudflareAssistant({baseUrl,token,payload,timeoutMs:task.id==='T04'?240_000:90_000});
        const data=response.payload;
        const answer=scrub(typeof data?.text==='string'?data.text:typeof data?.answer==='string'?data.answer:typeof data?.message==='string'?data.message:'',token);
        const turn={turn:index+1,status:response.status,httpStatus:response.httpStatus,provider:response.provider,routedProvider:response.routedProvider,model:response.model,errorCode:response.errorCode,errorMessage:response.errorMessage,requestId:response.requestId,cfRay:response.cfRay,totalMs:response.totalMs,headersReceivedMs:response.headersReceivedMs,requestBytes:response.requestBytes,responseBytes:response.responseBytes,outputChars:answer.length,usage:response.usage,prompt,answer};
        result.turns.push(turn);responseData.push(data);
        if(task.id==='T12'&&answer&&response.status==='complete')history.push({role:'user',content:prompt},{role:'assistant',content:answer});
        if(response.status!=='complete'){result.status=response.status;break;}
      }
      if(result.status==='running')result.status='captured';
      const finalAnswer=result.turns.at(-1)?.answer||'';
      let siteEval=null,files={};
      if(task.id==='T04'&&result.turns.some(turn=>turn.status==='complete')){
        files=extractGeneratedFiles(responseData.at(-1)||{});
        siteEval=await captureGeneratedSite({data:responseData.at(-1)||{},files,runDirectory,report});
        result.generatedFiles=Object.keys(files);result.generatedFileChars=Object.values(files).reduce((sum,value)=>sum+value.length,0);
        result.buildChecks=report.generatedSite.staticEvaluation?.status||report.generatedSite.status||'not-run';
      }
      result.objectiveChecks=objectiveChecks(task.id,finalAnswer,siteEval,files);
      return result;
    };

    for(let i=0;i<suite.tasks.length;i++){
      const task=suite.tasks[i],result=await runTask(task);
      if(result.status!=='captured'){
        for(const rest of suite.tasks.slice(i+1))report.tasks.push({id:rest.id,title:rest.title,reviewCriteria:rest.criteria,status:'not-run-after-previous-request-failure',turns:[],score0to4:null,reviewerNotes:'Stopped after a failed or provider-unverified request to avoid using more quota unexpectedly.',objectiveChecks:null,buildChecks:rest.id==='T04'?'not-run':'not-applicable'});
        report.overallDecision=result.status==='provider-unverified'?'blocked-provider-not-confirmed-cloudflare-workers-ai':[401,402,403,429].includes(Number(result.turns.at(-1)?.httpStatus))?'blocked-auth-entitlement-or-quota':'incomplete-request-failed';
        break;
      }
    }
    const allCore=report.tasks.length===suite.tasks.length&&report.tasks.every(task=>task.status==='captured');
    if(allCore&&env.OVYX_STAGE4_INCLUDE_RELIABILITY===CONFIRM){
      for(const taskId of ['T01','T05','T11']){
        const task=suite.tasks.find(item=>item.id===taskId),original=report.tasks.find(item=>item.id===taskId),prompt=task.prompts[0];
        const repeat=await requestCloudflareAssistant({baseUrl,token,timeoutMs:90_000,payload:makeRequestPayload({task,prompt,conversationId:'stage4_'+id+'_'+taskId.toLowerCase()+'_repeat')});
        const answer=scrub(repeat.payload?.text||repeat.payload?.answer||'',token),checks=objectiveChecks(taskId,answer);
        report.consistencyProbes.push({taskId,status:repeat.status,httpStatus:repeat.httpStatus,model:repeat.model,provider:repeat.provider,routedProvider:repeat.routedProvider,totalMs:repeat.totalMs,headersReceivedMs:repeat.headersReceivedMs,firstRunObjectiveChecks:original.objectiveChecks,repeatObjectiveChecks:checks,objectiveChecksAgree:repeat.status==='complete'&&JSON.stringify(original.objectiveChecks)===JSON.stringify(checks),scoreUsesOriginalRunOnly:true,answer});
        if(repeat.status!=='complete')break;
      }
      if(report.consistencyProbes.length===3&&report.consistencyProbes.every(item=>item.status==='complete')){
        const recovery=await requestCloudflareAssistant({baseUrl,token,timeoutMs:90_000,payload:makeRequestPayload({task:{id:'R01'},prompt:RECOVERY_PROMPT,conversationId:'stage4_'+id+'_recovery')});
        report.recoveryProbe={status:recovery.status,httpStatus:recovery.httpStatus,provider:recovery.provider,routedProvider:recovery.routedProvider,model:recovery.model,totalMs:recovery.totalMs,headersReceivedMs:recovery.headersReceivedMs,answer:scrub(recovery.payload?.text||recovery.payload?.answer||'',token),score0to4:null,note:'Human review required; this supplements the malformed-request-then-valid-task recovery check.'};
      }
    }else{
      report.recoveryProbe={status:'preflight-recovery-tested',malformedRequestRejected:report.preflight.status==='pass-invalid-request-rejected-without-inference',followedBySuccessfulTask:report.tasks.some(item=>item.id==='T01'&&item.status==='captured'),note:'A valid Cloudflare-routed task after the expected malformed-request rejection checks recovery without retrying the same failed task.'};
    }
    const allCaptured=report.tasks.length===suite.tasks.length&&report.tasks.every(task=>task.status==='captured');
    report.acceptanceGates={allCoreTasksCaptured:allCaptured,everyCapturedResponseConfirmedCloudflare:report.tasks.filter(t=>t.status==='captured').every(t=>t.turns.every(turn=>turn.provider===REQUIRED_PROVIDER&&turn.routedProvider===REQUIRED_PROVIDER)),answerScores:'pending-human-review',generatedSiteStaticEvaluation:report.generatedSite?.staticEvaluation?.status||'not-run',generatedSiteBrowserEvaluation:report.generatedSite?.browserEvaluation?.status||'not-run',targetDeviceEvidence:'not-collected-by-CLI'};
    report.overallDecision=report.overallDecision.startsWith('blocked-')||report.overallDecision==='incomplete-request-failed'?report.overallDecision:allCaptured?'incomplete-awaiting-human-scoring-site-review-and-target-device-evidence':'incomplete-tasks-not-all-captured';
    return await finish(report,reportPath,rssStart,heapStart);
  }catch(error){
    report.error=scrub(error?.message||error,token).slice(0,800);
    report.overallDecision='incomplete-runner-error';
    return await finish(report,reportPath,rssStart,heapStart);
  }
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  main().then(report=>{if(!report||!String(report.overallDecision||'').startsWith('incomplete-awaiting'))process.exitCode=1;})
    .catch(error=>{console.error(String(error?.message||error).replace(/\s+/g,' ').slice(0,1200));process.exitCode=1;});
}
export const loadStage4Cases=async()=>JSON.parse(await fs.readFile(CASES_PATH,'utf8'));
