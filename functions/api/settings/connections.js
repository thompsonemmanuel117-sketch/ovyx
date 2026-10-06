'use strict';

const { verifyFirebaseIdToken } = require('../_lib/auth.js');
const {
  getFirestoreDocumentAtPath,
  getFirestoreDataAtPath,
  setFirestoreDocumentAtPath,
  deleteFirestoreDocumentAtPath,
  listFirestoreSubcollectionDocuments
} = require('../../_lib/firebase-admin.js');
const { errorResponse, jsonResponse } = require('../_lib/http.js');

const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';
const LIMITS = Object.freeze({ free: 3, pro: 5, max: Infinity });
const ALLOWED_TYPES = new Set(['ai', 'tool', 'service', 'webhook', 'database']);
const ALLOWED_AUTH = new Set(['none', 'bearer', 'api-key', 'custom-header']);
const ALLOWED_PROTOCOLS = new Set(['openai-chat', 'generic-json']);
const CONNECTION_KEY = 'OVYX_CONNECTION_ENCRYPTION_KEY';

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}
function uidOf(user){return clean(user?.uid || user?.sub,180);}
function emailOf(user){return clean(user?.email,320).toLowerCase();}

function activeTier(profile, userEmail){
  if(userEmail === ROOT_EMAIL)return 'max';
  const state=clean(profile?.planTierState,60).toLowerCase();
  if(['expired','refunded','chargeback','suspended','canceled'].includes(state))return 'free';
  const tier=clean(profile?.planTier||profile?.tier||profile?.plan||'free',20).toLowerCase();
  return ['pro','max'].includes(tier)?tier:'free';
}
function limitFor(tier){return LIMITS[tier] ?? 3;}

function connectionId(value){
  const id=clean(value,100);
  if(!id)return crypto.randomUUID().replace(/-/g,'').slice(0,28);
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))throw Object.assign(new Error('Connection ID is invalid.'),{status:400,code:'INVALID_CONNECTION_ID'});
  return id;
}

function normalizeHttpsUrl(value){
  const raw=clean(value,1600);
  if(!raw)throw Object.assign(new Error('A real HTTPS endpoint is required.'),{status:400,code:'CONNECTION_ENDPOINT_REQUIRED'});
  let parsed;
  try{parsed=new URL(raw)}catch{throw Object.assign(new Error('Connection endpoint must be a valid URL.'),{status:400,code:'INVALID_CONNECTION_URL'});}
  if(parsed.protocol!=='https:')throw Object.assign(new Error('Universal connection endpoints must use HTTPS.'),{status:400,code:'HTTPS_REQUIRED'});
  return parsed.toString();
}

