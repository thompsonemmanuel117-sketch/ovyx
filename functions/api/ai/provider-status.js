import { assertAuthenticated } from '../../_lib/firebase.js';
import { getActiveBrainConnectionId } from '../../_lib/universal-connections.js';
import { errorResponse, requestId } from '../_lib/http.js';

const PROVIDERS = Object.freeze({
  gemini: { env:'GEMINI_API_KEY', label:'Gemini',
    check:key=>fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',{headers:{Accept:'application/json','x-goog-api-key':key}}) },
  deepseek: { env:'DEEPSEEK_API_KEY', label:'DeepSeek',
    check:key=>fetchWithTimeout('https://api.deepseek.com/models',{headers:{Accept:'application/json',Authorization:'Bearer '+key}}) },
  claude: { env:'ANTHROPIC_API_KEY', label:'Claude',
    check:key=>fetchWithTimeout('https://api.anthropic.com/v1/models',{headers:{Accept:'application/json','x-api-key':key,'anthropic-version':'2023-06-01'}}) },
  openai: { env:'OPENAI_API_KEY', label:'OpenAI',
    check:key=>fetchWithTimeout('https://api.openai.com/v1/models',{headers:{Accept:'application/json',Authorization:'Bearer '+key}}) },
  groq: { env:'GROQ_API_KEY', label:'Groq',
    check:key=>fetchWithTimeout('https://api.groq.com/openai/v1/models',{headers:{Accept:'application/json',Authorization:'Bearer '+key}}) },
});
const UNAVAILABLE_MESSAGE = "Try again later, or connect your own AI Brain in Universal Connections to continue building.";

function normalizeProvider(value) {
  const id=String(value||'automatic').trim().toLowerCase();
  if(id==='anthropic')return'claude';
  if(id==='chatgpt'||id==='gpt')return'openai';
  if(id==='cloudflare'||id==='workers-ai')return'cloudflare-workers-ai';
  return id||'automatic';
}
function statusMessage(label,status) {
  if(status==='NOT_CONFIGURED')return label+" isn't available right now because its API key isn't connected. "+UNAVAILABLE_MESSAGE;
  if(status==='AUTH_FAILED')return label+" isn't available right now because its API key was rejected. Check the existing server setting, try again later, or connect your own AI Brain in Universal Connections to continue building.";
  if(status==='INSUFFICIENT_CREDITS')return label+" isn't available right now because its provider account has no available credits. Try again later, or connect your own AI Brain in Universal Connections to continue building.";
  if(status==='RATE_LIMITED')return label+" is temporarily busy. Try again shortly, or connect your own AI Brain in Universal Connections to continue building.";
  return label+" isn't available right now. "+UNAVAILABLE_MESSAGE;
}
async function fetchWithTimeout(url,init={},timeoutMs=6000) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(url,{...init,method:'GET',signal:controller.signal})}
  catch(error){if(error?.name==='AbortError'){const e=new Error('Provider health check timed out.');e.code='AI_PROVIDER_TIMEOUT';throw e;}throw error}
  finally{clearTimeout(timer)}
}
async function checkOneProvider(id,env) {
  const config=PROVIDERS[id];
  if(!config)return{provider:id,label:'Selected AI provider',status:'UNAVAILABLE',configured:false,connected:false,message:"This AI provider isn't available right now. "+UNAVAILABLE_MESSAGE};
  const key=String(env?.[config.env]||'').trim();
  if(!key)return{provider:id,label:config.label,status:'NOT_CONFIGURED',configured:false,connected:false,message:statusMessage(config.label,'NOT_CONFIGURED')};
  try {
    const response=await config.check(key);
    const status=response.ok?'READY':response.status===401||response.status===403?'AUTH_FAILED':response.status===402?'INSUFFICIENT_CREDITS':response.status===429?'RATE_LIMITED':'UNAVAILABLE';
    return{provider:id,label:config.label,status,configured:true,connected:response.ok,httpStatus:response.status,
      message:response.ok?config.label+' is connected and ready. OVYX will use only this provider for an explicit selection.':statusMessage(config.label,status)};
  } catch(error) {
    const status=error?.code==='AI_PROVIDER_TIMEOUT'||error?.name==='AbortError'?'TIMEOUT':'UNAVAILABLE';
    return{provider:id,label:config.label,status,configured:true,connected:false,message:statusMessage(config.label,status)};
  }
}
export async function probePlatformProvider(value,env={}) {
  const id=normalizeProvider(value);
  if(id==='automatic') {
    const rows=await Promise.all(Object.keys(PROVIDERS).map(provider=>checkOneProvider(provider,env)));
    if(env?.AI&&typeof env.AI.run==='function')rows.push({provider:'cloudflare-workers-ai',label:'Cloudflare Workers AI',status:'READY',configured:true,connected:true,message:'Cloudflare Workers AI is connected and ready.'});
    const ready=rows.filter(row=>row.connected);
    return{provider:'automatic',label:'Automatic',status:ready.length?'READY':'UNAVAILABLE',configured:rows.some(row=>row.configured),connected:ready.length>0,providers:rows,
      message:ready.length?'Automatic routing has at least one connected AI provider. OVYX will use configured providers in its saved order.':"No platform AI provider is available right now. "+UNAVAILABLE_MESSAGE};
  }
  if(id==='cloudflare-workers-ai') {
    const connected=Boolean(env?.AI&&typeof env.AI.run==='function');
    return{provider:id,label:'Cloudflare Workers AI',status:connected?'READY':'NOT_CONFIGURED',configured:connected,connected,
      message:connected?'Cloudflare Workers AI is connected and ready.':"Cloudflare Workers AI isn't available right now because the Cloudflare AI binding isn't connected. "+UNAVAILABLE_MESSAGE};
  }
  return checkOneProvider(id,env);
}
export async function onRequestGet(context) {
  const id=requestId(context.request);
  try {
    const user=assertAuthenticated(context.data?.user);
    let activeBrainId=null;
    try{activeBrainId=await getActiveBrainConnectionId(context.env,user)}
    catch{return errorResponse(503,'UNIVERSAL_CONNECTION_SELECTION_FAILED','OVYX could not confirm your selected AI Brain. Try again later; it will not switch to a platform provider automatically.',id)}
    const requested=normalizeProvider(new URL(context.request.url).searchParams.get('provider'));
    if(activeBrainId)return Response.json({
      ok:true,provider:requested,source:'universal-connection',status:'SELECTED',configured:true,connected:true,label:'Your saved Universal Connection',
      message:'Your saved Universal Connection is still the active AI Brain. OVYX will use it exclusively. To use platform AI keys, clear AI Brain in Universal Connections first.'
    },{headers:{'Cache-Control':'no-store','X-OVYX-Request-ID':id}});
    const result=await probePlatformProvider(requested,context.env);
    return Response.json({ok:true,source:'platform',...result},{headers:{'Cache-Control':'no-store','X-OVYX-Request-ID':id}});
  } catch(error){return errorResponse(error.status||500,error.code||'AI_PROVIDER_STATUS_FAILED',error.message||'AI provider status could not be checked.',id)}
}
export async function onRequest(context) {
  if(context.request.method==='GET')return onRequestGet(context);
  return errorResponse(405,'METHOD_NOT_ALLOWED','GET is required.',requestId(context.request));
}
