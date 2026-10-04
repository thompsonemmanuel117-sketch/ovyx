import { authenticateRequest } from '../_lib/firebase.js';
import {
  getFirestoreDocument,
  getFirestoreData,
  getFirestoreDocumentAtPath,
  getFirestoreDataAtPath,
  setFirestoreDocumentAtPath,
  deleteFirestoreDocumentAtPath,
  listFirestoreSubcollectionDocuments,
} from './_lib/firebase-admin.js';
import { readJson, jsonResponse, requestId } from './_lib/http.js';

const MAX_PROJECT_BYTES = 950_000;

function clean(value,max=320){return String(value??'').trim().slice(0,max);}
function projectId(value){
  const id=clean(value,120);
  if(!/^[A-Za-z0-9_-]{1,120}$/.test(id))throw Object.assign(new Error('Project ID is invalid.'),{status:400,code:'INVALID_PROJECT_ID'});
  return id;
}
function payload(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Object.assign(new Error('A project object is required.'),{status:400,code:'PROJECT_REQUIRED'});
  const copy=JSON.parse(JSON.stringify(value));
  delete copy.ownerUid;delete copy.ownerEmail;
  return copy;
}
function pathFor(email,id){return `users/${email}/projects/${id}`;}

export async function onRequest(context){
  const id=requestId(context.request);
  try{
    const user=context.data?.user||await authenticateRequest(context.request,context.env);
    const uid=clean(user?.uid||user?.sub);
    const email=clean(user?.email,320).toLowerCase();
    if(!uid||!email)throw Object.assign(new Error('Authenticated email is required.'),{status:401,code:'EMAIL_REQUIRED'});

    const method=context.request.method.toUpperCase();
    if(method==='GET'){
      const rows=await listFirestoreSubcollectionDocuments(context.env,'users',email,'projects',100);
      const projects=rows.map(item=>{const p=item.data||{};return {...p,id:item.id};}).filter(p=>clean(p.ownerUid)===uid&&clean(p.ownerEmail).toLowerCase()===email);
      return jsonResponse({ok:true,projects,owner:{uid,email}},200,{'X-OVYX-Request-ID':id});
    }
    if(method==='DELETE'){
      const url=new URL(context.request.url);const pid=projectId(url.searchParams.get('projectId'));
      const existingDoc=await getFirestoreDocumentAtPath(context.env,['users',email,'projects',pid]);
      const existing=existingDoc?await getFirestoreDataAtPath(context.env,['users',email,'projects',pid]):null;
      if(!existing||clean(existing.ownerUid)!==uid||clean(existing.ownerEmail).toLowerCase()!==email)throw Object.assign(new Error('Project not found.'),{status:404,code:'PROJECT_NOT_FOUND'});
      await deleteFirestoreDocumentAtPath(context.env,['users',email,'projects',pid],existingDoc?.updateTime);
      return jsonResponse({ok:true,deleted:true,projectId:pid},200,{'X-OVYX-Request-ID':id});
    }
    if(method==='POST'){
      const body=await readJson(context.request,MAX_PROJECT_BYTES);
      const pid=projectId(body.projectId||body.project?.id||crypto.randomUUID().replace(/-/g,'').slice(0,24));
      const project=payload(body.project||body.data);
      const existingDoc=await getFirestoreDocumentAtPath(context.env,['users',email,'projects',pid]);
      const existing=existingDoc?await getFirestoreDataAtPath(context.env,['users',email,'projects',pid]):null;
      if(existing && (clean(existing.ownerUid)!==uid||clean(existing.ownerEmail).toLowerCase()!==email))throw Object.assign(new Error('Project ownership conflict.'),{status:409,code:'PROJECT_OWNERSHIP_CONFLICT'});
      const now=new Date().toISOString();
      const brandProfile=await getFirestoreDataAtPath(context.env,['users',email,'brand_profile','config']).catch(()=>null);
      const stored={
        ...project,
        id:pid,
        ownerUid:uid,
        ownerEmail:email,
        brandProfileVersion:Number(brandProfile?.version||0)||0,
        brandProfileUpdatedAt:brandProfile?.updatedAt||null,
        createdAt:existing?.createdAt||now,
        updatedAt:now
      };
      await setFirestoreDocumentAtPath(context.env,['users',email,'projects',pid],stored,{merge:false,expectedUpdateTime:existingDoc?.updateTime||null});
      return jsonResponse({ok:true,project:{...stored}},200,{'X-OVYX-Request-ID':id});
    }
    return jsonResponse({ok:false,error:'GET, POST or DELETE is required.',code:'METHOD_NOT_ALLOWED'},405,{'X-OVYX-Request-ID':id});
  }catch(error){
    return jsonResponse({ok:false,error:error?.message||'Project request failed.',code:error?.code||'PROJECTS_FAILED'},error?.status||500,{'X-OVYX-Request-ID':id});
  }
}
