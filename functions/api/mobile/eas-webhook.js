import { getFirestoreData, setFirestoreDocument } from '../../_lib/firebase-admin.js';
import { jsonResponse, requestId } from '../_lib/http.js';

function timingSafeHex(a,b){if(!a||!b||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i+=1)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function extractJobId(message){const match=String(message||'').match(/OVYX_BUILD_JOB:([a-f0-9-]{20,64})/i);return match?.[1]||null;}
async function signBody(secret,body){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']);
  const raw=await crypto.subtle.sign({name:'HMAC'},key,new TextEncoder().encode(body));
  return [...new Uint8Array(raw)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function onRequestPost(context){
  const id=requestId(context.request);
  try{
    const secret=String(context.env.EXPO_WEBHOOK_SECRET||'').trim();
    if(!secret)return jsonResponse({ok:false,error:'EAS webhook secret is not configured.',code:'EAS_WEBHOOK_NOT_CONFIGURED'},503,{'X-OVYX-Request-ID':id});
    const raw=await context.request.text();
    const header=String(context.request.headers.get('expo-signature')||'');
    const expected=`sha1=${await signBody(secret,raw)}`;
    if(!timingSafeHex(header,expected))return jsonResponse({ok:false,error:'Invalid EAS webhook signature.',code:'EAS_WEBHOOK_SIGNATURE_INVALID'},401,{'X-OVYX-Request-ID':id});
    const data=JSON.parse(raw||'{}');
    const jobId=extractJobId(data?.metadata?.message);
    if(!jobId)return new Response('IGNORED',{status:202});
    const job=await getFirestoreData(context.env,'mobile_builds',jobId);
    if(!job)return new Response('UNKNOWN JOB',{status:202});
    const platform=String(data.platform||'').toLowerCase()==='ios'?'ios':'android';
    const finished=String(data.status||'').toLowerCase()==='finished';
    const canceled=String(data.status||'').toLowerCase()==='canceled';
    const buildUrl=String(data?.artifacts?.buildUrl||'');
    const artifacts={...(job.artifacts||{})};
    artifacts[platform]={url:buildUrl,downloadUrl:buildUrl,buildId:String(data.id||''),detailsUrl:String(data.buildDetailsPageUrl||''),version:String(data?.metadata?.appBuildVersion||data?.metadata?.appVersion||''),status:finished?'finished':(canceled?'canceled':'errored'),completedAt:String(data.completedAt||data.updatedAt||new Date().toISOString())};
    const errors=Array.isArray(job.errors)?[...job.errors]:[];
    if(!finished&&data?.error?.message)errors.push({platform,code:String(data.error.errorCode||'EAS_BUILD_FAILED'),message:String(data.error.message)});
    const bothRequestedFinished=(job.platforms||[]).every(p=>{const item=artifacts[p];return item&&(item.status==='finished'||item.status==='canceled');});
    const failed=Object.values(artifacts).some(item=>item?.status==='errored'||item?.status==='canceled');
    const status=bothRequestedFinished?(failed?'failed':'completed'):'building';
    await setFirestoreDocument(context.env,'mobile_builds',jobId,{status,artifacts,errors,updatedAt:new Date().toISOString(),lastWebhookBuildId:String(data.id||''),lastWebhookPlatform:platform},{merge:true});
    return new Response('OK',{status:200,headers:{'X-OVYX-Request-ID':id}});
  }catch(error){
    return jsonResponse({ok:false,error:error?.message||'EAS webhook processing failed.',code:error?.code||'EAS_WEBHOOK_FAILED'},400,{'X-OVYX-Request-ID':id});
  }
}
export async function onRequest(context){
  if(context.request.method==='POST')return onRequestPost(context);
  return jsonResponse({ok:false,error:'POST is required.',code:'METHOD_NOT_ALLOWED'},405);
}