function encryptionKeyBytes(secret){
  const raw=String(secret||'').trim();
  if(raw.length<32)throw Object.assign(new Error('OVYX_CONNECTION_ENCRYPTION_KEY is not configured with at least 32 characters.'),{status:503,code:'CONNECTION_ENCRYPTION_NOT_CONFIGURED'});
  return crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
}
async function deriveKey(secret){
  return crypto.subtle.importKey('raw',await encryptionKeyBytes(secret),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
function b64(bytes){
  let s='';for(const b of bytes)s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function unb64(value){
  const s=String(value).replace(/-/g,'+').replace(/_/g,'/');
  const p=s+'='.repeat((4-s.length%4)%4);
  const bin=atob(p);const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  return bytes;
}
async function encryptSecret(secret,env){
  const plain=String(secret||'');
  if(!plain)return null;
  const key=await deriveKey(env[CONNECTION_KEY]);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(plain));
  return {version:1,algorithm:'AES-GCM',iv:b64(iv),ciphertext:b64(new Uint8Array(data))};
}
async function decryptSecret(record,env){
  if(!record?.ciphertext)return '';
  const key=await deriveKey(env[CONNECTION_KEY]);
  const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(record.iv)},key,unb64(record.ciphertext));
  return new TextDecoder().decode(data);
}
function sanitizeAuth(body){
  const authType=clean(body?.authType||'none',30).toLowerCase();
  if(!ALLOWED_AUTH.has(authType))throw Object.assign(new Error('Unsupported connection authentication mode.'),{status:400,code:'INVALID_CONNECTION_AUTH'});
  const headerName=clean(body?.authHeaderName||'',80);
  if(authType==='custom-header'&&(!/^[A-Za-z0-9-]{1,80}$/.test(headerName)))throw Object.assign(new Error('Custom authentication header name is invalid.'),{status:400,code:'INVALID_AUTH_HEADER'});
  return {authType,authHeaderName:headerName};
}
function sanitizeConnection(body,owner){
  const type=clean(body?.type||'service',30).toLowerCase();
  if(!ALLOWED_TYPES.has(type))throw Object.assign(new Error('Connection type must be AI Brain, tool, service, webhook or database.'),{status:400,code:'INVALID_CONNECTION_TYPE'});
  const name=clean(body?.name,120);
  if(!name)throw Object.assign(new Error('Connection name is required.'),{status:400,code:'CONNECTION_NAME_REQUIRED'});
  const endpoint=normalizeHttpsUrl(body?.endpoint||body?.healthUrl);
  const auth=sanitizeAuth(body);
  const protocol=type==='ai'?clean(body?.protocol||'openai-chat',40).toLowerCase():'generic-json';
  if(type==='ai'&&!ALLOWED_PROTOCOLS.has(protocol))throw Object.assign(new Error('Unsupported AI connection protocol.'),{status:400,code:'INVALID_AI_PROTOCOL'});
  return {
    name,type,endpoint,healthUrl:normalizeHttpsUrl(body?.healthUrl||endpoint),
    active:body?.active!==false,
    protocol,
    model:clean(body?.model,160),
    authType:auth.authType,
    authHeaderName:auth.authHeaderName,
    capabilities:Array.isArray(body?.capabilities)?body.capabilities.map(x=>clean(x,60)).filter(Boolean).slice(0,20):[],
    ownerUid:owner.uid,
    ownerEmail:owner.email,
    updatedAt:new Date().toISOString()
  };
}
function publicConnection(row){
  const cleanRow={...row};
  delete cleanRow.encryptedSecret;
  return {...cleanRow,hasSecret:Boolean(row?.encryptedSecret)};
}
async function identity(request,env){
  const result=await verifyFirebaseIdToken(request,env);
  if(!result.ok)return result;
  const uid=uidOf(result.user),email=emailOf(result.user);
  if(!uid||!email)return {ok:false,response:errorResponse(401,'AUTH_IDENTITY_REQUIRED','A verified Firebase identity is required.')};
  return {ok:true,user:result.user,uid,email};
}
async function loadContext(env,uid,email){
  const profile=await getFirestoreDataAtPath(env,['users',uid])||{};
  const tier=activeTier(profile,email),limit=limitFor(tier);
  const rows=await listFirestoreSubcollectionDocuments(env,'users',uid,'universal_connections',100);
  const connections=rows.map(row=>({...publicConnection(row.data||{}),id:row.id}));
  const active=connections.filter(x=>x.active===true);
  return {profile,tier,limit,connections,active};
}
async function changeActiveCount(env,uid,delta,limit){
  if(limit===Infinity||delta===0)return {ok:true,count:null,changed:false};
  for(let attempt=0;attempt<8;attempt++){
    const userDoc=await getFirestoreDocumentAtPath(env,['users',uid]);
    if(!userDoc)throw Object.assign(new Error('The authenticated OVYX workspace profile is not initialized yet.'),{status:409,code:'WORKSPACE_PROFILE_REQUIRED'});
    const profile=await getFirestoreDataAtPath(env,['users',uid])||{};
    let current=Number.isSafeInteger(Number(profile.universalConnectionsActiveCount))?Number(profile.universalConnectionsActiveCount):null;
    if(current===null||current<0){
      const rows=await listFirestoreSubcollectionDocuments(env,'users',uid,'universal_connections',100);
      current=rows.filter(row=>row?.data?.active===true).length;
    }
    const next=Math.max(0,current+delta);
    if(delta>0&&next>limit)return {ok:false,count:current,changed:false};
    try{
      await setFirestoreDocumentAtPath(env,['users',uid],{universalConnectionsActiveCount:next},{merge:true,expectedUpdateTime:userDoc.updateTime});
      return {ok:true,count:next,changed:true};
    }catch(error){
      if(error?.status===409||error?.code==='FIRESTORE_PRECONDITION_FAILED')continue;
      throw error;
    }
  }
  throw Object.assign(new Error('The universal connection limit changed concurrently. Please retry.'),{status:409,code:'CONNECTION_LIMIT_CONFLICT'});
}
async function testEndpoint(url){
  const c=new AbortController(),timer=setTimeout(()=>c.abort(),7000),started=Date.now();
  try{const r=await fetch(url,{method:'HEAD',redirect:'manual',signal:c.signal,headers:{'User-Agent':'OVYX-Connection-Check/2.0'}});
    return {ok:r.status>=200&&r.status<500,status:r.status,latencyMs:Date.now()-started};
  }finally{clearTimeout(timer);}
}
function extractText(value){
  if(value==null)return '';
  if(typeof value==='string')return value;
  if(Array.isArray(value))return value.map(extractText).join('');
  if(typeof value==='object'){
    if(typeof value.output_text==='string')return value.output_text;
    if(typeof value.text==='string')return value.text;
    const choice=value.choices?.[0]?.message?.content;
    if(choice)return extractText(choice);
    if(Array.isArray(value.content))return extractText(value.content);
    for(const k of ['output','response','result','message'])if(k in value){const t=extractText(value[k]);if(t)return t;}
  }
  return '';
}
async function runExternal(row,body,env){
  const secret=await decryptSecret(row.encryptedSecret,env).catch(error=>{throw Object.assign(new Error('The connection credential could not be decrypted. Check OVYX_CONNECTION_ENCRYPTION_KEY.'),{status:503,code:'CONNECTION_SECRET_UNAVAILABLE',cause:error});});
  const headers=new Headers({'Accept':'application/json','Content-Type':'application/json','User-Agent':'OVYX-Universal-Connection/1.0'});
  if(row.authType==='bearer'&&secret)headers.set('Authorization','Bearer '+secret);
  else if(row.authType==='api-key'&&secret)headers.set('X-API-Key',secret);
  else if(row.authType==='custom-header'&&secret)headers.set(row.authHeaderName,secret);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    let payload;
    if(row.type==='ai'){
      const messages=Array.isArray(body.messages)&&body.messages.length?body.messages:[{role:'user',content:clean(body.prompt||body.message,30000)}];
      if(row.protocol==='openai-chat'){
        payload={model:clean(body.model||row.model,160)||undefined,messages};
        if(body.system)payload.messages=[{role:'system',content:clean(body.system,30000)},...messages];
        if(Number.isFinite(Number(body.maxTokens)))payload.max_tokens=Math.min(Math.max(Number(body.maxTokens),64),32000);
      }else{
        payload={messages,model:clean(body.model||row.model,160),system:clean(body.system,30000),context:body.context&&typeof body.context==='object'?body.context:null};
      }
    }else{
      payload=body.payload!==undefined?body.payload:{input:body.input??null,context:body.context??null};
    }
    const response=await fetch(row.endpoint,{method:'POST',redirect:'manual',headers,signal:controller.signal,body:JSON.stringify(payload)});
    const text=await response.text();
    if(!response.ok)throw Object.assign(new Error('Connected service returned HTTP '+response.status+'.'),{status:502,code:'CONNECTION_UPSTREAM_FAILED',upstreamStatus:response.status});
    if(text.length>500000)throw Object.assign(new Error('Connected service response is too large.'),{status:502,code:'CONNECTION_RESPONSE_TOO_LARGE'});
    let data=null;try{data=text?JSON.parse(text):null}catch{data=text;}
    return {ok:true,data,text:typeof data==='string'?data:undefined,outputText:extractText(data)};
  }finally{clearTimeout(timer);}
}
async function onRequest(context){
  const request=context.request,auth=await identity(request,context.env);
  if(!auth.ok)return auth.response;
  const base=['users',auth.uid,'universal_connections'];
  try{
    const state=await loadContext(context.env,auth.uid,auth.email);
    if(request.method==='GET')return jsonResponse({ok:true,tier:state.tier,limit:state.limit===Infinity?null:state.limit,activeCount:state.active.length,totalCount:state.connections.length,connections:state.connections});
    if(request.method==='DELETE'){
      const id=connectionId(new URL(request.url).searchParams.get('id'));
      const record=await getFirestoreDataAtPath(context.env,[...base,id]);
      const doc=await getFirestoreDocumentAtPath(context.env,[...base,id]);
      if(!record||!doc)return errorResponse(404,'CONNECTION_NOT_FOUND','Connection not found.');
      if(record.ownerUid!==auth.uid)return errorResponse(403,'CONNECTION_ACCESS_DENIED','Connection does not belong to this account.');
      if(record.active===true){
        const reservation=await changeActiveCount(context.env,auth.uid,-1,state.limit);
        if(!reservation.ok)return errorResponse(409,'CONNECTION_LIMIT_CONFLICT','The universal connection state changed concurrently. Please retry.');
      }
      await deleteFirestoreDocumentAtPath(context.env,[...base,id],doc.updateTime);
      return jsonResponse({ok:true,deleted:true,id});
    }
    if(request.method!=='POST'&&request.method!=='PUT')return errorResponse(405,'METHOD_NOT_ALLOWED','GET, POST, PUT or DELETE is required.');
    const body=await request.json();
    const action=clean(body?.action,30).toLowerCase();
    const id=connectionId(body?.id);
    const currentRecord=await getFirestoreDataAtPath(context.env,[...base,id]);
    const currentDoc=await getFirestoreDocumentAtPath(context.env,[...base,id]);
    if(action==='test'){
      if(!currentRecord||currentRecord.ownerUid!==auth.uid)return errorResponse(404,'CONNECTION_NOT_FOUND','Connection not found.');
      const result=await testEndpoint(currentRecord.healthUrl||currentRecord.endpoint);
      await setFirestoreDocumentAtPath(context.env,[...base,id],{lastTestAt:new Date().toISOString(),lastTestStatus:result.ok?'reachable':'unreachable',lastTestHttpStatus:result.status,lastTestLatencyMs:result.latencyMs},{merge:true});
      return jsonResponse({ok:result.ok,test:result,id});
    }
    if(action==='run'){
      if(!currentRecord||currentRecord.ownerUid!==auth.uid||currentRecord.active!==true)return errorResponse(404,'CONNECTION_NOT_AVAILABLE','Active connection not found.');
      const result=await runExternal(currentRecord,body,context.env);
      return jsonResponse({ok:true,id,connectionType:currentRecord.type,outputText:result.outputText||null,data:result.data??null,text:result.text||null,serverAuthoritative:true});
    }

    const next=sanitizeConnection(body,{uid:auth.uid,email:auth.email});
    let encryptedSecret=currentRecord?.encryptedSecret||null;
    if(body.secret!==undefined&&String(body.secret||'').trim())encryptedSecret=await encryptSecret(String(body.secret),context.env);

    const wasActive=currentRecord?.active===true,nextActive=next.active===true;
    let reservation=null;
    if(nextActive&&!wasActive){
      reservation=await changeActiveCount(context.env,auth.uid,1,state.limit);
      if(!reservation.ok){
        const label=state.tier==='free'?'Free Trial':state.tier==='pro'?'Pro Plan':'Max Plan';
        return jsonResponse({ok:false,error:'CONNECTION_LIMIT_REACHED',code:'CONNECTION_LIMIT_REACHED',message:'Your '+label+' allows '+(state.limit===Infinity?'unlimited':state.limit)+' active universal connections.',tier:state.tier,limit:state.limit===Infinity?null:state.limit,activeCount:reservation.count,upgradeRequired:state.tier!=='max'},409);
      }
    }else if(!nextActive&&wasActive){
      await changeActiveCount(context.env,auth.uid,-1,state.limit);
    }

    try{
      await setFirestoreDocumentAtPath(context.env,[...base,id],{...next,encryptedSecret,createdAt:currentRecord?.createdAt||new Date().toISOString()},{merge:true,expectedUpdateTime:currentDoc?.updateTime||null});
    }catch(error){
      if(reservation?.changed){try{await changeActiveCount(context.env,auth.uid,-1,state.limit)}catch{}}
      throw error;
    }

    const latest=await getFirestoreDataAtPath(context.env,[...base,id]);
    return jsonResponse({ok:true,connection:publicConnection({...latest,id}),tier:state.tier,limit:state.limit===Infinity?null:state.limit});
  }catch(error){
    return errorResponse(error?.status||500,error?.code||'UNIVERSAL_CONNECTIONS_FAILED',error?.message||'Universal connection operation failed.');
  }
}
module.exports={onRequest};
