import { getFirestoreData } from '../../../_lib/firebase-admin.js';
import { jsonResponse, requestId } from '../../_lib/http.js';

function hex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function verifySignature(secret,value,expected){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const actual=hex(await crypto.subtle.sign({name:'HMAC'},key,new TextEncoder().encode(value)));
  if(actual.length!==expected.length)return false;
  let diff=0;for(let i=0;i<actual.length;i+=1)diff|=actual.charCodeAt(i)^expected.charCodeAt(i);
  return diff===0;
}
export async function onRequestGet(context){
  const id=requestId(context.request);
  try{
    const url=new URL(context.request.url);
    const jobId=String(url.searchParams.get('jobId')||'').trim();
    const exp=String(url.searchParams.get('exp')||'').trim();
    const sig=String(url.searchParams.get('sig')||'').trim();
    const secret=String(context.env.OVYX_MOBILE_PAYLOAD_SECRET||'').trim();
    if(!jobId||!exp||!sig||!secret)return jsonResponse({ok:false,error:'This mobile build link isn't available right now.',code:'PAYLOAD_ACCESS_INVALID'},403,{'X-OVYX-Request-ID':id});
    if(!/^\d{10,16}$/.test(exp)||Number(exp)<Date.now())return jsonResponse({ok:false,error:'This mobile build link has expired. Start a new build to get an updated link.',code:'PAYLOAD_EXPIRED'},410,{'X-OVYX-Request-ID':id});
    if(!await verifySignature(secret,`${jobId}.${exp}`,sig))return jsonResponse({ok:false,error:'This mobile build link couldn't be verified.',code:'PAYLOAD_SIGNATURE_INVALID'},403,{'X-OVYX-Request-ID':id});
    const job=await getFirestoreData(context.env,'mobile_builds',jobId);
    if(!job)return jsonResponse({ok:false,error:'Mobile build job not found.',code:'BUILD_JOB_NOT_FOUND'},404,{'X-OVYX-Request-ID':id});
    return jsonResponse({ok:true,jobId,appName:job.appName,appSlug:job.appSlug,sourceProjectId:job.sourceProjectId,platforms:job.platforms,payload:job.payload,iconDataUrl:job.iconDataUrl},200,{'X-OVYX-Request-ID':id,'Cache-Control':'private, no-store'});
  }catch(error){
    return jsonResponse({ok:false,error:error?.message||'The mobile build files couldn't be retrieved. Please try again.',code:error?.code||'PAYLOAD_READ_FAILED'},error?.status||500,{'X-OVYX-Request-ID':id});
  }
}
export async function onRequest(context){
  if(context.request.method==='GET')return onRequestGet(context);
  return jsonResponse({ok:false,error:'GET is required.',code:'METHOD_NOT_ALLOWED'},405);
}
