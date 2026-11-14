import { authenticateRequest } from '../../../_lib/firebase.js';
import { getFirestoreData, setFirestoreDocument } from '../../../_lib/firebase-admin.js';
import { jsonResponse, requestId } from '../../_lib/http.js';

const clean=(value,max=300)=>String(value??'').trim().slice(0,max);
async function easRun(env,runId){
  const token=clean(env.EXPO_TOKEN,5000);
  if(!token||!runId)return null;
  const response=await fetch(`https://api.expo.dev/v2/workflows/runs/${encodeURIComponent(runId)}`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},cache:'no-store'});
  if(!response.ok)return null;
  const data=await response.json().catch(()=>null);
  return data?.data||null;
}
export async function onRequestGet(context){
  const id=requestId(context.request);
  try{
    const user=context.data?.user||await authenticateRequest(context.request,context.env);
    const userId=clean(user?.sub||user?.uid||'',180);
    const url=new URL(context.request.url);
    const jobId=clean(url.searchParams.get('jobId'),120);
    if(!jobId||!userId)return jsonResponse({ok:false,error:'A valid build job and authenticated user are required.',code:'BUILD_JOB_REQUIRED'},400,{'X-OVYX-Request-ID':id});
    const job=await getFirestoreData(context.env,'mobile_builds',jobId);
    if(!job)return jsonResponse({ok:false,error:'Mobile build job not found.',code:'BUILD_JOB_NOT_FOUND'},404,{'X-OVYX-Request-ID':id});
    if(String(job.userId)!==userId)return jsonResponse({ok:false,error:'You are not allowed to view this build.',code:'BUILD_ACCESS_DENIED'},403,{'X-OVYX-Request-ID':id});
    const run=await easRun(context.env,job.workflowRunId);
    const builds=Array.isArray(run?.jobs)?run.jobs.filter(item=>item?.type==='build').map(item=>({
      key:String(item.key||''),platform:String(item.key||'').toLowerCase().includes('ios')?'ios':'android',
      status:String(item.status||'new'),buildId:String(item.buildId||''),
      detailsUrl:item.buildId?`https://expo.dev/accounts/${encodeURIComponent(run?.accountName||'')}/projects/${encodeURIComponent(run?.projectName||'')}/builds/${encodeURIComponent(item.buildId)}`:''
    })):[];
    let nextStatus=String(job.status||'queued');
    if(run?.status==='success')nextStatus='completed'; else if(run?.status==='failure'||run?.status==='canceled')nextStatus='failed'; else if(run?.status==='in-progress')nextStatus='building';
    if(nextStatus!==job.status||builds.length)await setFirestoreDocument(context.env,'mobile_builds',jobId,{status:nextStatus,workflowStatus:run?.status||null,easBuilds:builds,updatedAt:new Date().toISOString()},{merge:true});
    return jsonResponse({ok:true,jobId,status:nextStatus,workflowStatus:run?.status||null,workflowUrl:String(job.workflowUrl||run?.url||''),artifacts:job.artifacts||{},builds,error:Array.isArray(job.errors)&&job.errors.length?job.errors[job.errors.length-1]:null,updatedAt:String(job.updatedAt||'')},200,{'X-OVYX-Request-ID':id});
  }catch(error){
    return jsonResponse({ok:false,error:error?.message||'Unable to read mobile build status.',code:error?.code||'MOBILE_BUILD_STATUS_FAILED'},error?.status||500,{'X-OVYX-Request-ID':id});
  }
}
export async function onRequest(context){
  if(context.request.method==='GET')return onRequestGet(context);
  return jsonResponse({ok:false,error:'GET is required.',code:'METHOD_NOT_ALLOWED'},405);
}
